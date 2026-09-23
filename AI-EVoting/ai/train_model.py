import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.preprocessing import LabelEncoder
import joblib

# Load dataset
df = pd.read_csv("voting_activity.csv")

# Features
features = [
    "login_attempts",
    "failed_logins",
    "votes_per_minute",
    "ip_changes",
    "device_changes",
    "session_duration"
]

X = df[features]

# Target
y = df["label"]

encoder = LabelEncoder()
y = encoder.fit_transform(y)

# Split dataset
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.3,
    random_state=42,
    stratify=y
)

# Train model
model = RandomForestClassifier(
    n_estimators=100,
    random_state=42
)

model.fit(X_train, y_train)

# Test model
predictions = model.predict(X_test)

accuracy = accuracy_score(
    y_test,
    predictions
)

print("Accuracy:", accuracy)
print(classification_report(y_test, predictions))

# Save model
joblib.dump(
    model,
    "fraud_model.pkl"
)

joblib.dump(
    encoder,
    "label_encoder.pkl"
)

print("Model saved successfully!")
