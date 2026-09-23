const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const helmet = require("helmet");
require("dotenv").config();

const pool = require("./db");
const authenticateToken = require("./middleware/auth");
const { votingContract, getBlockchainVotes } = require("./blockchain");
const axios = require("axios");
const adminOnly = require("./middleware/admin");

const app = express();
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';

function normalizePhone(phone) {
  return String(phone || "").trim();
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
app.use(express.json());

// Rate limiter for login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 5 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again later." }
});

// Helper: audit logging
async function logAudit(userId, action) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action) VALUES ($1, $2)`,
      [userId || null, action]
    );
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

app.get("/", (req, res) => {
  res.json({ message: "AI E-Voting Backend is running", otpProvider: "Firebase Phone Authentication" });
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

      const { name, email, password, phone, firebaseVerified } = req.body;
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const normalizedPhone = normalizePhone(phone);

      if (!normalizedEmail || !normalizedPhone) {
        return res.status(400).json({ message: "Email and phone number are required." });
      }

      if (firebaseVerified === true) {
        const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
        if (existingUser.rows.length > 0) {
          return res.status(409).json({ message: "This email is already registered." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const insertRes = await pool.query(
          `INSERT INTO users (name, email, phone, password, role)
           VALUES ($1, $2, $3, $4, 'voter') RETURNING id`,
          [name, normalizedEmail, normalizedPhone, hashedPassword]
        );

        await logAudit(insertRes.rows[0].id, "REGISTER");
        return res.status(201).json({ message: "Registration successful. Please login to continue." });
      }

      return res.status(400).json({
        message: "Complete phone verification with Firebase before registering.",
      });
    } catch (error) {
      console.error("Registration error:", error);
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

      const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

      if (result.rows.length === 0) {
        // Audit: login failed (unknown email)
        await logAudit(null, "LOGIN_FAILED");
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const user = result.rows[0];

      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        // Audit: login failed for this user
        await logAudit(user.id, "LOGIN_FAILED");
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, jwtSecret, { expiresIn: "1h" });

      // Audit: login success
      await logAudit(user.id, "LOGIN_SUCCESS");

      res.json({ message: "Login successful", token });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Get candidates
app.get("/api/candidates", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, party, photo_url, manifesto, election_id FROM candidates ORDER BY id"
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch candidates" });
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
app.post("/api/admin/candidates", authenticateToken, adminOnly, async (req, res) => {
  try {
    const { name, party, photoUrl, manifesto, electionId } = req.body;
    if (!String(name || "").trim()) return res.status(400).json({ message: "Candidate name is required" });

    const result = await pool.query(
      `INSERT INTO candidates (name, party, photo_url, manifesto, election_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [String(name).trim(), party || null, photoUrl || null, manifesto || null, electionId || null]
    );
    const candidate = await pool.query("SELECT id, name, party, photo_url, manifesto, election_id FROM candidates WHERE id = $1", [result.rows[0].id]);
    await logAudit(req.user.userId, "CANDIDATE_CREATED");
    res.status(201).json({ candidate: candidate.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create candidate" });
  }
});

