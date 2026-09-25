import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import FaceCamera from "../components/FaceCamera";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5002";

function ReviewVote() {
    const navigate = useNavigate();
    const candidate = JSON.parse(localStorage.getItem("pendingVote") || "null");
    const [biometricEnrolled, setBiometricEnrolled] = useState(false);
    const [biometricBusy, setBiometricBusy] = useState(false);
    const [election, setElection] = useState(null);
    const [eligibilityVerified, setEligibilityVerified] = useState(false);
    const [message, setMessage] = useState("");
    const [supportsWebAuthn, setSupportsWebAuthn] = useState(false);
    const [faceEnrolled, setFaceEnrolled] = useState(false);
    const [faceBusy, setFaceBusy] = useState(false);
    const [faceMode, setFaceMode] = useState(null);
    const [faceProof, setFaceProof] = useState("");
    const isMobileDevice = (() => {
        if (typeof navigator === "undefined") return false;
        const userAgent = navigator.userAgent || "";
        const mobileAgent = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
        const touchCapable = typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0;
        const narrowViewport = typeof window !== "undefined" && window.innerWidth <= 768;
        return mobileAgent || (narrowViewport && touchCapable);
    })();

    const clearSessionAndRedirect = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("biometricToken");
        localStorage.removeItem("votingToken");
        localStorage.removeItem("votingElectionId");
        navigate("/login", { replace: true, state: { message: "Your session expired. Please log in again." } });
    };

    const isSessionError = (message) => /invalid or expired token|access token required|session is invalid/i.test(message || "");

    const getWebAuthnErrorMessage = (error, fallback) => {
        if (error?.name === "NotAllowedError") return "Verification cancelled.";
        if (error?.name === "NotSupportedError" || error?.name === "SecurityError") {
            return "This device or browser cannot complete WebAuthn/passkey verification.";
        }
        return error?.message || fallback;
    };

    useEffect(() => {
        setSupportsWebAuthn(browserSupportsWebAuthn());
        const token = localStorage.getItem("token");
        fetch(`${API_BASE_URL}/api/biometric/status`, { headers: { Authorization: `Bearer ${token}` } })
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || "Unable to check biometric verification status.");
                return data;
            })
            .then((data) => setBiometricEnrolled(Boolean(data.enrolled)))
            .catch((error) => {
                if (isSessionError(error.message)) {
                    clearSessionAndRedirect();
                    return;
                }
                setMessage(error.message || "Unable to check biometric verification status.");
            });
        fetch(`${API_BASE_URL}/api/face/status`, { headers: { Authorization: `Bearer ${token}` } })
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || "Unable to check camera face status.");
                return data;
            })
            .then((data) => setFaceEnrolled(Boolean(data.enrolled)))
            .catch((error) => setMessage(error.message || "Unable to check camera face status."));
        fetch(`${API_BASE_URL}/api/elections/active`, { headers: { Authorization: `Bearer ${token}` } })
            .then((response) => response.json())
            .then((data) => setElection(data.election || null))
            .catch(() => setMessage("There is no active election available."));
    }, []);

    const completeFaceFlow = async (data) => {
        setFaceBusy(false);
        setFaceMode(null);
        if (faceMode === "enrollment") {
            setFaceEnrolled(true);
            setMessage("Camera face verification enrolled. Continue with verification before voting.");
        } else {
            setFaceProof(data.faceProof || "");
            setMessage("Face verified. Continue with device verification.");
        }
    };

    const ensureWebAuthnSupport = () => {
        const supported = browserSupportsWebAuthn();
        setSupportsWebAuthn(supported);
        if (!supported) {
            setMessage("This device does not support WebAuthn/passkey authentication. Please use a supported device or complete the required manual verification flow.");
            return false;
        }
        return true;
    };

    const enrollBiometric = async () => {
        setBiometricBusy(true);
        setMessage("");
        try {
            if (!ensureWebAuthnSupport()) return;
            const token = localStorage.getItem("token");
            const optionsResponse = await fetch(`${API_BASE_URL}/api/biometric/register/options`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
            const options = await optionsResponse.json();
            if (!optionsResponse.ok) {
                if (isSessionError(options.message)) {
                    clearSessionAndRedirect();
                    return;
                }
                throw new Error(options.message || "Unable to start biometric enrollment.");
            }
            const credential = await startRegistration({ optionsJSON: options });
            const verifyResponse = await fetch(`${API_BASE_URL}/api/biometric/register/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ optionsChallenge: options.challenge, response: credential }),
            });
            const data = await verifyResponse.json();
            if (!verifyResponse.ok) {
                if (isSessionError(data.message)) {
                    clearSessionAndRedirect();
                    return;
                }
                throw new Error(data.message || "Biometric enrollment failed.");
            }
            setBiometricEnrolled(true);
            setMessage("Biometric verification enrolled. Verify again to continue.");
        } catch (error) {
            setMessage(error.message || "Biometric enrollment was cancelled.");
        } finally {
            setBiometricBusy(false);
        }
    };

    const verifyBiometric = async () => {
        setBiometricBusy(true);
        setMessage("");
        try {
            if (!ensureWebAuthnSupport()) return;
            const token = localStorage.getItem("token");
            const optionsResponse = await fetch(`${API_BASE_URL}/api/biometric/authenticate/options`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
            const options = await optionsResponse.json();
            if (!optionsResponse.ok) {
                if (isSessionError(options.message)) {
                    clearSessionAndRedirect();
                    return;
                }
                throw new Error(options.message || "Unable to start biometric verification.");
            }
            if (!faceProof) throw new Error("Complete camera face verification first.");
            let assertion;
            try {
                assertion = await startAuthentication({ optionsJSON: options });
            } catch (error) {
                setMessage(getWebAuthnErrorMessage(error, "Biometric/device verification failed. Please try again."));
                return;
            }
            const verifyResponse = await fetch(`${API_BASE_URL}/api/biometric/authenticate/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ optionsChallenge: options.challenge, response: assertion }),
            });
            const data = await verifyResponse.json();
            if (!verifyResponse.ok) {
                if (isSessionError(data.message)) {
                    clearSessionAndRedirect();
                    return;
                }
                throw new Error("Biometric/device verification failed. Please try again.");
            }
            localStorage.setItem("biometricToken", data.biometricToken);
            await verifyEligibility(data.biometricToken);
        } catch (error) {
            setMessage(getWebAuthnErrorMessage(error, "Biometric/device verification failed. Please try again."));
        } finally {
            setBiometricBusy(false);
        }
    };

    const verifyEligibility = async (biometricToken = localStorage.getItem("biometricToken")) => {
        if (!election) throw new Error("No active election is available.");
        const response = await fetch(`${API_BASE_URL}/api/voter/eligibility`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                "X-Biometric-Token": biometricToken,
                "X-Face-Proof": faceProof,
            },
            body: JSON.stringify({ electionId: election.id }),
        });
        const data = await response.json();
        if (!response.ok) {
            if (isSessionError(data.message)) {
                clearSessionAndRedirect();
                return;
            }
            throw new Error(data.message || "Eligibility verification failed.");
        }
        localStorage.setItem("votingToken", data.votingToken);
        localStorage.setItem("votingElectionId", String(data.electionId));
        setEligibilityVerified(true);
        setMessage("Account, biometric, and election eligibility checks passed.");
    };

    const confirmVote = async () => {
        if (!candidate) {
            navigate("/vote");
            return;
        }

        if (localStorage.getItem("voteSubmitted") === "true") {
            navigate("/confirmation");
            return;
        }

        const token = localStorage.getItem("token");
        const votingToken = localStorage.getItem("votingToken");
        const votingElectionId = localStorage.getItem("votingElectionId");

        const response = await fetch(`${API_BASE_URL}/api/vote`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(votingToken ? { "X-Voting-Token": votingToken } : {}),
            },
            body: JSON.stringify({ candidateId: candidate.id, electionId: Number(votingElectionId) })
        });

        const data = await response.json();
        localStorage.setItem("lastTx", data.transactionHash || "");

        if (response.ok) {
            localStorage.setItem("voteSubmitted", "true");
            localStorage.setItem("lastReceiptReference", data.receiptReference || "");
            localStorage.setItem("lastVoteElectionName", election?.name || "");
            localStorage.setItem("lastVoteSubmittedAt", new Date().toISOString());
            localStorage.setItem("lastVoteStatus", "accepted");
            localStorage.removeItem("pendingVote");
            localStorage.removeItem("biometricToken");
            localStorage.removeItem("votingToken");
            localStorage.removeItem("votingElectionId");
            navigate("/confirmation");
            return;
        }

        alert(data.message || "Vote could not be recorded.");
    };

    const pageStyle = {
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eff6ff 100%)",
        color: "#0f172a",
    };

    const wrap = {
        maxWidth: 900,
        margin: "0 auto",
        padding: "56px 24px",
    };

    const card = {
        background: "rgba(255,255,255,0.96)",
        border: "1px solid rgba(148,163,184,0.3)",
        borderRadius: 28,
        padding: 32,
        boxShadow: "0 18px 40px rgba(15, 23, 42, 0.12)",
    };

    const buttonPrimary = {
        border: "none",
        background: "linear-gradient(135deg, #16a34a, #15803d)",
        color: "#fff",
        fontWeight: 800,
        borderRadius: 12,
        padding: "12px 18px",
        cursor: "pointer",
    };

    const buttonSecondary = {
        border: "1px solid #cbd5e1",
        background: "#fff",
        color: "#0f172a",
        fontWeight: 700,
        borderRadius: 12,
        padding: "12px 18px",
        cursor: "pointer",
        textDecoration: "none",
        display: "inline-block",
        marginRight: 10,
    };

    if (!candidate) {
        return (
            <div style={pageStyle}>
                <Navbar />
                <main style={wrap}>
                    <div style={card}>
                        <h2>No candidate selected</h2>
                        <Link to="/vote" style={buttonSecondary}>Go back to vote</Link>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div style={pageStyle}>
            <Navbar />

            <main style={wrap}>
                <div style={card}>
                    <h1 style={{ marginTop: 0, marginBottom: 16, fontSize: 36 }}>Review Your Vote</h1>

                    <p style={{ color: "#475569", marginBottom: 12 }}><strong>Election:</strong> {election?.name || "Loading active election..."}</p>
                    <p style={{ color: "#475569", marginBottom: 12 }}><strong>Your selected candidate:</strong></p>

                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 20, padding: 24, marginBottom: 24 }}>
                        <h2 style={{ marginTop: 0, marginBottom: 8 }}>{candidate.name}</h2>
                        <p style={{ margin: "0 0 10px", color: "#1d4ed8", fontWeight: 700 }}>{candidate.party}</p>
                        <p style={{ margin: 0, color: "#475569" }}>Please confirm that this is your final vote.</p>
                    </div>

                    <div style={{ marginBottom: 24, color: "#334155", fontWeight: 600 }}>
                        ⚠️ Once submitted, your vote cannot be changed.
                    </div>

                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 18, padding: 20, marginBottom: 24 }}>
                        <h3 style={{ marginTop: 0 }}>Two-factor biometric verification</h3>
                        <ul style={{ lineHeight: 1.8, paddingLeft: 20, color: "#334155" }}>
                            <li>✓ Account verified</li>
                            <li>{faceEnrolled ? "✓" : "○"} Camera face template enrolled</li>
                            <li>{biometricEnrolled ? "✓" : "○"} {isMobileDevice ? "Mobile device authentication enrolled" : "WebAuthn device authentication enrolled"}</li>
                            <li>{eligibilityVerified ? "✓" : "○"} Eligible for this election</li>
                            <li>{eligibilityVerified ? "✓ Voting status: Not yet voted" : "○ Voting status: Pending verification"}</li>
                        </ul>
                        <p style={{ color: "#475569" }}>
                            {faceProof ? "Face verified. Complete device authentication to continue." : "Camera verification uses a live head-movement challenge and compares only with your enrolled voter template."}
                        </p>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            {!faceEnrolled && !faceMode && (
                                <button type="button" onClick={() => { setFaceBusy(true); setFaceMode("enrollment"); }} disabled={faceBusy} style={buttonSecondary}>
                                    Enroll camera face
                                </button>
                            )}
                            {faceEnrolled && !faceProof && !faceMode && (
                                <button type="button" onClick={() => { setFaceBusy(true); setFaceMode("verify"); }} disabled={faceBusy} style={buttonPrimary}>
                                    Verify with camera
                                </button>
                            )}
                            {!biometricEnrolled && (
                                <button type="button" onClick={enrollBiometric} disabled={biometricBusy || !supportsWebAuthn} style={buttonSecondary}>
                                    {biometricBusy ? "Waiting for device..." : "Enroll WebAuthn device"}
                                </button>
                            )}
                            {biometricEnrolled && faceProof && !eligibilityVerified && (
                                <button type="button" onClick={verifyBiometric} disabled={biometricBusy || !election || !supportsWebAuthn} style={buttonPrimary}>
                                    {biometricBusy ? "Checking..." : "Verify WebAuthn device"}
                                </button>
                            )}
                        </div>
                        {faceMode && <FaceCamera operation={faceMode === "enrollment" ? "enrollment" : "verify"} onComplete={completeFaceFlow} onCancel={() => { setFaceBusy(false); setFaceMode(null); }} />}
                        <p style={{ minHeight: 24, color: message.toLowerCase().includes("failed") || message.toLowerCase().includes("unable") || message.toLowerCase().includes("support") || message.toLowerCase().includes("device does not support") ? "#b91c1c" : "#166534", marginBottom: 0 }}>{message || (supportsWebAuthn ? "Ready to verify" : "WebAuthn unsupported on this device")}</p>
                    </div>

                    <div>
                        <Link to="/vote" style={buttonSecondary}>Go Back</Link>
                        <button type="button" onClick={confirmVote} disabled={!eligibilityVerified || !localStorage.getItem("votingToken")} style={{ ...buttonPrimary, opacity: eligibilityVerified ? 1 : 0.5 }}>Confirm & Cast Vote</button>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default ReviewVote;
