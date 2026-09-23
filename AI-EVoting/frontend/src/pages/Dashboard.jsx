import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";

function Dashboard() {
    const pageStyle = {
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef4ff 100%)",
        color: "#0f172a",
    };

    const wrap = {
        maxWidth: 1200,
        margin: "0 auto",
        padding: "48px 24px 80px",
    };

    const heroCard = {
        background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
        color: "#fff",
        borderRadius: 28,
        padding: 32,
        boxShadow: "0 18px 40px rgba(15, 23, 42, 0.18)",
        marginBottom: 28,
    };

    const buttonStyle = {
        background: "linear-gradient(135deg, #f59e0b, #f97316)",
        border: "none",
        color: "#111827",
        fontWeight: 800,
        borderRadius: 999,
        padding: "14px 22px",
        cursor: "pointer",
        textDecoration: "none",
        display: "inline-block",
        boxShadow: "0 10px 22px rgba(245, 158, 11, 0.25)",
    };

    const secondaryButton = {
        background: "#eff6ff",
        border: "1px solid #bfdbfe",
        color: "#1d4ed8",
        fontWeight: 700,
        borderRadius: 999,
        padding: "12px 18px",
        textDecoration: "none",
        display: "inline-block",
    };

    const grid = {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 20,
    };

    const smallCard = {
        background: "rgba(255,255,255,0.9)",
        border: "1px solid rgba(148,163,184,0.3)",
        borderRadius: 20,
        padding: 24,
        boxShadow: "0 10px 22px rgba(15, 23, 42, 0.06)",
    };

    const statusBanner = {
        background: "rgba(255,255,255,0.8)",
        border: "1px solid rgba(134, 239, 172, 0.5)",
        borderRadius: 18,
        padding: "18px 20px",
        marginBottom: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
    };

    return (
        <div style={pageStyle}>
            <Navbar />

            <main style={wrap}>
                <div style={heroCard}>
                    <p style={{ margin: "0 0 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#bfdbfe" }}>Election Portal</p>
                    <h1 style={{ marginTop: 0, marginBottom: 12, fontSize: 42 }}>Voter Dashboard</h1>
                    <p style={{ margin: 0, color: "#dbeafe", fontSize: 18 }}>
                        Your identity has been verified and your access is protected for the current election cycle.
                    </p>
                </div>

                <div style={statusBanner}>
                    <div>
                        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#15803d", fontWeight: 700 }}>Status</div>
                        <div style={{ color: "#166534", fontWeight: 800, fontSize: 20 }}>Verified voter</div>
                    </div>
                    <div style={{ color: "#166534", fontWeight: 700 }}>Secure session active</div>
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
                    <Link to="/vote" style={buttonStyle}>Cast Your Vote</Link>
                    <Link to="/election" style={secondaryButton}>Election Details</Link>
                    <Link to="/results" style={secondaryButton}>Results</Link>
                </div>

                <div style={grid}>
                    <div style={smallCard}>
                        <h3 style={{ marginTop: 0, color: "#475569" }}>Election Status</h3>
                        <p style={{ marginBottom: 0, color: "#16a34a", fontWeight: 700 }}>Open</p>
                    </div>

                    <div style={smallCard}>
                        <h3 style={{ marginTop: 0, color: "#475569" }}>Your Status</h3>
                        <p style={{ marginBottom: 0, color: "#334155" }}>Not yet voted</p>
                    </div>

                    <div style={smallCard}>
                        <h3 style={{ marginTop: 0, color: "#475569" }}>Security</h3>
                        <p style={{ marginBottom: 0, color: "#334155" }}>Identity verified</p>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default Dashboard;
