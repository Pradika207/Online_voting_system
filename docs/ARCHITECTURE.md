# System Architecture

High-level architecture:

```
                 User
                  │
          Web Application
       (React / Angular)
                  │
      Authentication (Login)
                  │
          Cast Vote Button
                  │
      AI Fraud Detection Module
                  │
      Blockchain Smart Contract
                  │
       Blockchain Ledger
                  │
        Admin Dashboard
```

Modules:
- `frontend` - React UI
- `backend` - Node.js + Express API
- `blockchain` - smart contracts (Solidity + Hardhat)
- `ai` - fraud detection models and pipeline (Python)
- `database` - MongoDB schemas and migrations
