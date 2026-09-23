import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
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

    useEffect(() => {
        const token = localStorage.getItem("token");
        fetch(`${API_BASE_URL}/api/biometric/status`, { headers: { Authorization: `Bearer ${token}` } })
            .then((response) => response.json())
            .then((data) => setBiometricEnrolled(Boolean(data.enrolled)))
            .catch(() => setMessage("Unable to check biometric verification status."));
        fetch(`${API_BASE_URL}/api/elections/active`, { headers: { Authorization: `Bearer ${token}` } })
            .then((response) => response.json())
            .then((data) => setElection(data.election || null))
            .catch(() => setMessage("There is no active election available."));
    }, []);

    const enrollBiometric = async () => {
        setBiometricBusy(true);
        setMessage("");
        try {
            if (!browserSupportsWebAuthn()) throw new Error("This browser or device does not support biometric verification.");
            const token = localStorage.getItem("token");
            const optionsResponse = await fetch(`${API_BASE_URL}/api/biometric/register/options`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
            const options = await optionsResponse.json();
            if (!optionsResponse.ok) throw new Error(options.message || "Unable to start biometric enrollment.");
            const credential = await startRegistration({ optionsJSON: options });
            const verifyResponse = await fetch(`${API_BASE_URL}/api/biometric/register/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ optionsChallenge: options.challenge, response: credential }),
            });
            const data = await verifyResponse.json();
            if (!verifyResponse.ok) throw new Error(data.message || "Biometric enrollment failed.");
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
            const token = localStorage.getItem("token");
            const optionsResponse = await fetch(`${API_BASE_URL}/api/biometric/authenticate/options`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
            const options = await optionsResponse.json();
            if (!optionsResponse.ok) throw new Error(options.message || "Unable to start biometric verification.");
            const assertion = await startAuthentication({ optionsJSON: options });
            const verifyResponse = await fetch(`${API_BASE_URL}/api/biometric/authenticate/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ optionsChallenge: options.challenge, response: assertion }),
            });
            const data = await verifyResponse.json();
            if (!verifyResponse.ok) throw new Error(data.message || "Biometric verification failed.");
            localStorage.setItem("biometricToken", data.biometricToken);
            await verifyEligibility(data.biometricToken);
        } catch (error) {
            setMessage(error.message || "Biometric verification was cancelled.");
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
            },
            body: JSON.stringify({ electionId: election.id }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Eligibility verification failed.");
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
                        <h3 style={{ marginTop: 0 }}>Voter verification</h3>
                        <ul style={{ lineHeight: 1.8, paddingLeft: 20, color: "#334155" }}>
                            <li>✓ Account verified</li>
                            <li>{biometricEnrolled ? "✓" : "○"} Biometric enrolled</li>
                            <li>{eligibilityVerified ? "✓" : "○"} Eligible for this election</li>
                            <li>{eligibilityVerified ? "✓ Voting status: Not yet voted" : "○ Voting status: Pending verification"}</li>
                        </ul>
                        <p style={{ color: "#475569" }}>Your device will ask for fingerprint, face recognition, or another secure screen-lock verification. The private biometric data never leaves your device.</p>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            {!biometricEnrolled && <button type="button" onClick={enrollBiometric} disabled={biometricBusy} style={buttonSecondary}>{biometricBusy ? "Waiting for device..." : "Enroll biometric"}</button>}
                            {biometricEnrolled && !eligibilityVerified && <button type="button" onClick={verifyBiometric} disabled={biometricBusy || !election} style={buttonPrimary}>{biometricBusy ? "Checking..." : "Verify & Check Eligibility"}</button>}
                        </div>
                        <p style={{ minHeight: 24, color: message.toLowerCase().includes("failed") || message.toLowerCase().includes("unable") || message.toLowerCase().includes("support") ? "#b91c1c" : "#166534", marginBottom: 0 }}>{message}</p>
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
