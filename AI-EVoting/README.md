# AI-EVoting (Step 2)

This folder contains the Step 2 scaffold: a React frontend and a Node.js + Express backend using PostgreSQL.

Follow the instructions in the root README to install and run.

## Biometric Verification

The voting review step requires two separate factors: the existing WebAuthn platform authentication and camera-based face verification. WebAuthn may prompt for fingerprint, face recognition, or secure device PIN. The camera flow sends transient frames to the server-side InsightFace service, which generates an ArcFace embedding, checks exactly one face per frame, and validates an active head-movement challenge. The server compares only with the authenticated voter's encrypted template and issues a single-use proof before eligibility is granted.

The camera flow does not claim depth sensing or certified presentation-attack detection. The active movement challenge is appropriate for this academic prototype, but production deployment requires an independently evaluated anti-spoofing model, liveness calibration, HTTPS, key management, consent and retention policies, and accessibility fallback procedures.

To run the real camera service, install Python 3.10+ and run `pip install -r ai/face_requirements.txt`, then start `python ai/face_service.py` from this directory. The Node backend runs on port 5002 and the service runs on port 8100 by default. Set `FACE_TEMPLATE_ENCRYPTION_KEY` to a base64-encoded 32-byte secret in production and optionally configure `FACE_SIMILARITY_THRESHOLD`.

For local development, the defaults are `localhost` and `http://localhost:5173`. For deployment, set `WEBAUTHN_RP_ID` to the deployment hostname and `WEBAUTHN_ORIGIN` to the exact HTTPS frontend origin. HTTPS is required outside localhost.

## Anonymous Encrypted Ballots

Votes are stored in the `ballots` table as AES-256-GCM ciphertext with a random 96-bit IV, authentication tag, election-bound associated data, and SHA-256 integrity hash. The ballot record contains no voter ID or candidate ID. Voter eligibility and one-person-one-vote state are stored separately in `election_eligibility`.

Set `BALLOT_ENCRYPTION_KEY` in production to a base64-encoded 32-byte secret supplied by a secret manager. The key is never sent to the frontend or committed to Git. Local development creates a `.ballot-key` file, which is ignored by Git. Rotating this key requires a controlled re-encryption migration before old ballots can be counted.

## Secure Counting and Audit Verification

Counting is backend-only. Each ballot is verified for its SHA-256 record hash, AES-GCM authentication, election binding, and candidate validity before it contributes to results. Invalid ballots are excluded and generate a generic `BALLOT_INTEGRITY_FAILURE` audit event without recording a candidate choice.

Audit events use a SHA-256 chain over canonical event data and the previous event hash. Administrators can verify the chain through the protected `/api/admin/audit/verify` endpoint and generate protected election results through `/api/admin/results/:electionId`.

## Authentication and API Security

JWT access sessions expire after 15 minutes and can be revoked through `/api/logout`. Browser state-changing requests with an Origin header must come from the configured local frontend origins; bearer authorization headers are required, so cross-site cookies cannot authorize actions. Express Helmet, request-size limits, API rate limits, sensitive-endpoint throttles, parameterized SQL, React escaped rendering, generic errors, and progressive login lockouts are enabled.

Security configuration variables include `JWT_SECRET`, `REQUEST_BODY_LIMIT`, `LOGIN_RATE_MAX`, `API_RATE_MAX`, `SENSITIVE_RATE_MAX`, `ACCOUNT_FAILURE_LIMIT`, `ACCOUNT_LOCK_MS`, and `REQUIRE_ADMIN_MFA`. Set `REQUIRE_ADMIN_MFA=true` in production to require a recent WebAuthn MFA proof for admin mutations, password changes, audit verification, dashboards, and result generation. Application-level throttling is not a substitute for infrastructure-level DDoS protection.
