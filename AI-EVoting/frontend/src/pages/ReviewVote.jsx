import React from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5002";

function ReviewVote() {
    const navigate = useNavigate();
    const candidate = JSON.parse(localStorage.getItem("pendingVote") || "null");

    const confirmVote = async () => {
        if (!candidate) {
            navigate("/vote");
            return;
        }

        const token = localStorage.getItem("token");

        const response = await fetch(`${API_BASE_URL}/api/vote`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ candidateId: candidate.id })
        });

        const data = await response.json();
        localStorage.setItem("lastTx", data.transactionHash || "");

        if (response.ok) {
            localStorage.removeItem("pendingVote");
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

                    <p style={{ color: "#475569", marginBottom: 12 }}><strong>Election:</strong> Student Council Election 2026</p>
                    <p style={{ color: "#475569", marginBottom: 12 }}><strong>Your selected candidate:</strong></p>

                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 20, padding: 24, marginBottom: 24 }}>
                        <h2 style={{ marginTop: 0, marginBottom: 8 }}>{candidate.name}</h2>
                        <p style={{ margin: "0 0 10px", color: "#1d4ed8", fontWeight: 700 }}>{candidate.party}</p>
                        <p style={{ margin: 0, color: "#475569" }}>Please confirm that this is your final vote.</p>
                    </div>

                    <div style={{ marginBottom: 24, color: "#334155", fontWeight: 600 }}>
                        ⚠️ Once submitted, your vote cannot be changed.
                    </div>

                    <div>
                        <Link to="/vote" style={buttonSecondary}>Go Back</Link>
                        <button type="button" onClick={confirmVote} style={buttonPrimary}>Confirm & Cast Vote</button>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default ReviewVote;
