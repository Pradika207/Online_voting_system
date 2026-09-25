const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const helmet = require("helmet");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const pool = require("./db");
const authenticateToken = require("./middleware/auth");
const { votingContract, getBlockchainVotes } = require("./blockchain");
const axios = require("axios");
const adminOnly = require("./middleware/admin");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

const app = express();
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';
const allowedOrigins = new Set(["http://localhost:5173", "http://localhost:5174"]);
const webAuthnRpID = process.env.WEBAUTHN_RP_ID || "localhost";
const webAuthnOrigins = (process.env.WEBAUTHN_ORIGIN || "http://localhost:5173,http://localhost:5174")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const biometricChallenges = new Map();
const usedBiometricTokens = new Set();
const registrationAttemptTracker = new Map();
const biometricFailureTracker = new Map();
const faceServiceUrl = process.env.FACE_SERVICE_URL || "http://127.0.0.1:8100";
const faceSimilarityThreshold = Number(process.env.FACE_SIMILARITY_THRESHOLD || 0.62);
const faceTemplateKey = (() => {
  const configured = process.env.FACE_TEMPLATE_ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32) throw new Error("FACE_TEMPLATE_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    return key;
  }
  if (process.env.NODE_ENV === "production") throw new Error("FACE_TEMPLATE_ENCRYPTION_KEY is required in production");
  return crypto.createHash("sha256").update(jwtSecret).digest();
})();

function trackWindowedEvents(store, key, windowMs = 5 * 60 * 1000, threshold = 3) {
  const now = Date.now();
  const events = (store.get(key) || []).filter((timestamp) => now - timestamp <= windowMs);
  events.push(now);
  store.set(key, events);
  return { count: events.length, thresholdReached: events.length >= threshold };
}

function trackSuspiciousRegistration(email, phone, userId = null) {
  const keys = [
    `register:${String(email || '').trim().toLowerCase()}`,
    `register:${String(phone || '').trim()}`,
  ];

  for (const key of keys) {
    const summary = trackWindowedEvents(registrationAttemptTracker, key, 5 * 60 * 1000, 3);
    if (summary.thresholdReached) {
      const reason = key.includes('register:') ? 'Repeated registration attempts detected' : 'Repeated suspicious registration attempt';
      logSecurityEvent(userId || null, 'SUSPICIOUS_REQUEST_BURST', 'HIGH', reason, { source: 'registration', key, count: summary.count });
    }
  }
}

function trackBiometricFailure(userId) {
  if (!userId) return;
  const summary = trackWindowedEvents(biometricFailureTracker, `biometric:${userId}`, 5 * 60 * 1000, 3);
  if (summary.thresholdReached) {
    logSecurityEvent(userId, 'BIOMETRIC_FAILURE', 'HIGH', 'Repeated biometric verification failures detected', { count: summary.count });
  }
}

function saveBiometricChallenge(userId, type, challenge) {
  biometricChallenges.set(`${userId}:${type}`, { challenge, expiresAt: Date.now() + 120000 });
}

function takeBiometricChallenge(userId, type, expectedChallenge) {
  const key = `${userId}:${type}`;
  const record = biometricChallenges.get(key);
  biometricChallenges.delete(key);
  return record && record.expiresAt > Date.now() && record.challenge === expectedChallenge;
}

function hashVotingToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function encryptFaceEmbedding(embedding) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", faceTemplateKey, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(embedding), "utf8")), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString("base64"), ciphertext: ciphertext.toString("base64"), authTag: cipher.getAuthTag().toString("base64") });
}

function decryptFaceEmbedding(record) {
  const value = JSON.parse(record);
  const decipher = crypto.createDecipheriv("aes-256-gcm", faceTemplateKey, Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]).toString("utf8"));
}

async function faceService(pathname, payload) {
  const response = await axios.post(`${faceServiceUrl}${pathname}`, payload, { timeout: 15000 });
  return response.data;
}

function createVotingToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function validateElectionWindow(startDate, endDate) {
  if (!startDate || !endDate) return { valid: true, start: null, end: null };
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return { valid: false };
  }
  return { valid: true, start, end };
}

function receiptReference() {
  return crypto.randomBytes(24).toString("base64url");
}

async function ensureNotaForElection(electionId) {
  const existing = await pool.query("SELECT id FROM candidates WHERE election_id = $1 AND is_nota = 1", [electionId]);
  if (existing.rows.length) return existing.rows[0].id;
  const inserted = await pool.query(
    `INSERT INTO candidates (name, party, manifesto, election_id, active, is_nota)
     VALUES ('None of the Above (NOTA)', 'NOTA', 'None of the listed candidates', $1, 1, 1) RETURNING id`,
    [electionId]
  );
  return inserted.rows[0].id;
}

function loadBallotEncryptionKey() {
  const configuredKey = process.env.BALLOT_ENCRYPTION_KEY;
  if (configuredKey) {
    const key = Buffer.from(configuredKey, "base64");
    if (key.length !== 32) throw new Error("BALLOT_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    return key;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("BALLOT_ENCRYPTION_KEY is required in production");
  }

  const keyFile = process.env.BALLOT_KEY_FILE || path.resolve(__dirname, ".ballot-key");
  try {
    const existingKey = Buffer.from(fs.readFileSync(keyFile, "utf8").trim(), "base64");
    if (existingKey.length === 32) return existingKey;
  } catch (error) {
    // Generate a local development key below.
  }

  const generatedKey = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, generatedKey.toString("base64"), { mode: 0o600 });
  return generatedKey;
}

const ballotEncryptionKey = loadBallotEncryptionKey();

function encryptBallot(electionId, candidateId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ballotEncryptionKey, iv);
  const associatedData = Buffer.from(`election:${electionId}`);
  cipher.setAAD(associatedData);
  const plaintext = Buffer.from(JSON.stringify({ version: 1, candidateId }));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const ivText = iv.toString("base64");
  const ciphertextText = ciphertext.toString("base64");
  const authTagText = authTag.toString("base64");
  const ballotHash = crypto.createHash("sha256")
    .update(`${electionId}.${ivText}.${ciphertextText}.${authTagText}`)
    .digest("hex");

  return { electionId, iv: ivText, ciphertext: ciphertextText, authTag: authTagText, ballotHash };
}

function decryptBallot(ballot) {
  const expectedHash = crypto.createHash("sha256")
    .update(`${ballot.election_id}.${ballot.iv}.${ballot.ciphertext}.${ballot.auth_tag}`)
    .digest("hex");
  if (expectedHash !== ballot.ballot_hash) throw new Error("Ballot integrity verification failed");

  const decipher = crypto.createDecipheriv("aes-256-gcm", ballotEncryptionKey, Buffer.from(ballot.iv, "base64"));
  decipher.setAAD(Buffer.from(`election:${ballot.election_id}`));
  decipher.setAuthTag(Buffer.from(ballot.auth_tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ballot.ciphertext, "base64")),
    decipher.final(),
  ]);
  const payload = JSON.parse(plaintext.toString("utf8"));
  if (payload.version !== 1 || !Number.isInteger(Number(payload.candidateId))) throw new Error("Invalid ballot payload");
  return payload;
}

async function countVerifiedBallots(electionId) {
  const ballots = electionId
    ? await pool.query(
      "SELECT id, election_id, iv, ciphertext, auth_tag, ballot_hash FROM ballots WHERE election_id = $1 ORDER BY id",
      [electionId]
    )
    : await pool.query("SELECT id, election_id, iv, ciphertext, auth_tag, ballot_hash FROM ballots ORDER BY id");
  const counts = new Map();
  let invalidCount = 0;
  for (const ballot of ballots.rows) {
    try {
      const payload = decryptBallot(ballot);
      const candidate = await pool.query("SELECT id, election_id FROM candidates WHERE id = $1", [payload.candidateId]);
      if (candidate.rows.length === 0 || (candidate.rows[0].election_id && Number(candidate.rows[0].election_id) !== Number(ballot.election_id))) {
        throw new Error("Ballot candidate is not valid for its election");
      }
      counts.set(Number(payload.candidateId), (counts.get(Number(payload.candidateId)) || 0) + 1);
    } catch (error) {
      invalidCount += 1;
      await logAudit(null, "BALLOT_INTEGRITY_FAILURE");
    }
  }
  return { total: ballots.rows.length - invalidCount, invalid: invalidCount, counts };
}

function normalizePhone(phone) {
  return String(phone || "").trim();
}

function classifyRiskScore(score) {
  if (score >= 25) return "CRITICAL";
  if (score >= 18) return "HIGH";
  if (score >= 10) return "MEDIUM";
  return "LOW";
}

