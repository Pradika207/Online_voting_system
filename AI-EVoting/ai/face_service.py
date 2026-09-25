"""Server-side face embeddings for the academic camera-verification prototype.

This service uses InsightFace ArcFace embeddings and SCRFD detection. It performs
an active temporal head-movement challenge across three camera frames. This is
liveness evidence, not a depth sensor or a certified presentation-attack detector.
"""

import base64
import os

import cv2
import numpy as np
from flask import Flask, jsonify, request
from insightface.app import FaceAnalysis

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024
MODEL_NAME = os.environ.get("FACE_MODEL", "buffalo_l")
face_app = FaceAnalysis(name=MODEL_NAME, providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=0, det_size=(640, 640))


def decode_frame(value):
    if not isinstance(value, str):
        raise ValueError("Invalid frame")
    encoded = value.split(",", 1)[-1]
    image = cv2.imdecode(np.frombuffer(base64.b64decode(encoded), dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unreadable frame")
    return image


def inspect_frames(frame_values):
    if not 3 <= len(frame_values) <= 8:
        raise ValueError("Three to eight frames are required")
    embeddings = []
    centers = []
    for value in frame_values:
        faces = face_app.get(decode_frame(value))
        if len(faces) != 1:
            raise ValueError("Exactly one face must be visible")
        face = faces[0]
        embedding = np.asarray(face.normed_embedding, dtype=np.float32)
        if embedding.size == 0:
            raise ValueError("Face embedding unavailable")
        embeddings.append(embedding)
        left, top, right, bottom = face.bbox
        centers.append(float((left + right) / 2.0))
    movement = max(centers) - min(centers)
    first_width = max(1.0, float(faces[0].bbox[2] - faces[0].bbox[0]))
    liveness_passed = movement / first_width >= float(os.environ.get("FACE_MIN_MOVEMENT_RATIO", "0.12"))
    return embeddings, liveness_passed


def cosine_similarity(left, right):
    left = np.asarray(left, dtype=np.float32)
    right = np.asarray(right, dtype=np.float32)
    denominator = np.linalg.norm(left) * np.linalg.norm(right)
    return float(np.dot(left, right) / denominator) if denominator else 0.0


@app.get("/health")
def health():
    return jsonify({"service": "face", "model": MODEL_NAME, "status": "ready"})


@app.get("/")
def home():
    return jsonify({"service": "face", "status": "ready", "health": "/health"})


@app.post("/enroll")
def enroll():
    try:
        embeddings, liveness_passed = inspect_frames(request.json.get("frames", []))
        averaged = np.mean(np.stack(embeddings), axis=0)
        averaged /= max(np.linalg.norm(averaged), 1e-8)
        return jsonify({"embedding": averaged.astype(float).tolist(), "livenessPassed": liveness_passed, "model": "insightface-arcface", "version": "1"})
    except (ValueError, KeyError, TypeError, base64.binascii.Error) as error:
        return jsonify({"message": str(error), "livenessPassed": False}), 400


@app.post("/verify")
def verify():
    try:
        embeddings, liveness_passed = inspect_frames(request.json.get("frames", []))
        current = np.mean(np.stack(embeddings), axis=0)
        current /= max(np.linalg.norm(current), 1e-8)
        similarity = cosine_similarity(current, request.json.get("template", []))
        return jsonify({"similarity": similarity, "livenessPassed": liveness_passed, "model": "insightface-arcface", "version": "1"})
    except (ValueError, KeyError, TypeError, base64.binascii.Error) as error:
        return jsonify({"message": str(error), "livenessPassed": False, "similarity": 0}), 400


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("FACE_PORT", "8100")), debug=False)
