import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";

function ElectionDetails() {
    const pageStyle = {
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef4ff 100%)",
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

    const statGrid = {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 16,
        margin: "20px 0 24px",
    };

    const stat = {
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 18,
        padding: 18,
    };

    const buttonStyle = {
        display: "inline-block",
        textDecoration: "none",
        background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
        color: "#fff",
        fontWeight: 700,
        borderRadius: 999,
        padding: "12px 20px",
    };

    return (
        <div style={pageStyle}>
            <Navbar />

            <main style={wrap}>
                <div style={card}>
                    <h1 style={{ marginTop: 0, marginBottom: 12, fontSize: 38 }}>Student Council Election 2026</h1>
                    <p style={{ color: "#475569", marginBottom: 18, fontSize: 18 }}>
                        Election details, key dates, and voting participation information.
                    </p>

                    <div style={statGrid}>
                        <div style={stat}>
                            <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Status</div>
                            <div style={{ marginTop: 8, fontWeight: 800, color: "#16a34a" }}>Open</div>
                        </div>
                        <div style={stat}>
                            <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Voters</div>
                            <div style={{ marginTop: 8, fontWeight: 800 }}>2,500</div>
                        </div>
                        <div style={stat}>
                            <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Candidates</div>
                            <div style={{ marginTop: 8, fontWeight: 800 }}>3</div>
                        </div>
                        <div style={stat}>
                            <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Closing</div>
                            <div style={{ marginTop: 8, fontWeight: 800 }}>02 days</div>
                        </div>
                    </div>

                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 18, padding: 20, marginBottom: 24 }}>
                        <h3 style={{ marginTop: 0 }}>Important information</h3>
                        <ul style={{ margin: 0, paddingLeft: 20, color: "#475569", lineHeight: 1.8 }}>
                            <li>Voting is open to all verified voters.</li>
                            <li>Each voter can submit only one valid vote.</li>
                            <li>Results are published after the election closes.</li>
                            <li>All activity is logged for security and audit review.</li>
                        </ul>
                    </div>

                    <Link to="/vote" style={buttonStyle}>Proceed to Vote</Link>
                </div>
            </main>
        </div>
    );
}

export default ElectionDetails;
