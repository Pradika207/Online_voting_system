import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";

function Home() {
    const pageStyle = {
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fbff 0%, #eef4ff 30%, #f8fafc 100%)",
        color: "#0f172a",
    };

    const hero = {
        maxWidth: 1200,
        margin: "0 auto",
        padding: "72px 24px 48px",
        display: "grid",
        gridTemplateColumns: "1.25fr 0.75fr",
        gap: 32,
        alignItems: "center",
    };

    const badge = {
        display: "inline-block",
        background: "rgba(37, 99, 235, 0.1)",
        color: "#1d4ed8",
        fontWeight: 700,
        borderRadius: 999,
        padding: "8px 14px",
        marginBottom: 18,
        letterSpacing: "0.04em",
    };

    const accentGlow = {
        position: "absolute",
        inset: "auto auto 10% -8%",
        width: 220,
        height: 220,
        background: "radial-gradient(circle, rgba(96,165,250,0.34), rgba(96,165,250,0))",
        filter: "blur(8px)",
        pointerEvents: "none",
    };

    const title = {
        fontSize: "clamp(2.5rem, 6vw, 4.2rem)",
        lineHeight: 1.05,
        margin: "0 0 18px",
        fontWeight: 800,
        letterSpacing: "-0.05em",
    };

    const text = {
        fontSize: 18,
        color: "#334155",
        lineHeight: 1.7,
        margin: "0 0 30px",
        maxWidth: 620,
    };

    const actionRow = {
        display: "flex",
        gap: 14,
        flexWrap: "wrap",
        marginBottom: 24,
    };

    const primaryButton = {
        border: "none",
        background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
        color: "#fff",
        fontWeight: 700,
        borderRadius: 999,
        padding: "14px 22px",
        cursor: "pointer",
        textDecoration: "none",
        display: "inline-block",
        boxShadow: "0 12px 24px rgba(37, 99, 235, 0.25)",
    };

    const secondaryButton = {
        border: "1px solid rgba(30, 41, 59, 0.15)",
        background: "rgba(255,255,255,0.8)",
        color: "#0f172a",
        fontWeight: 700,
        borderRadius: 999,
        padding: "14px 22px",
        cursor: "pointer",
        textDecoration: "none",
        display: "inline-block",
    };

    const card = {
        background: "rgba(15, 23, 42, 0.96)",
        border: "1px solid rgba(148,163,184,0.2)",
        boxShadow: "0 28px 60px rgba(15, 23, 42, 0.18)",
        borderRadius: 28,
        padding: 28,
        color: "#e2e8f0",
    };

    const featureGrid = {
        maxWidth: 1200,
        margin: "0 auto 64px",
        padding: "0 24px",
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 20,
    };

    const feature = {
        background: "rgba(255,255,255,0.9)",
        border: "1px solid rgba(148,163,184,0.35)",
        borderRadius: 22,
        padding: 24,
        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
    };

    const trustRow = {
        maxWidth: 1200,
        margin: "0 auto 50px",
        padding: "0 24px",
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 16,
    };

    const miniStat = {
        background: "rgba(255,255,255,0.75)",
        border: "1px solid rgba(148,163,184,0.28)",
        borderRadius: 18,
        padding: "18px 20px",
        textAlign: "center",
        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.04)",
    };

    return (
        <div style={{ ...pageStyle, position: "relative", overflow: "hidden" }}>
            <Navbar />
            <div style={accentGlow} />

            <main>
                <section style={hero}>
                    <div>
                        <div style={badge}>SECURE. SMART. TRANSPARENT.</div>
                        <h1 style={title}>AI-Powered Blockchain E-Voting</h1>
                        <p style={text}>
                            A prototype secure election portal designed for trusted digital voting,
                            anomaly detection, and blockchain-backed vote integrity.
                        </p>

                        <div style={actionRow}>
                            <Link to="/login" style={primaryButton}>Login</Link>
                            <Link to="/register" style={secondaryButton}>Create account</Link>
                        </div>
                    </div>

                    <div style={card}>
                        <h3 style={{ marginTop: 0, marginBottom: 20, fontSize: 24, color: "#f8fafc" }}>Election highlights</h3>
                        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 16 }}>
                            <li style={{ display: "flex", gap: 12, alignItems: "center", color: "#dbeafe" }}>
                                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                                <span>Immutable blockchain vote tracking</span>
                            </li>
                            <li style={{ display: "flex", gap: 12, alignItems: "center", color: "#dbeafe" }}>
                                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#60a5fa", display: "inline-block" }} />
                                <span>AI anomaly detection and alerts</span>
                            </li>
                            <li style={{ display: "flex", gap: 12, alignItems: "center", color: "#dbeafe" }}>
                                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                                <span>Role-based admin and voter access</span>
                            </li>
                            <li style={{ display: "flex", gap: 12, alignItems: "center", color: "#dbeafe" }}>
                                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#a78bfa", display: "inline-block" }} />
                                <span>Audit logs and secure vote flow</span>
                            </li>
                        </ul>
                    </div>
                </section>

                <section style={trustRow}>
                    <div style={miniStat}>
                        <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>Integrity</div>
                        <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#0f172a" }}>100%</div>
                    </div>
                    <div style={miniStat}>
                        <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>Monitoring</div>
                        <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#0f172a" }}>AI</div>
                    </div>
                    <div style={miniStat}>
                        <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>Access</div>
                        <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#0f172a" }}>Role</div>
                    </div>
                    <div style={miniStat}>
                        <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>Audit</div>
                        <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#0f172a" }}>Live</div>
                    </div>
                </section>

                <section style={featureGrid}>
                    <div style={feature}>
                        <h3 style={{ marginTop: 0, color: "#0f172a" }}>Blockchain security</h3>
                        <p style={{ marginBottom: 0, color: "#475569", lineHeight: 1.6 }}>
                            Every vote is recorded as a traceable on-chain transaction to preserve integrity.
                        </p>
                    </div>

                    <div style={feature}>
                        <h3 style={{ marginTop: 0, color: "#0f172a" }}>AI fraud detection</h3>
                        <p style={{ marginBottom: 0, color: "#475569", lineHeight: 1.6 }}>
                            Suspicious activity is monitored to help administrators detect abnormal voting patterns.
                        </p>
                    </div>

                    <div style={feature}>
                        <h3 style={{ marginTop: 0, color: "#0f172a" }}>Live analytics</h3>
                        <p style={{ marginBottom: 0, color: "#475569", lineHeight: 1.6 }}>
                            Admins can view totals, results, alerts, and chain records from a single control panel.
                        </p>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default Home;