app.put("/api/admin/candidates/:id", authenticateToken, adminOnly, async (req, res) => {
  try {
    const { name, party, photoUrl, manifesto, electionId } = req.body;
    if (!String(name || "").trim()) return res.status(400).json({ message: "Candidate name is required" });

    const result = await pool.query(
      `UPDATE candidates SET name = $1, party = $2, photo_url = $3, manifesto = $4, election_id = $5
       WHERE id = $6`,
      [String(name).trim(), party || null, photoUrl || null, manifesto || null, electionId || null, req.params.id]
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

app.delete("/api/admin/candidates/:id", authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM candidates WHERE id = $1", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: "Candidate not found" });
    await logAudit(req.user.userId, "CANDIDATE_DELETED");
    res.json({ message: "Candidate deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Candidate cannot be deleted after votes are recorded" });
  }
});

// Admin: election management
app.get("/api/admin/elections", authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, description, start_date, end_date, status, created_at FROM elections ORDER BY id DESC");
    res.json({ elections: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to retrieve elections" });
  }
});

app.post("/api/admin/elections", authenticateToken, adminOnly, async (req, res) => {
  try {
    const { name, description, startDate, endDate, status } = req.body;
    if (!String(name || "").trim()) return res.status(400).json({ message: "Election name is required" });

    const result = await pool.query(
      `INSERT INTO elections (name, description, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [String(name).trim(), description || null, startDate || null, endDate || null, status || "upcoming"]
    );
    const election = await pool.query("SELECT id, name, description, start_date, end_date, status, created_at FROM elections WHERE id = $1", [result.rows[0].id]);
    await logAudit(req.user.userId, "ELECTION_CREATED");
    res.status(201).json({ election: election.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create election" });
  }
});

app.patch("/api/admin/elections/:id/status", authenticateToken, adminOnly, async (req, res) => {
  try {
    const allowedStatuses = ["upcoming", "active", "completed"];
    const status = String(req.body.status || "").toLowerCase();
    if (!allowedStatuses.includes(status)) return res.status(400).json({ message: "Invalid election status" });

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

app.post("/api/admin/change-password", authenticateToken, adminOnly, async (req, res) => {
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
        `SELECT COUNT(*) AS count FROM votes`
      );

      // Total candidates
      const candidates = await pool.query(
        `SELECT COUNT(*) AS count FROM candidates`
      );

      // Results
      const results = await pool.query(
        `SELECT 
          c.id,
          c.name,
          c.party,
          COUNT(v.id) AS vote_count
         FROM candidates c
         LEFT JOIN votes v
         ON c.id = v.candidate_id
         GROUP BY c.id
         ORDER BY vote_count DESC`
      );

      res.json({
        totalVoters: Number(voters.rows[0].count),
        verifiedVoters: Number(verifiedVoters.rows[0].count),
        totalVotes: Number(votes.rows[0].count),
        totalCandidates: Number(candidates.rows[0].count),
        activeElection: activeElection.rows[0] || null,
        results: results.rows
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
app.post("/api/vote", authenticateToken, async (req, res) => {
  try {
    const { candidateId } = req.body;

    const userId = req.user && req.user.userId;

    if (!candidateId) {
      return res.status(400).json({ message: "Candidate ID is required" });
    }

    if (!userId) {
      return res.status(401).json({ message: "Invalid user in token" });
    }

    // Check user
    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userResult.rows[0];

    // Prevent double voting
    if (user.has_voted) {
      return res.status(400).json({ message: "You have already voted" });
    }

    // Check candidate
    const candidateResult = await pool.query("SELECT * FROM candidates WHERE id = $1", [candidateId]);

    if (candidateResult.rows.length === 0) {
      return res.status(404).json({ message: "Candidate not found" });
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
      return res.status(403).json({
        message: "Suspicious activity detected",
        warning: aiWarning || null
      });
    }

    // Audit: vote attempt
    await logAudit(userId, "VOTE_ATTEMPT");

    // Check blockchain and submit on-chain
    try {
      const blockchainAvailable = !!(votingContract && process.env.CONTRACT_ADDRESS && process.env.CONTRACT_ADDRESS !== '');

      if (!blockchainAvailable) {
        console.log('Blockchain not configured; using local demo voting mode for user', userId);

        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          await client.query(
            `INSERT INTO votes (user_id, candidate_id) VALUES ($1, $2)`,
            [userId, candidateId]
          );

          await client.query(
            `UPDATE users SET has_voted = TRUE WHERE id = $1`,
            [userId]
          );

          await client.query(
            `INSERT INTO user_activity (user_id, login_attempts, failed_logins, votes_per_minute, ip_changes, device_changes, session_duration)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, login_attempts, failed_logins, votes_per_minute, ip_changes, device_changes, session_duration]
          );

          await client.query(
            `INSERT INTO audit_logs (user_id, action) VALUES ($1, $2)`,
            [userId, 'VOTE_SUCCESS']
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

        return res.json({ message: 'Vote successfully recorded in demo mode', transactionHash: `demo-${Date.now()}` });
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

        await client.query(
          `INSERT INTO votes (user_id, candidate_id) VALUES ($1, $2)`,
          [userId, candidateId]
        );

        await client.query(
          `UPDATE users SET has_voted = TRUE WHERE id = $1`,
          [userId]
        );

        await client.query(
          `INSERT INTO user_activity (user_id, login_attempts, failed_logins, votes_per_minute, ip_changes, device_changes, session_duration)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, login_attempts, failed_logins, votes_per_minute, ip_changes, device_changes, session_duration]
        );

        await client.query(
          `INSERT INTO audit_logs (user_id, action) VALUES ($1, $2)`,
          [userId, "VOTE_SUCCESS"]
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

      res.json({ message: "Vote successfully recorded", transactionHash: receipt.transactionHash || receipt.hash });
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

const PORT = Number(process.env.PORT || 5002);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
