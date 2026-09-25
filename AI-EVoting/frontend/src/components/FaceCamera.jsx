import React, { useEffect, useRef, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5002";

function FaceCamera({ operation, onComplete, onCancel }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [state, setState] = useState("Preparing camera");
    const [error, setError] = useState("");
    const [challenge, setChallenge] = useState(null);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        let active = true;
        const start = async () => {
            try {
                setState("Preparing camera");
                const token = localStorage.getItem("token");
                const challengeResponse = await fetch(`${API_BASE_URL}/api/face/challenge`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ operation }),
                });
                const challengeData = await challengeResponse.json();
                if (!challengeResponse.ok) throw new Error(challengeData.message || "Unable to start camera verification.");
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
                if (!active) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                streamRef.current = stream;
                videoRef.current.srcObject = stream;
                setChallenge(challengeData);
                setState("Position your face");
            } catch (startError) {
                setError(startError.name === "NotAllowedError" ? "Camera permission denied" : startError.message || "Camera could not be prepared.");
                setState("Verification failed");
            }
        };
        if (!navigator.mediaDevices?.getUserMedia) {
            setError("This browser does not provide camera access.");
            setState("Verification failed");
        } else {
            start();
        }
        return () => {
            active = false;
            streamRef.current?.getTracks().forEach((track) => track.stop());
        };
    }, [operation]);

    const captureFrames = async () => {
        if (!challenge || !videoRef.current) return;
        setError("");
        setState("Liveness verification");
        const canvas = document.createElement("canvas");
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
        const frames = [];
        for (let index = 0; index < 3; index += 1) {
            const context = canvas.getContext("2d", { alpha: false });
            context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            frames.push(canvas.toDataURL("image/jpeg", 0.78));
            setProgress(index + 1);
            if (index < 2) await new Promise((resolve) => window.setTimeout(resolve, 900));
        }
        setState("Verifying identity");
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_BASE_URL}/api/face/${operation}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ challengeId: challenge.challengeId, challenge: challenge.challenge, frames }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Face verification failed.");
        setState("Face verified");
        onComplete(data);
    };

    const startCapture = () => {
        captureFrames().catch((captureError) => {
            setState("Verification failed");
            setError(captureError.message || "Face verification failed.");
        });
    };

    return (
        <div className="face-camera" role="dialog" aria-modal="true" aria-labelledby="face-camera-title">
            <div className="face-camera-header">
                <span className="face-lock" aria-hidden="true">🔐</span>
                <div>
                    <h2 id="face-camera-title">Face verification</h2>
                    <p>Verify your identity</p>
                </div>
            </div>
            <div className="face-camera-stage">
                <video ref={videoRef} autoPlay muted playsInline className="face-camera-video" />
                <div className="face-guide" aria-hidden="true" />
            </div>
            <p className="face-camera-state">{state}</p>
            <p className="face-camera-instruction">Keep one face in frame, then slowly turn your head left and right.</p>
            {progress > 0 && <progress value={progress} max="3" aria-label="Liveness capture progress" />}
            {error && <p className="face-camera-error">{error}</p>}
            <div className="face-camera-actions">
                <button type="button" className="button-secondary" onClick={onCancel}>Cancel</button>
                <button type="button" className="button-primary" onClick={startCapture} disabled={!challenge || state === "Liveness verification" || state === "Verifying identity"}>Capture and verify</button>
            </div>
        </div>
    );
}

export default FaceCamera;
