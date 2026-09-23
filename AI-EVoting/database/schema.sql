-- PostgreSQL schema for AI-EVoting

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(30),
    password VARCHAR(255) NOT NULL,
    has_voted BOOLEAN DEFAULT FALSE,
    verified BOOLEAN DEFAULT TRUE,
    biometric_credential_id TEXT,
    biometric_public_key TEXT,
    biometric_counter INTEGER DEFAULT 0
);

-- Ensure a role column exists for admin/voter
ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'voter';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

CREATE TABLE IF NOT EXISTS candidates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    party VARCHAR(100),
    photo_url TEXT,
    manifesto TEXT,
    election_id INT NOT NULL REFERENCES elections(id),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    is_nota BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(election_id, name)
);

CREATE TABLE IF NOT EXISTS elections (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    status VARCHAR(20) DEFAULT 'upcoming',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ballots (
    id SERIAL PRIMARY KEY,
    election_id INT REFERENCES elections(id),
    iv TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    ballot_hash TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS election_eligibility (
    voter_id INT REFERENCES users(id),
    election_id INT REFERENCES elections(id),
    eligible BOOLEAN DEFAULT TRUE,
    voted_at TIMESTAMP,
    PRIMARY KEY (voter_id, election_id)
);

CREATE TABLE IF NOT EXISTS voting_tokens (
    id SERIAL PRIMARY KEY,
    token_hash TEXT UNIQUE NOT NULL,
    voter_id INT REFERENCES users(id),
    election_id INT REFERENCES elections(id),
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS receipts (
    id SERIAL PRIMARY KEY,
    voter_id INT NOT NULL REFERENCES users(id),
    election_id INT NOT NULL REFERENCES elections(id),
    receipt_hash TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(voter_id, election_id)
);

CREATE INDEX IF NOT EXISTS ballots_election_lookup ON ballots(election_id);
CREATE INDEX IF NOT EXISTS eligibility_voter_election_lookup ON election_eligibility(voter_id, election_id);
CREATE INDEX IF NOT EXISTS tokens_lookup ON voting_tokens(token_hash, voter_id, election_id);
CREATE INDEX IF NOT EXISTS receipts_voter_lookup ON receipts(voter_id, election_id);

CREATE TABLE IF NOT EXISTS fraud_alerts (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    prediction VARCHAR(20),
    login_attempts INT,
    failed_logins INT,
    votes_per_minute INT,
    ip_changes INT,
    device_changes INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Track user activity for feeding the AI model
CREATE TABLE IF NOT EXISTS user_activity (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    login_attempts INT DEFAULT 0,
    failed_logins INT DEFAULT 0,
    votes_per_minute INT DEFAULT 0,
    ip_changes INT DEFAULT 0,
    device_changes INT DEFAULT 0,
    session_duration INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs for security events
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    prev_hash TEXT,
    event_hash TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_chain_state (
    id INT PRIMARY KEY CHECK (id = 1),
    last_event_id INT,
    last_event_hash TEXT
);
