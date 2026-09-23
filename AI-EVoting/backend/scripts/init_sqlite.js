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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
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
