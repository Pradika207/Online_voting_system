import os

from flask import Flask, request, jsonify
import joblib
import pandas as pd

app = Flask(__name__)

# Load trained model and encoder
model = joblib.load("fraud_model.pkl")
encoder = joblib.load("label_encoder.pkl")

features = [
    "login_attempts",
    "failed_logins",
    "votes_per_minute",
    "ip_changes",
    "device_changes",
    "session_duration"
]

@app.route("/")
def home():
    return jsonify({
        "message": "AI Fraud Detection Service Running"
    })


@app.route("/predict", methods=["POST"])
def predict():

    data = request.json

    input_data = pd.DataFrame(
        [[
            data.get("login_attempts", 0),
            data.get("failed_logins", 0),
            data.get("votes_per_minute", 0),
            data.get("ip_changes", 0),
            data.get("device_changes", 0),
            data.get("session_duration", 0)
        ]],
        columns=features
    )

    prediction = model.predict(input_data)[0]

    label = encoder.inverse_transform([prediction])[0]

    return jsonify({
        "prediction": label
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )
