# AI Fraud Detection Service

This simple Flask service uses an Isolation Forest to detect anomalous voting/login behavior.

Setup

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

API

POST `/predict` with JSON:

```
{
  "login_attempts": 2,
  "votes_per_minute": 1,
  "ip_changes": 0
}
```

Response:

```
{ "prediction": "normal" }
```