function evaluateSecurityEvent(eventType, metadata = {}) {
  const rules = {
    LOGIN_FAILED: 4,
    ACCOUNT_LOCKED: 8,
    BIOMETRIC_FAILURE: 7,
    BIOMETRIC_REJECTED: 9,
    TOKEN_REQUESTED: 3,
    VOTE_REJECTED: 8,
    RATE_LIMITED: 6,
    DUPLICATE_REGISTRATION: 10,
    DUPLICATE_IDENTITY: 12,
    AUTHORIZATION_FAILURE: 5,
    RECEIPT_LOOKUP_FAILED: 4,
    SUSPICIOUS_REQUEST_BURST: 11,
    PAYMENT_OR_IDENTITY_MISMATCH: 9,
  };

  const score = Number(rules[eventType] || 0) + Number(metadata.extraScore || 0) + Number(metadata.count || 0);
  const reason = metadata.reason || `Risk score derived from ${eventType}`;
  return {
    score,
    riskLevel: classifyRiskScore(score),
    reason,
  };
}

async function logSecurityEvent(userId, eventType, riskLevel = "LOW", reason = "", metadata = {}) {
  if (!eventType) return;
  try {
    await pool.query(
      `INSERT INTO security_events (user_id, event_type, risk_level, reason, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId || null, eventType, riskLevel, reason || null, JSON.stringify(metadata || {})]
    );

    if (userId) {
      const scoreInfo = evaluateSecurityEvent(eventType, { ...metadata, reason });
      const nextRiskLevel = scoreInfo.riskLevel;
      await pool.query(
        `UPDATE users
         SET suspicious = CASE WHEN $1 IN ('HIGH', 'CRITICAL') THEN 1 ELSE suspicious END,
             suspicion_level = CASE WHEN $2 = 'LOW' THEN suspicion_level ELSE $2 END,
             risk_flags = risk_flags + 1
         WHERE id = $3`,
        [nextRiskLevel, nextRiskLevel, userId]
      );
    }
  } catch (error) {
    console.error("Failed to record security event:", error);
  }
}

async function getSecurityOverview() {
  const [securityResult, fraudResult, suspiciousUserResult, auditResult] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) AS event_count,
        SUM(CASE WHEN risk_level = 'HIGH' THEN 1 ELSE 0 END) AS high_risk_count,
        SUM(CASE WHEN event_type = 'LOGIN_FAILED' THEN 1 ELSE 0 END) AS failed_login_count,
        SUM(CASE WHEN event_type = 'VOTE_BLOCKED_SUSPICIOUS' THEN 1 ELSE 0 END) AS suspicious_vote_count
      FROM security_events
    `),
    pool.query(`
      SELECT
        COUNT(*) AS alert_count,
        SUM(CASE WHEN prediction = 'suspicious' THEN 1 ELSE 0 END) AS suspicious_alert_count
      FROM fraud_alerts
    `),
    pool.query(`
      SELECT COUNT(*) AS suspicious_users
      FROM users
      WHERE suspicious = 1 OR risk_flags > 0
    `),
    verifyAuditChain(),
  ]);

  const security = securityResult.rows[0] || {};
  const fraud = fraudResult.rows[0] || {};
  const suspiciousUsers = suspiciousUserResult.rows[0] || {};

  return {
    summary: {
      alertCount: Number(fraud.alert_count || 0) + Number(security.event_count || 0),
      suspiciousAlertCount: Number(fraud.suspicious_alert_count || 0),
      highRiskEventCount: Number(security.high_risk_count || 0),
      failedLoginCount: Number(security.failed_login_count || 0),
      suspiciousVoteCount: Number(security.suspicious_vote_count || 0),
      suspiciousUserCount: Number(suspiciousUsers.suspicious_users || 0),
      auditStatus: auditResult.valid ? "verified" : "tampered",
    },
    events: (await pool.query(
      `SELECT id, user_id, event_type, risk_level, reason, metadata, created_at
       FROM security_events
       ORDER BY created_at DESC
       LIMIT 10`
    )).rows,
  };
}

function getFallbackPrediction(metrics) {
  const riskScore = (
    (Number(metrics.login_attempts || 0) * 2) +
    (Number(metrics.failed_logins || 0) * 3) +
    (Number(metrics.votes_per_minute || 0) * 2) +
    (Number(metrics.ip_changes || 0) * 4) +
    (Number(metrics.device_changes || 0) * 4) +
    (Number(metrics.session_duration || 0) / 40)
  );

  return riskScore >= 20 ? 'suspicious' : 'normal';
}

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"]
  })
);
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || "8mb" }));

function trustedBrowserOrigin(req, res, next) {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.headers.origin && !allowedOrigins.has(req.headers.origin)) {
    return res.status(403).json({ message: "Untrusted request origin" });
  }
  next();
}

app.use(trustedBrowserOrigin);

// Rate limiter for login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_MAX || (process.env.NODE_ENV === "production" ? 5 : 20)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again later." }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.API_RATE_MAX || (process.env.NODE_ENV === "production" ? 120 : 240)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Try again later." },
});

const sensitiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.SENSITIVE_RATE_MAX || (process.env.NODE_ENV === "production" ? 20 : 60)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many security-sensitive requests. Try again later." },
});

app.use("/api", apiLimiter);
const loginFailures = new Map();

function loginKey(req, email) {
  return `${req.ip}:${String(email).toLowerCase()}`;
}

function loginLocked(key) {
  const state = loginFailures.get(key);
  if (!state || state.lockedUntil <= Date.now()) return false;
  return true;
}

function recordLoginFailure(key) {
  const state = loginFailures.get(key) || { attempts: 0, lockedUntil: 0 };
  state.attempts += 1;
  if (state.attempts >= Number(process.env.ACCOUNT_FAILURE_LIMIT || 5)) {
    state.lockedUntil = Date.now() + Number(process.env.ACCOUNT_LOCK_MS || 60000);
    state.attempts = 0;
  }
  loginFailures.set(key, state);
  return state;
}

function clearLoginFailures(key) {
  loginFailures.delete(key);
}

function requireRecentMfa(req, res, next) {
  if (process.env.REQUIRE_ADMIN_MFA !== "true" || req.user?.role !== "admin") return next();
  const mfaToken = req.headers["x-mfa-token"];
  if (!mfaToken) return res.status(403).json({ message: "Recent MFA verification is required" });
  try {
    const proof = jwt.verify(mfaToken, jwtSecret);
    if (proof.purpose !== "mfa" || proof.userId !== req.user.userId) throw new Error("Invalid MFA proof");
    req.mfaVerified = true;
    next();
  } catch (error) {
    res.status(403).json({ message: "MFA verification is expired or invalid" });
  }
}

let auditChainReady;
let auditChainTail = Promise.resolve();

function auditEventHash(event, previousHash) {
  return crypto.createHash("sha256")
    .update(JSON.stringify({
      id: event.id,
      user_id: event.user_id || null,
      action: event.action,
      created_at: event.created_at,
      prev_hash: previousHash || "",
    }))
    .digest("hex");
}

async function ensureAuditChain() {
  if (!auditChainReady) {
    auditChainReady = (async () => {
      const result = await pool.query("SELECT id, user_id, action, created_at, prev_hash, event_hash FROM audit_logs ORDER BY id");
      const needsBootstrap = result.rows.some((event) => !event.event_hash || event.prev_hash === null || event.prev_hash === undefined);
      let previousHash = "";

      for (const event of result.rows) {
        const eventHash = auditEventHash(event, previousHash);
        if (needsBootstrap || event.prev_hash !== previousHash || event.event_hash !== eventHash) {
          await pool.query("UPDATE audit_logs SET prev_hash = $1, event_hash = $2 WHERE id = $3", [previousHash || null, eventHash, event.id]);
        }
        previousHash = eventHash;
      }

      const state = await pool.query("SELECT id FROM audit_chain_state WHERE id = 1");
      if (state.rows.length === 0) {
        await pool.query("INSERT INTO audit_chain_state (id, last_event_id, last_event_hash) VALUES (1, $1, $2)", [result.rows.length ? result.rows[result.rows.length - 1].id : null, previousHash || null]);
      } else if (result.rows.length) {
        await pool.query("UPDATE audit_chain_state SET last_event_id = $1, last_event_hash = $2 WHERE id = 1", [result.rows[result.rows.length - 1].id, previousHash]);
      }
    })().catch((error) => {
      auditChainReady = null;
      throw error;
    });
  }
  return auditChainReady;
}

