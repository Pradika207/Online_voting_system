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
      election_id INTEGER,
      active INTEGER DEFAULT 1,
      is_nota INTEGER DEFAULT 0,
      FOREIGN KEY(election_id) REFERENCES elections(id),
      UNIQUE(election_id, name)
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

    CREATE TABLE IF NOT EXISTS election_eligibility (
      voter_id INTEGER NOT NULL,
      election_id INTEGER NOT NULL,
      eligible INTEGER DEFAULT 1,
      voted_at DATETIME,
      PRIMARY KEY (voter_id, election_id),
      FOREIGN KEY(voter_id) REFERENCES users(id),
      FOREIGN KEY(election_id) REFERENCES elections(id)
    );

    CREATE TABLE IF NOT EXISTS voting_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT UNIQUE NOT NULL,
      voter_id INTEGER NOT NULL,
      election_id INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(voter_id) REFERENCES users(id),
      FOREIGN KEY(election_id) REFERENCES elections(id)
    );

    CREATE TABLE IF NOT EXISTS ballots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      election_id INTEGER NOT NULL,
      iv TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      ballot_hash TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(election_id) REFERENCES elections(id)
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
      prev_hash TEXT,
      event_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_chain_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_event_id INTEGER,
      last_event_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voter_id INTEGER NOT NULL,
      election_id INTEGER NOT NULL,
      receipt_hash TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(voter_id) REFERENCES users(id),
      FOREIGN KEY(election_id) REFERENCES elections(id),
      UNIQUE(voter_id, election_id)
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

  const tableMigrations = {
    users: [
      { name: 'phone', type: 'TEXT' },
      { name: 'role', type: "TEXT DEFAULT 'voter'" },
      { name: 'verified', type: 'INTEGER DEFAULT 1' },
      { name: 'biometric_credential_id', type: 'TEXT' },
      { name: 'biometric_public_key', type: 'TEXT' },
      { name: 'biometric_counter', type: 'INTEGER DEFAULT 0' },
    ],
    candidates: [
      { name: 'photo_url', type: 'TEXT' },
      { name: 'manifesto', type: 'TEXT' },
      { name: 'election_id', type: 'INTEGER' },
      { name: 'active', type: 'INTEGER DEFAULT 1' },
      { name: 'is_nota', type: 'INTEGER DEFAULT 0' },
    ],
    elections: [
      { name: 'start_date', type: 'DATETIME' },
      { name: 'end_date', type: 'DATETIME' },
      { name: 'status', type: "TEXT DEFAULT 'upcoming'" },
      { name: 'created_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
    ],
    election_eligibility: [
      { name: 'eligible', type: 'INTEGER DEFAULT 1' },
      { name: 'voted_at', type: 'DATETIME' },
    ],
    voting_tokens: [
      { name: 'token_hash', type: 'TEXT' },
      { name: 'voter_id', type: 'INTEGER NOT NULL' },
      { name: 'election_id', type: 'INTEGER NOT NULL' },
      { name: 'expires_at', type: 'DATETIME NOT NULL' },
      { name: 'used_at', type: 'DATETIME' },
      { name: 'created_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
    ],
    ballots: [
      { name: 'iv', type: 'TEXT NOT NULL' },
      { name: 'ciphertext', type: 'TEXT NOT NULL' },
      { name: 'auth_tag', type: 'TEXT NOT NULL' },
      { name: 'ballot_hash', type: 'TEXT UNIQUE NOT NULL' },
      { name: 'created_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
    ],
    audit_logs: [
      { name: 'prev_hash', type: 'TEXT' },
      { name: 'event_hash', type: 'TEXT' },
    ],
    receipts: [
      { name: 'receipt_hash', type: 'TEXT UNIQUE NOT NULL' },
      { name: 'created_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
    ],
  }

  const applyTableMigrations = (tableNames, index) => {
    if (index >= tableNames.length) {
      db.run("CREATE TABLE IF NOT EXISTS audit_chain_state (id INTEGER PRIMARY KEY CHECK (id = 1), last_event_id INTEGER, last_event_hash TEXT)")
      db.run("CREATE UNIQUE INDEX IF NOT EXISTS candidates_election_name ON candidates(election_id, name)")
      db.run("CREATE INDEX IF NOT EXISTS ballots_election_lookup ON ballots(election_id)")
      db.run("CREATE INDEX IF NOT EXISTS eligibility_voter_election_lookup ON election_eligibility(voter_id, election_id)")
      db.run("CREATE INDEX IF NOT EXISTS tokens_lookup ON voting_tokens(token_hash, voter_id, election_id)")
      db.run("CREATE INDEX IF NOT EXISTS receipts_voter_lookup ON receipts(voter_id, election_id)")
      db.run("INSERT OR IGNORE INTO election_eligibility (voter_id, election_id) SELECT u.id, e.id FROM users u CROSS JOIN elections e WHERE u.role = 'voter'", (seedErr) => {
        if (seedErr) {
          console.error('SQLite eligibility seed failed:', seedErr)
          return
        }
        ensureDefaultAdmin()
      })
      return
    }

    const tableName = tableNames[index]
    const fields = tableMigrations[tableName] || []

    db.all(`PRAGMA table_info(${tableName})`, [], (pragmaErr, columns) => {
      if (pragmaErr) {
        console.error(`SQLite schema migration check failed for ${tableName}:`, pragmaErr)
        return
      }

      const existingColumns = new Set((columns || []).map((column) => column.name))
      const pending = fields.filter((field) => !existingColumns.has(field.name))

      const runPending = () => {
        if (!pending.length) return applyTableMigrations(tableNames, index + 1)

        const field = pending.shift()
        db.run(`ALTER TABLE ${tableName} ADD COLUMN ${field.name} ${field.type}`, (migrationErr) => {
          if (migrationErr) {
            console.error(`SQLite migration failed for ${tableName}.${field.name}:`, migrationErr)
            return
          }
          runPending()
        })
      }

      runPending()
    })
  }

  db.exec(schemaSql, (err) => {
    if (err) {
      console.error('SQLite schema init failed:', err)
      return
    }
    applyTableMigrations(Object.keys(tableMigrations), 0)
  })

  let transactionTail = Promise.resolve()

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
      let releaseTransaction
      const transactionLock = new Promise((resolve) => {
        releaseTransaction = resolve
      })
      const previousTransaction = transactionTail
      transactionTail = transactionTail.then(() => transactionLock)
      await previousTransaction

      let transactionStarted = false
      const releaseIfNeeded = () => {
        if (transactionStarted) {
          transactionStarted = false
          releaseTransaction()
        }
      }

      return {
        query: async (text, params) => {
          const normalizedText = text.trim().toUpperCase()
          if (normalizedText === 'BEGIN' || normalizedText === 'BEGIN IMMEDIATE') transactionStarted = true

          try {
            return await pool.query(text, params)
          } finally {
            if (normalizedText === 'COMMIT' || normalizedText === 'ROLLBACK') releaseIfNeeded()
          }
        },
        release: releaseIfNeeded,
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
