import React, { useEffect, useState } from "react";
import Navbar from "./components/Navbar";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5002";

function Voting() {
    const [candidates, setCandidates] = useState([]);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [message, setMessage] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/candidates`)
            .then((response) => response.json())
            .then((data) => setCandidates(data))
            .catch(() => {
                setMessage("Failed to load candidates");
            });
    }, []);

    const reviewVote = () => {
        if (!selectedCandidate) {
            setMessage("Please select a candidate");
            return;
        }

        const candidate = candidates.find((item) => item.id === selectedCandidate);

        if (!candidate) {
            setMessage("Selected candidate was not found");
            return;
        }

        localStorage.setItem("pendingVote", JSON.stringify(candidate));
        navigate("/review");
    };

    const pageStyle = {
        minHeight: "100vh",
        background: "linear-gradient(135deg, #f8fafc 0%, #ecfeff 100%)",
        color: "#0f172a",
    };

    const wrap = {
        maxWidth: 980,
        margin: "0 auto",
        padding: "48px 24px 80px",
    };

    const card = {
        background: "rgba(255,255,255,0.9)",
        border: "1px solid rgba(148,163,184,0.35)",
        boxShadow: "0 16px 40px rgba(15, 23, 42, 0.12)",
        borderRadius: 28,
        padding: 32,
    };

    const optionCard = {
        display: "flex",
        alignItems: "center",
        padding: "18px 20px",
        border: "1px solid #dbeafe",
        borderRadius: 16,
        background: "#f8fbff",
        marginBottom: 14,
        gap: 14,
    };

    const buttonStyle = {
        background: "linear-gradient(135deg, #f59e0b, #f97316)",
        border: "none",
        color: "#111827",
        fontWeight: 800,
        borderRadius: 999,
        padding: "14px 24px",
        cursor: "pointer",
        marginTop: 16,
    };

    return (
        <div style={pageStyle}>
            <Navbar />

            <main style={wrap}>
                <div style={card}>
                    <h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 38 }}>Electronic Voting System</h1>
                    <h2 style={{ marginTop: 0, marginBottom: 20, color: "#1e293b" }}>Select Your Candidate</h2>

                    <div>
                        {candidates.map((candidate) => (
                            <div key={candidate.id} style={optionCard}>
                                <input
                                    type="radio"
                                    name="candidate"
                                    value={candidate.id}
                                    checked={selectedCandidate === candidate.id}
                                    onChange={() => setSelectedCandidate(candidate.id)}
                                    style={{ width: 18, height: 18 }}
                                />
                                <label style={{ fontSize: 18, fontWeight: 600, cursor: "pointer", flex: 1 }}>
                                    {candidate.name} - {candidate.party}
                                </label>
                            </div>
                        ))}
                    </div>

                    <button onClick={reviewVote} style={buttonStyle}>Review Vote</button>
                    <p style={{ minHeight: 24, color: message.includes("Please") ? "#dc2626" : "#16a34a", marginTop: 16, marginBottom: 0 }}>{message}</p>
                </div>
            </main>
        </div>
    );
}

export default Voting;