async function logAudit(userId, action) {
  auditChainTail = auditChainTail.catch(() => {}).then(async () => {
    try {
      await ensureAuditChain();
      const state = await pool.query("SELECT last_event_id, last_event_hash FROM audit_chain_state WHERE id = 1");
      const previousHash = state.rows[0]?.last_event_hash || "";
      const inserted = await pool.query(
        `INSERT INTO audit_logs (user_id, action, prev_hash) VALUES ($1, $2, $3) RETURNING id`,
        [userId || null, action, previousHash || null]
      );
      const eventResult = await pool.query("SELECT id, user_id, action, created_at, prev_hash FROM audit_logs WHERE id = $1", [inserted.rows[0].id]);
      const event = eventResult.rows[0];
      const eventHash = auditEventHash(event, previousHash);
      await pool.query("UPDATE audit_logs SET event_hash = $1 WHERE id = $2", [eventHash, event.id]);
      const updatedState = await pool.query("UPDATE audit_chain_state SET last_event_id = $1, last_event_hash = $2 WHERE id = 1", [event.id, eventHash]);
      if (!updatedState.rowCount) await pool.query("INSERT INTO audit_chain_state (id, last_event_id, last_event_hash) VALUES (1, $1, $2)", [event.id, eventHash]);
    } catch (error) {
      console.error("Failed to write audit log:", error);
    }
  });
  return auditChainTail;
}

async function verifyAuditChain() {
  const result = await pool.query("SELECT id, user_id, action, created_at, prev_hash, event_hash FROM audit_logs ORDER BY id");
  const stateResult = await pool.query("SELECT last_event_id, last_event_hash FROM audit_chain_state WHERE id = 1");
  let previousHash = "";
  let valid = true;

  for (const event of result.rows) {
    const expectedHash = auditEventHash(event, previousHash);
    if (event.prev_hash !== (previousHash || null) || event.event_hash !== expectedHash) valid = false;
    previousHash = event.event_hash || expectedHash;
  }

  const state = stateResult.rows[0];
  if ((state?.last_event_id || null) !== (result.rows.length ? result.rows[result.rows.length - 1].id : null) || (state?.last_event_hash || null) !== (previousHash || null)) valid = false;
  return { valid, eventCount: result.rows.length, lastEventId: state?.last_event_id || null };
}

app.get("/", (req, res) => {
  res.json({ message: "AI E-Voting Backend is running", otpProvider: "Firebase Phone Authentication" });
});

app.get("/api/health", async (req, res) => {
  try {
    const dbCheck = await pool.query("SELECT 1 AS ok");
    const auditState = await verifyAuditChain();
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database: dbCheck.rows.length ? "ok" : "unavailable",
      auditIntegrity: auditState.valid ? "verified" : "warning",
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(503).json({ status: "degraded", message: "Service unavailable" });
  }
});

app.post(
  "/api/register",
  body("name").trim().isLength({ min: 2, max: 100 }),
  body("email").trim().notEmpty(),
  body("phone").trim().isLength({ min: 4, max: 30 }),
  body("password").isLength({ min: 8 }),
  async (req, res) => {
    try {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email, password, phone, firebaseVerified, identityReference } = req.body;
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const normalizedPhone = normalizePhone(phone);
      const normalizedIdentity = String(identityReference || "").trim();

      trackSuspiciousRegistration(normalizedEmail, normalizedPhone, null);

      if (!normalizedEmail || !normalizedPhone) {
        return res.status(400).json({ message: "Email and phone number are required." });
      }

      if (firebaseVerified === true) {
          const duplicateEmailCheck = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
          if (duplicateEmailCheck.rows.length > 0) {
            await logSecurityEvent(duplicateEmailCheck.rows[0].id, "DUPLICATE_REGISTRATION", "HIGH", "Duplicate email registration attempt", { duplicateField: "email" });
            return res.status(409).json({ message: "This email is already registered." });
          }

          const duplicatePhoneCheck = await pool.query("SELECT id FROM users WHERE phone = $1", [normalizedPhone]);
          if (duplicatePhoneCheck.rows.length > 0) {
            await logSecurityEvent(duplicatePhoneCheck.rows[0].id, "DUPLICATE_REGISTRATION", "HIGH", "Duplicate phone registration attempt", { duplicateField: "phone" });
            return res.status(409).json({ message: "This phone number is already registered." });
          }

          if (normalizedIdentity) {
            const existingIdentity = await pool.query("SELECT id FROM users WHERE identity_reference = $1", [normalizedIdentity]);
            if (existingIdentity.rows.length > 0) {
              await logSecurityEvent(existingIdentity.rows[0].id, "DUPLICATE_IDENTITY", "CRITICAL", "Duplicate identity reference registration attempt", { duplicateField: "identity_reference" });
              return res.status(409).json({ message: "This identity reference is already registered." });
            }
          }

          const registrationEventCount = trackWindowedEvents(registrationAttemptTracker, `register:${normalizedEmail}`, 5 * 60 * 1000, 3);
          if (registrationEventCount.thresholdReached) {
            await logSecurityEvent(null, "SUSPICIOUS_REQUEST_BURST", "HIGH", "Repeated registration attempts for the same email address", { email: normalizedEmail, count: registrationEventCount.count });
            return res.status(429).json({ message: "Too many registration attempts. Please try again later." });
          }

          const hashedPassword = await bcrypt.hash(password, 10);
          const insertRes = await pool.query(
            `INSERT INTO users (name, email, phone, identity_reference, password, role)
             VALUES ($1, $2, $3, $4, $5, 'voter') RETURNING id`,
            [name, normalizedEmail, normalizedPhone, normalizedIdentity || null, hashedPassword]
          );

          await pool.query(
            "INSERT INTO election_eligibility (voter_id, election_id) SELECT $1, id FROM elections WHERE status IN ('upcoming', 'active') ON CONFLICT DO NOTHING",
            [insertRes.rows[0].id]
          );

          await logAudit(insertRes.rows[0].id, "REGISTER");
          await logSecurityEvent(insertRes.rows[0].id, "REGISTRATION_SUCCESS", "LOW", "User registered successfully", { email: normalizedEmail });
          return res.status(201).json({ message: "Registration successful. Please login to continue." });
        }

      return res.status(400).json({
        message: "Complete phone verification with Firebase before registering.",
      });
    } catch (error) {
      console.error("Registration error:", error);
      if (error?.code === "23505" || /duplicate key|UNIQUE constraint|unique/i.test(String(error?.message || ""))) {
        return res.status(409).json({ message: "This email or phone number is already registered." });
      }
      res.status(500).json({ message: "Server error" });
    }
  }
);

