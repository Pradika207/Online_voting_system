const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const dbFile = path.resolve(__dirname, '..', 'ai_evoting.sqlite');
if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password TEXT NOT NULL,
  has_voted INTEGER DEFAULT 0,
  role TEXT DEFAULT 'voter'
);

CREATE TABLE candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  party TEXT
);

CREATE TABLE elections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATETIME,
  end_date DATETIME,
  status TEXT DEFAULT 'upcoming',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE election_eligibility (
  voter_id INTEGER NOT NULL,
  election_id INTEGER NOT NULL,
  eligible INTEGER DEFAULT 1,
  voted_at DATETIME,
  PRIMARY KEY (voter_id, election_id)
);

CREATE TABLE voting_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT UNIQUE NOT NULL,
  voter_id INTEGER NOT NULL,
  election_id INTEGER NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ballots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  ballot_hash TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(election_id) REFERENCES elections(id)
);

CREATE TABLE fraud_alerts (
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

CREATE TABLE user_activity (
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

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  prev_hash TEXT,
  event_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE audit_chain_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_event_id INTEGER,
  last_event_hash TEXT
);
`;

const db = new sqlite3.Database(dbFile);

db.serialize(async () => {
  db.exec(schema, async (err) => {
    if (err) {
      console.error('Schema failed:', err);
      db.close();
      process.exit(1);
      return;
    }

    const candidates = [
      ['Candidate A', 'Party Alpha'],
      ['Candidate B', 'Party Beta'],
      ['Candidate C', 'Party Gamma']
    ];

    const insertCandidates = candidates.map(([name, party]) => new Promise((resolve, reject) => {
      db.run('INSERT INTO candidates (name, party) VALUES (?, ?)', [name, party], function (err) {
        if (err) reject(err); else resolve();
      });
    }));

    try {
      await Promise.all(insertCandidates);
      const hash = await bcrypt.hash('AdminPass123', 10);
      await new Promise((resolve, reject) => {
        db.run('INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)', ['Admin User', 'admin@example.com', '+15551234567', hash, 'admin'], function (err) {
          if (err) reject(err); else { console.log('Admin user inserted with id', this.lastID); resolve(); }
        });
      });
      console.log('Database reset and seeded successfully');
      db.close();
    } catch (e) {
      console.error('Seed failed:', e);
      db.close();
      process.exit(1);
    }
  });
});
