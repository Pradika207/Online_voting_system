import React from "react";
import Navbar from "../components/Navbar";

const results = [
    { name: "Candidate A", party: "Party Alpha", votes: 42 },
    { name: "Candidate B", party: "Party Beta", votes: 31 },
    { name: "Candidate C", party: "Party Gamma", votes: 27 },
];

function Results() {
    const pageStyle = {
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #ecfeff 100%)",
        color: "#0f172a",
    };

    const wrap = {
        maxWidth: 1000,
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

    const maxVotes = Math.max(...results.map((item) => item.votes), 1);

    return (
        <div style={pageStyle}>
            <Navbar />

            <main style={wrap}>
                <div style={card}>
                    <h1 style={{ marginTop: 0, marginBottom: 12, fontSize: 38 }}>Election Results</h1>
                    <p style={{ color: "#475569", marginBottom: 24 }}>Student Council Election 2026</p>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
                        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18 }}>
                            <div style={{ color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 12 }}>Registered</div>
                            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>2,500</div>
                        </div>
                        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18 }}>
                            <div style={{ color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 12 }}>Votes cast</div>
                            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>2,137</div>
                        </div>
                        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18 }}>
                            <div style={{ color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 12 }}>Turnout</div>
                            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>85.48%</div>
                        </div>
                    </div>

                    <div style={{ display: "grid", gap: 18 }}>
                        {results.map((candidate) => (
                            <div key={candidate.name}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontWeight: 700 }}>
                                    <span>{candidate.name}</span>
                                    <span>{candidate.votes}%</span>
                                </div>
                                <div style={{ height: 18, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
                                    <div
                                        style={{
                                            width: `${(candidate.votes / maxVotes) * 100}%`,
                                            height: "100%",
                                            background: "linear-gradient(90deg, #2563eb, #14b8a6)",
                                            borderRadius: 999,
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}

export default Results;