app.post(
  "/api/login",
  loginLimiter,
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 1 }),
  async (req, res) => {
    try {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;
      const attemptKey = loginKey(req, email);

      if (loginLocked(attemptKey)) {
        return res.status(429).json({ message: "Authentication temporarily unavailable. Try again later." });
      }

      const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

      if (result.rows.length === 0) {
        // Audit: login failed (unknown email)
        await logAudit(null, "LOGIN_FAILED");
        const attemptState = recordLoginFailure(attemptKey);
        if (attemptState.lockedUntil && attemptState.lockedUntil > Date.now()) {
          await logSecurityEvent(null, "ACCOUNT_LOCKED", "MEDIUM", "Authentication lockout activated after repeated failures", { key: attemptKey, attempts: attemptState.attempts });
        } else {
          await logSecurityEvent(null, "LOGIN_FAILED", "LOW", "Failed authentication attempt", { key: attemptKey, source: "login" });
        }
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const user = result.rows[0];

      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        // Audit: login failed for this user
        await logAudit(user.id, "LOGIN_FAILED");
        const attemptState = recordLoginFailure(attemptKey);
        if (attemptState.lockedUntil && attemptState.lockedUntil > Date.now()) {
          await logSecurityEvent(user.id, "ACCOUNT_LOCKED", "HIGH", "Account lockout triggered by repeated failed logins", { userId: user.id, attempts: attemptState.attempts });
        } else {
          await logSecurityEvent(user.id, "LOGIN_FAILED", "MEDIUM", "Failed login attempt recorded for risk review", { userId: user.id, attempts: attemptState.attempts });
        }
        return res.status(401).json({ message: "Invalid email or password" });
      }

      clearLoginFailures(attemptKey);
      const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, jwtSecret, { expiresIn: "15m", jwtid: crypto.randomBytes(16).toString("hex") });

      // Audit: login success
      await logAudit(user.id, "LOGIN_SUCCESS");

      res.json({ message: "Login successful", token });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

app.post("/api/logout", authenticateToken, (req, res) => {
  const decoded = jwt.decode(req.accessToken);
  authenticateToken.revokeToken(req.accessToken, decoded?.exp ? decoded.exp * 1000 : undefined);
  res.json({ message: "Logged out" });
});

// Get candidates
app.get("/api/elections/active", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, start_date, end_date, status
       FROM elections
       WHERE status = 'active'
       ORDER BY id DESC
       LIMIT 1`
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "No active election" });
    await ensureNotaForElection(result.rows[0].id);
    res.json({ election: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to retrieve active election" });
  }
});

app.get("/api/candidates", async (req, res) => {
  try {
    const electionId = req.query.electionId ? Number(req.query.electionId) : null;
    if (req.query.electionId && (!Number.isInteger(electionId) || electionId <= 0)) return res.status(400).json({ message: "Invalid election ID" });

    let targetElectionId = electionId;
    if (!targetElectionId) {
      const activeElection = await pool.query(
        `SELECT id FROM elections WHERE status = 'active' ORDER BY id DESC LIMIT 1`
      );
      if (activeElection.rows.length === 0) {
        return res.status(404).json({ message: "No active election is available" });
      }
      targetElectionId = Number(activeElection.rows[0].id);
    }

    const result = await pool.query(
      "SELECT id, name, party, photo_url, manifesto, election_id, active, is_nota FROM candidates WHERE active = 1 AND (election_id = $1 OR election_id IS NULL) ORDER BY is_nota, id",
      [targetElectionId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch candidates" });
  }
});

// Biometric enrollment: the browser/OS keeps the private key; the server stores only its public key.
app.post("/api/biometric/register/options", sensitiveLimiter, authenticateToken, async (req, res) => {
  try {
    const userResult = await pool.query("SELECT id, email, name, biometric_credential_id FROM users WHERE id = $1", [req.user.userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ message: "User not found" });
    const user = userResult.rows[0];
    const options = await generateRegistrationOptions({
      rpName: "AI E-Voting",
      rpID: webAuthnRpID,
      userID: new TextEncoder().encode(String(user.id)),
      userName: user.email,
      userDisplayName: user.name,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
      excludeCredentials: user.biometric_credential_id ? [{ id: user.biometric_credential_id }] : [],
    });

    saveBiometricChallenge(user.id, "registration", options.challenge);
    res.json(options);
  } catch (error) {
    console.error("Biometric registration options error:", error);
    res.status(500).json({ message: "Unable to start biometric enrollment" });
  }
});

app.get("/api/biometric/status", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT biometric_credential_id FROM users WHERE id = $1", [req.user.userId]);
    res.json({ enrolled: Boolean(result.rows[0] && result.rows[0].biometric_credential_id) });
  } catch (error) {
    console.error("Biometric status error:", error);
    res.status(500).json({ message: "Unable to check biometric status" });
  }
});

app.post("/api/biometric/register/verify", sensitiveLimiter, authenticateToken, async (req, res) => {
  try {
    const optionsChallenge = req.body.optionsChallenge;
    const response = req.body.response;
    if (!response || !takeBiometricChallenge(req.user.userId, "registration", optionsChallenge)) {
      return res.status(400).json({ message: "Biometric enrollment challenge expired or invalid" });
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: optionsChallenge,
      expectedOrigin: webAuthnOrigins,
      expectedRPID: webAuthnRpID,
      requireUserVerification: true,
    });

    if (!verification.verified) return res.status(400).json({ message: "Biometric enrollment was not verified" });

    const credential = verification.registrationInfo.credential;
    await pool.query(
      "UPDATE users SET biometric_credential_id = $1, biometric_public_key = $2, biometric_counter = $3 WHERE id = $4",
      [credential.id, Buffer.from(credential.publicKey).toString("base64"), credential.counter, req.user.userId]
    );
    await logAudit(req.user.userId, "BIOMETRIC_ENROLLED");
    res.json({ message: "Biometric verification enrolled successfully" });
  } catch (error) {
    console.error("Biometric registration verification error:", error);
    res.status(400).json({ message: "Biometric enrollment failed" });
  }
});

app.post("/api/biometric/authenticate/options", sensitiveLimiter, authenticateToken, async (req, res) => {
  try {
    const userResult = await pool.query("SELECT biometric_credential_id FROM users WHERE id = $1", [req.user.userId]);
    if (userResult.rows.length === 0 || !userResult.rows[0].biometric_credential_id) {
      return res.status(400).json({ message: "Enroll biometric verification before voting" });
    }

    const options = await generateAuthenticationOptions({
      rpID: webAuthnRpID,
      userVerification: "required",
      allowCredentials: [{ id: userResult.rows[0].biometric_credential_id }],
    });
    saveBiometricChallenge(req.user.userId, "authentication", options.challenge);
    res.json(options);
  } catch (error) {
    console.error("Biometric authentication options error:", error);
    res.status(500).json({ message: "Unable to start biometric verification" });
  }
});

app.post("/api/biometric/authenticate/verify", sensitiveLimiter, authenticateToken, async (req, res) => {
  try {
    const optionsChallenge = req.body.optionsChallenge;
    const response = req.body.response;
    const userResult = await pool.query("SELECT biometric_credential_id, biometric_public_key, biometric_counter FROM users WHERE id = $1", [req.user.userId]);
    const user = userResult.rows[0];

    if (!user || !user.biometric_credential_id || !takeBiometricChallenge(req.user.userId, "authentication", optionsChallenge)) {
      return res.status(400).json({ message: "Biometric challenge expired or invalid" });
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: optionsChallenge,
      expectedOrigin: webAuthnOrigins,
      expectedRPID: webAuthnRpID,
      requireUserVerification: true,
      credential: {
        id: user.biometric_credential_id,
        publicKey: new Uint8Array(Buffer.from(user.biometric_public_key, "base64")),
        counter: Number(user.biometric_counter || 0),
      },
    });

    if (!verification.verified) {
      trackBiometricFailure(req.user.userId);
      await logSecurityEvent(req.user.userId, "BIOMETRIC_FAILURE", "MEDIUM", "Biometric verification failed", { userId: req.user.userId, source: "authentication" });
      return res.status(401).json({ message: "Biometric verification failed" });
    }

    await pool.query("UPDATE users SET biometric_counter = $1 WHERE id = $2", [verification.authenticationInfo.newCounter, req.user.userId]);
    const biometricToken = jwt.sign({ userId: req.user.userId, purpose: "mfa", nonce: crypto.randomBytes(16).toString("hex") }, jwtSecret, { expiresIn: "5m", jwtid: crypto.randomBytes(16).toString("hex") });
    await logAudit(req.user.userId, "BIOMETRIC_VERIFIED");
    res.json({ message: "Biometric verification successful", biometricToken });
  } catch (error) {
    console.error("Biometric authentication verification error:", error);
    res.status(401).json({ message: "Biometric verification failed" });
  }
});

app.get("/api/face/status", authenticateToken, async (req, res) => {
  const result = await pool.query("SELECT voter_id FROM face_templates WHERE voter_id = $1 AND revoked_at IS NULL", [req.user.userId]);
  res.json({ enrolled: result.rows.length > 0 });
});

app.post("/api/face/challenge", sensitiveLimiter, authenticateToken, async (req, res) => {
  const operation = req.body.operation === "enrollment" ? "enrollment" : "verification";
  if (operation === "verification") {
    const existing = await pool.query("SELECT id FROM face_templates WHERE voter_id = $1 AND revoked_at IS NULL", [req.user.userId]);
    if (!existing.rows.length) return res.status(400).json({ message: "Enroll camera face verification before voting" });
  }
  const challengeId = crypto.randomUUID();
  const challenge = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 120000).toISOString();
  await pool.query(
    "INSERT INTO face_verification_challenges (id, voter_id, session_jti, operation, challenge, expires_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [challengeId, req.user.userId, req.user.jti, operation, challenge, expiresAt]
  );
  res.json({ challengeId, challenge, operation, expiresAt, liveness: { type: "blink_then_turn", requiredFrames: 3 } });
});

app.post("/api/face/enrollment", sensitiveLimiter, authenticateToken, async (req, res) => {
  try {
    const { challengeId, challenge, frames } = req.body;
    if (!challengeId || !challenge || !Array.isArray(frames) || frames.length < 3 || frames.length > 8) return res.status(400).json({ message: "A complete camera liveness sequence is required" });
    const challengeResult = await pool.query(
      "SELECT * FROM face_verification_challenges WHERE id = $1 AND voter_id = $2 AND session_jti = $3 AND operation = 'enrollment' AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP",
      [challengeId, req.user.userId, req.user.jti]
    );
    if (!challengeResult.rows.length || challengeResult.rows[0].challenge !== challenge) return res.status(403).json({ message: "Face enrollment challenge expired or invalid" });
    const result = await faceService("/enroll", { challenge, frames });
    if (!result.livenessPassed || !Array.isArray(result.embedding) || result.embedding.length < 32) return res.status(400).json({ message: "Liveness verification failed" });
    await pool.query("UPDATE face_verification_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = $1", [challengeId]);
    await pool.query(
      `INSERT INTO face_templates (voter_id, encrypted_embedding, embedding_model, embedding_version, encryption_key_version)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (voter_id) DO UPDATE SET encrypted_embedding = EXCLUDED.encrypted_embedding, embedding_model = EXCLUDED.embedding_model, embedding_version = EXCLUDED.embedding_version, encryption_key_version = EXCLUDED.encryption_key_version, updated_at = CURRENT_TIMESTAMP, revoked_at = NULL`,
      [req.user.userId, encryptFaceEmbedding(result.embedding), result.model || "insightface-arcface", result.version || "1", process.env.FACE_TEMPLATE_KEY_VERSION || "1"]
    );
    await logAudit(req.user.userId, "FACE_ENROLLED");
    res.json({ enrolled: true, message: "Camera face verification enrolled successfully" });
  } catch (error) {
    trackBiometricFailure(req.user.userId);
    console.error("Face enrollment error:", error.message || error);
    res.status(400).json({ message: "Face enrollment could not be completed" });
  }
});

app.post("/api/face/verify", sensitiveLimiter, authenticateToken, async (req, res) => {
  try {
    const { challengeId, challenge, frames } = req.body;
    if (!challengeId || !challenge || !Array.isArray(frames) || frames.length < 3 || frames.length > 8) return res.status(400).json({ message: "A complete camera liveness sequence is required" });
    const challengeResult = await pool.query(
      "SELECT * FROM face_verification_challenges WHERE id = $1 AND voter_id = $2 AND session_jti = $3 AND operation = 'verification' AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP AND attempts < 3",
      [challengeId, req.user.userId, req.user.jti]
    );
    if (!challengeResult.rows.length || challengeResult.rows[0].challenge !== challenge) return res.status(403).json({ message: "Face verification challenge expired or invalid" });
    await pool.query("UPDATE face_verification_challenges SET attempts = attempts + 1 WHERE id = $1", [challengeId]);
    const templateResult = await pool.query("SELECT encrypted_embedding FROM face_templates WHERE voter_id = $1 AND revoked_at IS NULL", [req.user.userId]);
    if (!templateResult.rows.length) return res.status(400).json({ message: "Camera face verification is not enrolled" });
    const result = await faceService("/verify", { challenge, frames, template: decryptFaceEmbedding(templateResult.rows[0].encrypted_embedding) });
    if (!result.livenessPassed || Number(result.similarity) < faceSimilarityThreshold) {
      trackBiometricFailure(req.user.userId);
      await logSecurityEvent(req.user.userId, "FACE_VERIFICATION_FAILURE", "MEDIUM", "Camera face verification failed", { livenessPassed: Boolean(result.livenessPassed) });
      return res.status(401).json({ message: "Face verification failed" });
    }
    await pool.query("UPDATE face_verification_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = $1", [challengeId]);
    const proofId = crypto.randomUUID();
    const proofExpiry = new Date(Date.now() + 180000).toISOString();
    await pool.query("INSERT INTO face_verification_proofs (id, voter_id, session_jti, challenge_id, expires_at) VALUES ($1, $2, $3, $4, $5)", [proofId, req.user.userId, req.user.jti, challengeId, proofExpiry]);
    await logAudit(req.user.userId, "FACE_VERIFIED");
    res.json({ verified: true, faceProof: proofId, expiresAt: proofExpiry });
  } catch (error) {
    trackBiometricFailure(req.user.userId);
    console.error("Face verification error:", error.message || error);
    res.status(401).json({ message: "Face verification failed" });
  }
});

app.post("/api/voter/eligibility", sensitiveLimiter, authenticateToken, async (req, res) => {
  try {
    const electionId = Number(req.body.electionId);
    const biometricHeader = req.headers["x-biometric-token"];
    const faceProof = req.headers["x-face-proof"];
    if (!Number.isInteger(electionId) || electionId <= 0) return res.status(400).json({ message: "A valid election is required" });
    if (!biometricHeader) return res.status(403).json({ message: "Biometric verification is required" });
    if (!faceProof) return res.status(403).json({ message: "Camera face verification is required" });

    const faceProofResult = await pool.query(
      "SELECT id FROM face_verification_proofs WHERE id = $1 AND voter_id = $2 AND session_jti = $3 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP",
      [faceProof, req.user.userId, req.user.jti]
    );
    if (!faceProofResult.rows.length) return res.status(403).json({ message: "Camera face proof is expired, invalid, or already used" });

    let biometricPayload;
    try {
      biometricPayload = jwt.verify(biometricHeader, jwtSecret);
    } catch (error) {
      return res.status(403).json({ message: "Biometric verification expired or invalid" });
    }

    const biometricTokenId = biometricPayload.jti || biometricPayload.nonce;
    if (biometricPayload.purpose !== "mfa" || biometricPayload.userId !== req.user.userId || usedBiometricTokens.has(biometricTokenId)) {
      return res.status(403).json({ message: "Biometric verification token cannot be reused" });
    }

    const userResult = await pool.query("SELECT id, verified, role FROM users WHERE id = $1", [req.user.userId]);
    const electionResult = await pool.query("SELECT id, status, start_date, end_date FROM elections WHERE id = $1", [electionId]);
    const eligibilityResult = await pool.query("SELECT eligible, voted_at FROM election_eligibility WHERE voter_id = $1 AND election_id = $2", [req.user.userId, electionId]);

    if (userResult.rows.length === 0 || userResult.rows[0].role !== "voter") return res.status(403).json({ message: "Voter account is not eligible" });
    if (!userResult.rows[0].verified) return res.status(403).json({ message: "Voter account is not verified" });
    if (electionResult.rows.length === 0) return res.status(404).json({ message: "Election not found" });

    const election = electionResult.rows[0];
    const now = Date.now();
    const startsAt = election.start_date ? new Date(election.start_date).getTime() : null;
    const endsAt = election.end_date ? new Date(election.end_date).getTime() : null;
    const electionOpen = election.status === "active" && (!startsAt || now >= startsAt) && (!endsAt || now <= endsAt);
    if (!electionOpen) return res.status(403).json({ message: "Voting is not currently open for this election" });
    if (eligibilityResult.rows.length === 0 || !eligibilityResult.rows[0].eligible) return res.status(403).json({ message: "Voter is not eligible for this election" });
    if (eligibilityResult.rows[0].voted_at) return res.status(409).json({ message: "Voter has already voted in this election" });

    const votingToken = createVotingToken();
    const tokenHash = hashVotingToken(votingToken);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await pool.query("INSERT INTO voting_tokens (token_hash, voter_id, election_id, expires_at) VALUES ($1, $2, $3, $4)", [tokenHash, req.user.userId, electionId, expiresAt]);
    usedBiometricTokens.add(biometricTokenId);
    await pool.query("UPDATE face_verification_proofs SET used_at = CURRENT_TIMESTAMP WHERE id = $1", [faceProof]);
    await logAudit(req.user.userId, "VOTER_ELIGIBILITY_VERIFIED");
    res.json({ eligible: true, electionId, votingToken, expiresAt });
  } catch (error) {
    console.error("Eligibility verification error:", error);
    res.status(500).json({ message: "Unable to verify voter eligibility" });
  }
});

// Admin: voter management
app.get("/api/admin/voters", authenticateToken, adminOnly, async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const filter = String(req.query.filter || "all");
    const conditions = ["role = 'voter'"];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name LIKE $${params.length} OR email LIKE $${params.length})`);
    }

    if (filter === "verified") conditions.push("verified = 1");
    if (filter === "pending") conditions.push("verified = 0");
    if (filter === "voted") conditions.push("has_voted = 1");
    if (filter === "not_voted") conditions.push("has_voted = 0");

    const result = await pool.query(
      `SELECT id, name, email, phone, verified, has_voted FROM users WHERE ${conditions.join(" AND ")} ORDER BY id DESC`,
      params
    );

    res.json({ voters: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to retrieve voters" });
  }
});

