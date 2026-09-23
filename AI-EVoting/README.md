# AI-EVoting (Step 2)

This folder contains the Step 2 scaffold: a React frontend and a Node.js + Express backend using PostgreSQL.

Follow the instructions in the root README to install and run.

## Biometric Verification

The voting review step uses WebAuthn platform authentication. A supported browser/device may prompt for fingerprint, face recognition, or secure device PIN. Biometric data and private keys remain on the device; the server stores only the WebAuthn credential public key and signature counter.

For local development, the defaults are `localhost` and `http://localhost:5173`. For deployment, set `WEBAUTHN_RP_ID` to the deployment hostname and `WEBAUTHN_ORIGIN` to the exact HTTPS frontend origin. HTTPS is required outside localhost.
