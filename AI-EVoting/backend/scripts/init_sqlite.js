const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()

const schemaPath = path.resolve(__dirname, '..', '..', 'database', 'schema.sql')
const dbFile = path.resolve(__dirname, '..', 'ai_evoting.sqlite')

const sqliteSchema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password TEXT NOT NULL,
  has_voted INTEGER DEFAULT 0,
  role TEXT DEFAULT 'voter'
);

ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'voter';
ALTER TABLE users ADD COLUMN phone TEXT;

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  party TEXT
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
  PRIMARY KEY (voter_id, election_id)
);

CREATE TABLE IF NOT EXISTS voting_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT UNIQUE NOT NULL,
  voter_id INTEGER NOT NULL,
  election_id INTEGER NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

ALTER TABLE fraud_alerts ADD COLUMN session_duration INTEGER DEFAULT 0;

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
`

const db = new sqlite3.Database(dbFile, (err) => {
  if (err) throw err
  console.log('SQLite DB opened at', dbFile)
  db.exec(sqliteSchema, (err) => {
    if (err) {
      console.error('Failed to apply schema:', err)
      process.exit(1)
    }
    console.log('Schema applied successfully')
    db.close()
  })
})