app.get("/api/admin/voters/:id", authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, phone, verified, has_voted, role FROM users WHERE id = $1 AND role = 'voter'",
      [req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "Voter not found" });
    res.json({ voter: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to retrieve voter" });
  }
});

// Admin: candidate management
app.post("/api/admin/candidates", authenticateToken, adminOnly, requireRecentMfa, async (req, res) => {
  try {
    const { name, party, photoUrl, manifesto, electionId } = req.body;
    const electionNumber = Number(electionId);
    if (!String(name || "").trim() || !Number.isInteger(electionNumber) || electionNumber <= 0) return res.status(400).json({ message: "Candidate name and election are required" });
    const election = await pool.query("SELECT id, status FROM elections WHERE id = $1", [electionNumber]);
    if (!election.rows.length) return res.status(400).json({ message: "Election not found" });
    if (election.rows[0].status !== "upcoming") return res.status(409).json({ message: "Candidates cannot be added after an election starts" });

    const result = await pool.query(
      `INSERT INTO candidates (name, party, photo_url, manifesto, election_id, active, is_nota)
       VALUES ($1, $2, $3, $4, $5, 1, 0) RETURNING id`,
      [String(name).trim(), party || null, photoUrl || null, manifesto || null, electionNumber]
    );
    const candidate = await pool.query("SELECT id, name, party, photo_url, manifesto, election_id FROM candidates WHERE id = $1", [result.rows[0].id]);
    await logAudit(req.user.userId, "CANDIDATE_CREATED");
    res.status(201).json({ candidate: candidate.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create candidate" });
  }
});

app.put("/api/admin/candidates/:id", authenticateToken, adminOnly, requireRecentMfa, async (req, res) => {
  try {
    const { name, party, photoUrl, manifesto } = req.body;
    if (!String(name || "").trim()) return res.status(400).json({ message: "Candidate name is required" });
    const existing = await pool.query("SELECT id, election_id, is_nota FROM candidates WHERE id = $1", [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ message: "Candidate not found" });
    if (existing.rows[0].is_nota) return res.status(409).json({ message: "NOTA cannot be edited" });
    const election = await pool.query("SELECT status FROM elections WHERE id = $1", [existing.rows[0].election_id]);
    if (election.rows[0]?.status !== "upcoming") return res.status(409).json({ message: "Candidates cannot be modified after an election starts" });

    const result = await pool.query(
      `UPDATE candidates SET name = $1, party = $2, photo_url = $3, manifesto = $4 WHERE id = $5`,
      [String(name).trim(), party || null, photoUrl || null, manifesto || null, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ message: "Candidate not found" });
    const candidate = await pool.query("SELECT id, name, party, photo_url, manifesto, election_id FROM candidates WHERE id = $1", [req.params.id]);
    await logAudit(req.user.userId, "CANDIDATE_UPDATED");
    res.json({ candidate: candidate.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update candidate" });
  }
});

app.delete("/api/admin/candidates/:id", authenticateToken, adminOnly, requireRecentMfa, async (req, res) => {
  try {
    const candidate = await pool.query("SELECT election_id, is_nota FROM candidates WHERE id = $1", [req.params.id]);
    if (!candidate.rows.length) return res.status(404).json({ message: "Candidate not found" });
    if (candidate.rows[0].is_nota) return res.status(409).json({ message: "NOTA cannot be deleted" });
    const election = await pool.query("SELECT status FROM elections WHERE id = $1", [candidate.rows[0].election_id]);
    if (election.rows[0]?.status !== "upcoming") return res.status(409).json({ message: "Use deactivation after an election starts" });
    const result = await pool.query("DELETE FROM candidates WHERE id = $1", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: "Candidate not found" });
    await logAudit(req.user.userId, "CANDIDATE_DELETED");
    res.json({ message: "Candidate deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Candidate cannot be deleted after votes are recorded" });
  }
});

app.patch("/api/admin/candidates/:id/status", authenticateToken, adminOnly, requireRecentMfa, async (req, res) => {
  try {
    const active = req.body.active === true;
    const candidate = await pool.query("SELECT election_id, is_nota FROM candidates WHERE id = $1", [req.params.id]);
    if (!candidate.rows.length) return res.status(404).json({ message: "Candidate not found" });
    if (candidate.rows[0].is_nota && !active) return res.status(409).json({ message: "NOTA cannot be deactivated" });
    const election = await pool.query("SELECT status FROM elections WHERE id = $1", [candidate.rows[0].election_id]);
    if (election.rows[0]?.status !== "upcoming") return res.status(409).json({ message: "Candidate status cannot change after an election starts" });
    await pool.query("UPDATE candidates SET active = $1 WHERE id = $2", [active ? 1 : 0, req.params.id]);
    await logAudit(req.user.userId, active ? "CANDIDATE_ACTIVATED" : "CANDIDATE_DEACTIVATED");
    res.json({ message: "Candidate status updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update candidate status" });
  }
});

// Admin: election management
app.get("/api/admin/elections", authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, description, start_date, end_date, status, created_at FROM elections ORDER BY id DESC");
    for (const election of result.rows) await ensureNotaForElection(election.id);
    res.json({ elections: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to retrieve elections" });
  }
});

app.post("/api/admin/elections", authenticateToken, adminOnly, requireRecentMfa, async (req, res) => {
  try {
    const { name, description, startDate, endDate, status } = req.body;
    const requestedStatus = String(status || "upcoming").toLowerCase();
    const dateWindow = validateElectionWindow(startDate, endDate);
    if (!String(name || "").trim() || !dateWindow.valid) return res.status(400).json({ message: "Election name and valid start/end dates are required" });
    if (!["upcoming", "active", "completed"].includes(requestedStatus)) return res.status(400).json({ message: "Invalid election status" });
    if (requestedStatus === "active" && dateWindow.start && dateWindow.start.getTime() > Date.now()) return res.status(400).json({ message: "Election cannot start before its start time" });

    const result = await pool.query(
      `INSERT INTO elections (name, description, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [String(name).trim(), description || null, startDate || null, endDate || null, requestedStatus]
    );
    const election = await pool.query("SELECT id, name, description, start_date, end_date, status, created_at FROM elections WHERE id = $1", [result.rows[0].id]);
    await ensureNotaForElection(result.rows[0].id);
    await pool.query(
      "INSERT INTO election_eligibility (voter_id, election_id) SELECT id, $1 FROM users WHERE role = 'voter' ON CONFLICT DO NOTHING",
      [result.rows[0].id]
    );
    await logAudit(req.user.userId, "ELECTION_CREATED");
    res.status(201).json({ election: election.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create election" });
  }
});

app.put("/api/admin/elections/:id", authenticateToken, adminOnly, requireRecentMfa, async (req, res) => {
  try {
    const { name, description, startDate, endDate } = req.body;
    const dateWindow = validateElectionWindow(startDate, endDate);
    if (!String(name || "").trim() || !dateWindow.valid) return res.status(400).json({ message: "Election name and valid start/end dates are required" });
    const current = await pool.query("SELECT status FROM elections WHERE id = $1", [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ message: "Election not found" });
    if (current.rows[0].status !== "upcoming") return res.status(409).json({ message: "Started or completed elections cannot be edited" });
    const updated = await pool.query(
      "UPDATE elections SET name = $1, description = $2, start_date = $3, end_date = $4 WHERE id = $5",
      [String(name).trim(), description || null, startDate || null, endDate || null, req.params.id]
    );
    if (!updated.rowCount) return res.status(404).json({ message: "Election not found" });
    await logAudit(req.user.userId, "ELECTION_UPDATED");
    res.json({ message: "Election updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update election" });
  }
});

app.patch("/api/admin/elections/:id/status", authenticateToken, adminOnly, requireRecentMfa, async (req, res) => {
  try {
    const allowedStatuses = ["upcoming", "active", "completed"];
    const status = String(req.body.status || "").toLowerCase();
    if (!allowedStatuses.includes(status)) return res.status(400).json({ message: "Invalid election status" });

    const current = await pool.query("SELECT status, start_date, end_date FROM elections WHERE id = $1", [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ message: "Election not found" });
    const dateWindow = validateElectionWindow(current.rows[0].start_date, current.rows[0].end_date);
    if (!dateWindow.valid) return res.status(400).json({ message: "Election has invalid dates" });
    if (status === "active" && dateWindow.start && dateWindow.start.getTime() > Date.now()) return res.status(400).json({ message: "Election cannot start before its start time" });

    const result = await pool.query("UPDATE elections SET status = $1 WHERE id = $2", [status, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: "Election not found" });
    const election = await pool.query("SELECT id, name, status FROM elections WHERE id = $1", [req.params.id]);
    await logAudit(req.user.userId, `ELECTION_STATUS_${status.toUpperCase()}`);
    res.json({ election: election.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update election status" });
  }
});

// Admin: profile and security settings
app.get("/api/admin/profile", authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, email, phone, role FROM users WHERE id = $1 AND role = 'admin'", [req.user.userId]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Admin profile not found" });
    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to retrieve admin profile" });
  }
});

app.post("/api/admin/change-password", authenticateToken, adminOnly, requireRecentMfa, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ message: "Current password and a new password of at least 8 characters are required" });
    }

    const result = await pool.query("SELECT password FROM users WHERE id = $1 AND role = 'admin'", [req.user.userId]);
    if (result.rows.length === 0 || !(await bcrypt.compare(currentPassword, result.rows[0].password))) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [passwordHash, req.user.userId]);
    await logAudit(req.user.userId, "ADMIN_PASSWORD_CHANGED");
    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to change password" });
  }
});

// Admin dashboard
app.get(
  "/api/admin/dashboard",
  authenticateToken,
  adminOnly,
  requireRecentMfa,
  async (req, res) => {

    try {

      // Total voters
      const voters = await pool.query(
        `SELECT COUNT(*) AS count
         FROM users
         WHERE role = 'voter'`
      );

      const verifiedVoters = await pool.query(
        `SELECT COUNT(*) AS count FROM users WHERE role = 'voter' AND verified = 1`
      );

      const activeElection = await pool.query(
        `SELECT id, name, status FROM elections WHERE status = 'active' ORDER BY id DESC LIMIT 1`
      );

      // Total votes
      const votes = await pool.query(
        `SELECT COUNT(*) AS count FROM ballots`
      );

      // Total candidates
      const candidates = await pool.query(
        `SELECT COUNT(*) AS count FROM candidates`
      );

      // Results
      const verifiedBallots = await countVerifiedBallots();
      const results = await pool.query(`SELECT id, name, party FROM candidates ORDER BY id`);
      const resultRows = results.rows.map((candidate) => ({
        ...candidate,
        vote_count: verifiedBallots.counts.get(Number(candidate.id)) || 0,
      })).sort((left, right) => Number(right.vote_count) - Number(left.vote_count));

      res.json({
        totalVoters: Number(voters.rows[0].count),
        verifiedVoters: Number(verifiedVoters.rows[0].count),
        totalVotes: Number(votes.rows[0].count),
        totalCandidates: Number(candidates.rows[0].count),
        activeElection: activeElection.rows[0] || null,
        results: resultRows
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        message: "Failed to load dashboard"
      });
    }
  }
);

// Vote endpoint
app.post("/api/vote", sensitiveLimiter, authenticateToken, async (req, res) => {
  try {
    const { candidateId, electionId } = req.body;

    const userId = req.user && req.user.userId;
    const votingToken = req.headers["x-voting-token"];

    if (!candidateId) {
      return res.status(400).json({ message: "Candidate ID is required" });
    }

    if (!userId || !Number.isInteger(Number(electionId))) {
      return res.status(401).json({ message: "Invalid user in token" });
    }

    if (!votingToken) return res.status(403).json({ message: "Eligibility verification is required before voting" });

    const electionNumber = Number(electionId);
    const tokenResult = await pool.query(
      `SELECT id FROM voting_tokens
       WHERE token_hash = $1 AND voter_id = $2 AND election_id = $3
       AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
      [hashVotingToken(votingToken), userId, electionNumber]
    );
    if (tokenResult.rows.length === 0) return res.status(403).json({ message: "Voting token is expired, invalid, or already used" });

    // Check user
    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userResult.rows[0];

    // Check candidate
    const candidateResult = await pool.query("SELECT * FROM candidates WHERE id = $1 AND active = 1", [candidateId]);

    if (candidateResult.rows.length === 0) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    if (candidateResult.rows[0].election_id && Number(candidateResult.rows[0].election_id) !== electionNumber) {
      return res.status(403).json({ message: "Candidate is not part of this election" });
    }

    // Prepare activity features (allow client to supply real telemetry; fallback to defaults)
    const login_attempts = Number(req.body.login_attempts || 0);
    const failed_logins = Number(req.body.failed_logins || 0);
    const votes_per_minute = Number(req.body.votes_per_minute || 0);
    const ip_changes = Number(req.body.ip_changes || 0);
    const device_changes = Number(req.body.device_changes || 0);
    const session_duration = Number(req.body.session_duration || 0);

    // Call AI fraud detection service and persist prediction
    let prediction = 'normal';
    let aiWarning = null;

    if (process.env.MOCK_AI === 'true') {
      // Mock AI for testing environments
      prediction = 'normal';
    } else {
      try {
        const aiResponse = await axios.post(process.env.AI_SERVICE_URL || "http://127.0.0.1:8000/predict", {
          login_attempts,
          failed_logins,
          votes_per_minute,
          ip_changes,
          device_changes,
          session_duration
        });

        if (aiResponse.data && aiResponse.data.prediction) {
          prediction = String(aiResponse.data.prediction).toLowerCase();
        }
      } catch (aiErr) {
        console.warn("AI service error, using safe fallback heuristic:", aiErr.message || aiErr);
        prediction = getFallbackPrediction({
          login_attempts,
          failed_logins,
          votes_per_minute,
          ip_changes,
          device_changes,
          session_duration
        });
        aiWarning = "AI service unavailable; using local heuristic fallback";
      }
    }

    // Persist prediction record (always store, not only on suspicious)
    try {
      await pool.query(
        `INSERT INTO fraud_alerts (user_id, prediction, login_attempts, failed_logins, votes_per_minute, ip_changes, device_changes, session_duration)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [userId, prediction || 'unknown', login_attempts, failed_logins, votes_per_minute, ip_changes, device_changes, session_duration]
      );
    } catch (logErr) {
      console.error('Failed to persist fraud alert:', logErr);
    }

    if (prediction === "suspicious") {
      await logAudit(userId, "VOTE_BLOCKED_SUSPICIOUS");
      await logSecurityEvent(userId, "VOTE_REJECTED", "HIGH", "Vote rejected after suspicious activity evaluation", {
        voterId: userId,
        prediction,
        reason: "Suspicious activity signal crossed the rule threshold",
      });
      return res.status(403).json({
        message: "Suspicious activity detected",
        warning: aiWarning || null
      });
    }

    // Audit: vote attempt
    await logAudit(userId, "VOTE_ATTEMPT");

    const encryptedBallot = encryptBallot(electionNumber, Number(candidateId));
    const receiptReferenceValue = receiptReference();
    const receiptHash = crypto.createHash("sha256").update(receiptReferenceValue).digest("hex");

    // The legacy blockchain contract stores voter/candidate pairs, so it is not used
    // for anonymous ballots. Encrypted ballots are the authoritative record.
    try {
      const blockchainAvailable = false;

      if (!blockchainAvailable) {
        console.log('Blockchain not configured; using local demo voting mode for user', userId);

        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          const consumedToken = await client.query(
            `UPDATE voting_tokens SET used_at = CURRENT_TIMESTAMP
             WHERE token_hash = $1 AND voter_id = $2 AND election_id = $3
             AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
            [hashVotingToken(votingToken), userId, electionNumber]
          );

          if (!consumedToken.rowCount) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Voting token is expired, invalid, or already used' });
          }

          await client.query(
            `INSERT INTO ballots (election_id, iv, ciphertext, auth_tag, ballot_hash) VALUES ($1, $2, $3, $4, $5)`,
            [encryptedBallot.electionId, encryptedBallot.iv, encryptedBallot.ciphertext, encryptedBallot.authTag, encryptedBallot.ballotHash]
          );

          const markedEligibility = await client.query(
            `UPDATE election_eligibility SET voted_at = CURRENT_TIMESTAMP WHERE voter_id = $1 AND election_id = $2 AND eligible = 1 AND voted_at IS NULL`,
            [userId, electionNumber]
          );
          if (!markedEligibility.rowCount) throw new Error('Eligibility was already consumed');

          await client.query(
            `INSERT INTO receipts (voter_id, election_id, receipt_hash) VALUES ($1, $2, $3)`,
            [userId, electionNumber, receiptHash]
          );

          await client.query(`UPDATE users SET has_voted = TRUE WHERE id = $1`, [userId]);

          await client.query(
            `INSERT INTO user_activity (user_id, login_attempts, failed_logins, votes_per_minute, ip_changes, device_changes, session_duration)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, login_attempts, failed_logins, votes_per_minute, ip_changes, device_changes, session_duration]
          );

          await client.query('COMMIT');
        } catch (dbErr) {
          await client.query('ROLLBACK');
          console.error('DB transaction failed (demo mode):', dbErr);
          await logAudit(userId, 'VOTE_FAILED_DB');
          return res.status(500).json({ message: 'Database error while recording vote' });
        } finally {
          client.release();
        }

        await logAudit(userId, "VOTE_SUCCESS");

        return res.json({ message: 'Vote successfully recorded in demo mode', transactionHash: `demo-${Date.now()}`, receiptReference: receiptReferenceValue });
      }

      const alreadyVotedOnChain = await votingContract.hasVoted(userId);

      if (alreadyVotedOnChain) {
        await logAudit(userId, "VOTE_REJECTED_ONCHAIN");
        return res.status(400).json({ message: "Blockchain says voter has already voted" });
      }

      // Submit transaction to blockchain
      const tx = await votingContract.castVote(userId, candidateId);

      // Wait for confirmation
      const receipt = await tx.wait();

      console.log("Blockchain transaction:", receipt.transactionHash || receipt.hash);

      // Use DB transaction for local writes
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const consumedToken = await client.query(
          `UPDATE voting_tokens SET used_at = CURRENT_TIMESTAMP
           WHERE token_hash = $1 AND voter_id = $2 AND election_id = $3
           AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
          [hashVotingToken(votingToken), userId, electionNumber]
        );

        if (!consumedToken.rowCount) {
          await client.query("ROLLBACK");
          return res.status(403).json({ message: "Voting token is expired, invalid, or already used" });
        }

        await client.query(
          `INSERT INTO ballots (election_id, iv, ciphertext, auth_tag, ballot_hash) VALUES ($1, $2, $3, $4, $5)`,
          [encryptedBallot.electionId, encryptedBallot.iv, encryptedBallot.ciphertext, encryptedBallot.authTag, encryptedBallot.ballotHash]
        );

        const markedEligibility = await client.query(
          `UPDATE election_eligibility SET voted_at = CURRENT_TIMESTAMP WHERE voter_id = $1 AND election_id = $2 AND eligible = 1 AND voted_at IS NULL`,
          [userId, electionNumber]
        );
        if (!markedEligibility.rowCount) throw new Error("Eligibility was already consumed");

        await client.query(
          `INSERT INTO receipts (voter_id, election_id, receipt_hash) VALUES ($1, $2, $3)`,
          [userId, electionNumber, receiptHash]
        );

        await client.query(`UPDATE users SET has_voted = TRUE WHERE id = $1`, [userId]);

        await client.query(
          `INSERT INTO user_activity (user_id, login_attempts, failed_logins, votes_per_minute, ip_changes, device_changes, session_duration)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, login_attempts, failed_logins, votes_per_minute, ip_changes, device_changes, session_duration]
        );

        await client.query("COMMIT");
      } catch (dbErr) {
        await client.query("ROLLBACK");
        console.error("DB transaction failed:", dbErr);
        await logAudit(userId, "VOTE_FAILED_DB");
        return res.status(500).json({ message: "Database error while recording vote" });
      } finally {
        client.release();
      }

      await logAudit(userId, "VOTE_SUCCESS");

      res.json({ message: "Vote successfully recorded", transactionHash: receipt.transactionHash || receipt.hash, receiptReference: receiptReferenceValue });
    } catch (err) {
      console.error("Blockchain error:", err);
      await logAudit(userId, "VOTE_FAILED_CHAIN");
      return res.status(500).json({ message: "Blockchain transaction failed" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to submit vote" });
  }
});

app.get("/api/receipts/:reference", authenticateToken, async (req, res) => {
  try {
    const reference = String(req.params.reference || "");
    if (reference.length < 20 || reference.length > 100) return res.status(400).json({ message: "Invalid receipt reference" });
    const receiptHash = crypto.createHash("sha256").update(reference).digest("hex");
    const result = await pool.query(
      `SELECT r.created_at, r.election_id, e.name AS election_name
       FROM receipts r JOIN elections e ON e.id = r.election_id
       WHERE r.receipt_hash = $1 AND r.voter_id = $2`,
      [receiptHash, req.user.userId]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Receipt not found" });
    res.json({
      receiptReference: reference,
      electionId: result.rows[0].election_id,
      electionName: result.rows[0].election_name,
      status: "accepted",
      submittedAt: result.rows[0].created_at,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to retrieve receipt" });
  }
});


// Admin: blockchain votes
app.get(
  "/api/admin/blockchain-votes",
  authenticateToken,
  adminOnly,
  async (req, res) => {
    try {
      const votes = await getBlockchainVotes();

      res.json({ total: votes.length, votes });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to retrieve blockchain votes" });
    }
  }
);


// Admin: fraud alerts
app.get(
  "/api/admin/fraud-alerts",
  authenticateToken,
  adminOnly,
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          f.id,
          f.user_id,
          f.prediction,
          f.login_attempts,
          f.failed_logins,
          f.votes_per_minute,
          f.ip_changes,
          f.device_changes,
          f.session_duration,
          f.created_at
        FROM fraud_alerts f
        ORDER BY f.created_at DESC
      `);

      res.json({ alerts: result.rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to retrieve fraud alerts" });
    }
  }
);


// Admin: fraud summary
app.get(
  "/api/admin/fraud-summary",
  authenticateToken,
  adminOnly,
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          SUM(CASE WHEN prediction = 'normal' THEN 1 ELSE 0 END) AS normal_count,
          SUM(CASE WHEN prediction = 'suspicious' THEN 1 ELSE 0 END) AS suspicious_count
        FROM fraud_alerts
      `);

      res.json({
        normal: Number(result.rows[0].normal_count),
        suspicious: Number(result.rows[0].suspicious_count)
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to get fraud summary" });
    }
  }
);

app.get(
  "/api/admin/security-overview",
  authenticateToken,
  adminOnly,
  async (req, res) => {
    try {
      const overview = await getSecurityOverview();
      res.json(overview);
    } catch (error) {
      console.error("Security overview error:", error);
      res.status(500).json({ message: "Failed to load security overview" });
    }
  }
);

app.get(
  "/api/admin/activity-feed",
  authenticateToken,
  adminOnly,
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          a.id,
          a.user_id,
          a.action,
          a.created_at,
          u.name AS user_name,
          u.email
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.created_at DESC
        LIMIT 25
      `);

      res.json({ activities: result.rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to retrieve activity feed" });
    }
  }
);

app.get("/api/admin/audit/verify", authenticateToken, adminOnly, requireRecentMfa, async (req, res) => {
  try {
    await ensureAuditChain();
    res.json(await verifyAuditChain());
  } catch (error) {
    console.error("Audit verification error:", error);
    res.status(500).json({ message: "Failed to verify audit chain" });
  }
});

app.get("/api/admin/results/:electionId", authenticateToken, adminOnly, requireRecentMfa, async (req, res) => {
  try {
    const electionId = Number(req.params.electionId);
    if (!Number.isInteger(electionId) || electionId <= 0) return res.status(400).json({ message: "Invalid election ID" });
    const election = await pool.query("SELECT id, name, status FROM elections WHERE id = $1", [electionId]);
    if (election.rows.length === 0) return res.status(404).json({ message: "Election not found" });

    const verifiedBallots = await countVerifiedBallots(electionId);
    const candidates = await pool.query("SELECT id, name, party FROM candidates WHERE election_id = $1 OR election_id IS NULL ORDER BY id", [electionId]);
    const results = candidates.rows.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      party: candidate.party,
      vote_count: verifiedBallots.counts.get(Number(candidate.id)) || 0,
    }));
    const resultHash = crypto.createHash("sha256").update(JSON.stringify({ electionId, results, total: verifiedBallots.total })).digest("hex");
    await logAudit(req.user.userId, "RESULTS_GENERATED");
    res.json({ election: election.rows[0], total: verifiedBallots.total, invalid: verifiedBallots.invalid, results, resultHash });
  } catch (error) {
    console.error("Secure results error:", error);
    res.status(500).json({ message: "Failed to generate secure results" });
  }
});

app.get("/api/results/latest", authenticateToken, async (req, res) => {
  try {
    const electionResult = await pool.query("SELECT id, name, status FROM elections WHERE status = 'completed' ORDER BY id DESC LIMIT 1");
    if (electionResult.rows.length === 0) return res.status(403).json({ message: "Results are not available until an election is completed" });

    const election = electionResult.rows[0];
    const verifiedBallots = await countVerifiedBallots(election.id);
    const candidates = await pool.query("SELECT id, name, party FROM candidates WHERE election_id = $1 OR election_id IS NULL ORDER BY id", [election.id]);
    const results = candidates.rows.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      party: candidate.party,
      vote_count: verifiedBallots.counts.get(Number(candidate.id)) || 0,
    }));
    const resultHash = crypto.createHash("sha256").update(JSON.stringify({ electionId: election.id, results, total: verifiedBallots.total })).digest("hex");
    await logAudit(req.user.userId, "RESULTS_VIEWED");
    res.json({ election, total: verifiedBallots.total, invalid: verifiedBallots.invalid, results, resultHash });
  } catch (error) {
    console.error("Public results error:", error);
    res.status(500).json({ message: "Failed to retrieve secure results" });
  }
});

app.use((req, res) => {
  res.status(404).json({ message: "Resource not found" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === "entity.too.large") return res.status(413).json({ message: "Request body too large" });
  console.error("Unhandled API error:", error.message || error);
  res.status(500).json({ message: "Request could not be completed" });
});

const PORT = Number(process.env.PORT || 5002);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
