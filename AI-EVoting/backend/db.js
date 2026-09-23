require('dotenv').config()
const bcrypt = require('bcrypt')

const useSqlite = process.env.USE_SQLITE === 'true' || (!process.env.DATABASE_URL && !process.env.DB_HOST && !process.env.DB_USER && !process.env.DB_NAME && !process.env.DB_PASSWORD)

if (useSqlite) {
  const path = require('path')
  const sqlite3 = require('sqlite3').verbose()
  const dbFile = path.resolve(__dirname, 'ai_evoting.sqlite')

  const db = new sqlite3.Database(dbFile)

  const schemaSql = `
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      has_voted INTEGER DEFAULT 0,
      role TEXT DEFAULT 'voter',
      verified INTEGER DEFAULT 1,
      biometric_credential_id TEXT,
      biometric_public_key TEXT,
      biometric_counter INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      party TEXT,
      photo_url TEXT,
      manifesto TEXT,
      election_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS elections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      start_date DATETIME,
      end_date DATETIME,
      status TEXT DEFAULT 'upcoming',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      candidate_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(candidate_id) REFERENCES candidates(id)
    );

    CREATE TABLE IF NOT EXISTS fraud_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      prediction TEXT,
      login_attempts INTEGER,
      failed_logins INTEGER,
      votes_per_minute INTEGER,
      ip_changes INTEGER,
      device_changes INTEGER,
      session_duration INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      login_attempts INTEGER DEFAULT 0,
      failed_logins INTEGER DEFAULT 0,
      votes_per_minute INTEGER DEFAULT 0,
      ip_changes INTEGER DEFAULT 0,
      device_changes INTEGER DEFAULT 0,
      session_duration INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `

  const ensureDefaultUser = (email, password, name, role, phone) => {
    db.get("SELECT id FROM users WHERE email = ? LIMIT 1", [email], (lookupErr, row) => {
      if (lookupErr) {
        console.error('SQLite user check failed:', lookupErr)
        return
      }

      if (row) {
        console.log(`Default ${role} already exists: ${email}`)
        return
      }

      bcrypt.hash(password, 10).then((hash) => {
        db.run(
          "INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)",
          [name, email, phone, hash, role],
          (insertErr) => {
            if (insertErr) {
              console.error(`SQLite default ${role} creation failed:`, insertErr)
              return
            }

            console.log(`Default ${role} created: ${email} / ${password}`)
          }
        )
      }).catch((hashErr) => {
        console.error(`Hashing default ${role} password failed:`, hashErr)
      })
    })
  }

  const ensureDefaultAdmin = () => {
    ensureDefaultUser('admin@example.com', 'AdminPass123', 'Admin User', 'admin', '+15551234567')
    ensureDefaultUser('voter@example.com', 'VoterPass123', 'Demo Voter', 'voter', '+15557654321')
  }

  db.exec(schemaSql, (err) => {
    if (err) {
      console.error('SQLite schema init failed:', err)
      return
    }

    db.all('PRAGMA table_info(users)', [], (pragmaErr, columns) => {
      if (pragmaErr) {
        console.error('SQLite schema migration check failed:', pragmaErr)
        return
      }

      const existingColumns = new Set((columns || []).map((col) => col.name))
      const migrations = []

      if (!existingColumns.has('phone')) migrations.push("ALTER TABLE users ADD COLUMN phone TEXT")
      if (!existingColumns.has('role')) migrations.push("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'voter'")
      if (!existingColumns.has('verified')) migrations.push("ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 1")
      if (!existingColumns.has('biometric_credential_id')) migrations.push("ALTER TABLE users ADD COLUMN biometric_credential_id TEXT")
      if (!existingColumns.has('biometric_public_key')) migrations.push("ALTER TABLE users ADD COLUMN biometric_public_key TEXT")
      if (!existingColumns.has('biometric_counter')) migrations.push("ALTER TABLE users ADD COLUMN biometric_counter INTEGER DEFAULT 0")

      const runMigration = () => {
        if (migrations.length === 0) {
          db.run("CREATE TABLE IF NOT EXISTS elections (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, start_date DATETIME, end_date DATETIME, status TEXT DEFAULT 'upcoming', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)", (electionErr) => {
            if (electionErr) {
              console.error('SQLite elections migration failed:', electionErr)
              return
            }

            db.all('PRAGMA table_info(candidates)', [], (candidatePragmaErr, candidateColumns) => {
              if (candidatePragmaErr) {
                console.error('SQLite candidates migration check failed:', candidatePragmaErr)
                return
              }

              const candidateColumnNames = new Set((candidateColumns || []).map((col) => col.name))
              const candidateMigrations = []
              if (!candidateColumnNames.has('photo_url')) candidateMigrations.push("ALTER TABLE candidates ADD COLUMN photo_url TEXT")
              if (!candidateColumnNames.has('manifesto')) candidateMigrations.push("ALTER TABLE candidates ADD COLUMN manifesto TEXT")
              if (!candidateColumnNames.has('election_id')) candidateMigrations.push("ALTER TABLE candidates ADD COLUMN election_id INTEGER")

              const runCandidateMigration = () => {
                if (candidateMigrations.length === 0) {
                  console.log('SQLite DB file:', dbFile)
                  ensureDefaultAdmin()
                  return
                }

                db.run(candidateMigrations.shift(), (candidateMigrationErr) => {
                  if (candidateMigrationErr) {
                    console.error('SQLite candidate migration failed:', candidateMigrationErr)
                    return
                  }
                  runCandidateMigration()
                })
              }

              runCandidateMigration()
            })
          })
          return
        }

        const migrationSql = migrations.shift()
        db.run(migrationSql, (migrationErr) => {
          if (migrationErr) {
            console.error('SQLite migration failed:', migrationErr)
            return
          }
          runMigration()
        })
      }

      runMigration()
    })
  })

  const pool = {
    query: (text, params) => {
      return new Promise((resolve, reject) => {
        const sqliteText = text.replace(/\$\d+/g, '?')
        const trimmed = sqliteText.trim().toLowerCase()

        if (trimmed.startsWith('select')) {
          db.all(sqliteText, params || [], (err, rows) => {
            if (err) return reject(err)
            resolve({ rows })
          })
        } else {
          db.run(sqliteText, params || [], function (err) {
            if (err) return reject(err)
            if (/returning\s+id/i.test(text)) {
              resolve({ rowCount: this.changes, rows: [{ id: this.lastID }] })
            } else {
              resolve({ rowCount: this.changes, rows: [] })
            }
          })
        }
      })
    },
    connect: async () => {
      return {
        query: (text, params) => pool.query(text, params),
        release: () => {},
        begin: () => pool.query('BEGIN'),
        commit: () => pool.query('COMMIT'),
        rollback: () => pool.query('ROLLBACK')
      }
    },
    getClient: async () => {
      return pool.connect()
    }
  }

  module.exports = pool
} else {
  const { Pool } = require('pg')

  const connectionString = process.env.DATABASE_URL

  const pool = new Pool(
    connectionString
      ? {
          connectionString,
          ssl: { rejectUnauthorized: false }
        }
      : {
          user: process.env.DB_USER,
          host: process.env.DB_HOST,
          database: process.env.DB_NAME,
          password: process.env.DB_PASSWORD,
          port: process.env.DB_PORT,
        }
  )

  module.exports = pool
}
