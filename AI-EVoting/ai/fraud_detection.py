import pandas as pd
from sklearn.ensemble import IsolationForest

data = {
    "login_attempts": [1, 2, 1, 3, 2, 1, 20, 25, 18, 30],
    "votes_per_minute": [1, 1, 1, 1, 2, 1, 15, 20, 18, 25],
    "ip_changes": [0, 0, 1, 0, 0, 1, 8, 10, 7, 12]
}

df = pd.DataFrame(data)

print(df)

model = IsolationForest(
    contamination=0.2,
    random_state=42
)

model.fit(df)

new_activity = [[2, 1, 0]]

prediction = model.predict(new_activity)

if prediction[0] == 1:
    print("Normal activity")
else:
    print("Suspicious activity")
