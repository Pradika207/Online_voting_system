import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";

function Confirmation() {
  const tx = localStorage.getItem("lastTx");

  const pageStyle = {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #ecfdf5 0%, #f8fafc 100%)",
    color: "#0f172a",
  };

  const wrap = {
    maxWidth: 900,
    margin: "0 auto",
    padding: "56px 24px",
    display: "grid",
    placeItems: "center",
  };

  const card = {
    width: "100%",
    maxWidth: 680,
    background: "rgba(255,255,255,0.96)",
    border: "1px solid rgba(148,163,184,0.3)",
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.12)",
    borderRadius: 28,
    padding: 32,
    textAlign: "center",
  };

  const statusDot = {
    width: 72,
    height: 72,
    margin: "0 auto 18px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #dcfce7, #bbf7d0)",
    display: "grid",
    placeItems: "center",
    fontSize: 36,
    color: "#166534",
    boxShadow: "0 12px 24px rgba(34, 197, 94, 0.18)",
  };

  const buttonStyle = {
    display: "inline-block",
    textDecoration: "none",
    background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
    color: "#fff",
    fontWeight: 700,
    borderRadius: 999,
    padding: "12px 20px",
    marginTop: 18,
    boxShadow: "0 12px 20px rgba(37, 99, 235, 0.2)",
  };

  return (
    <div style={pageStyle}>
      <Navbar />

      <main style={wrap}>
        <div style={card}>
          <div style={statusDot}>✓</div>

          <h1 style={{ marginTop: 0, marginBottom: 12, fontSize: 36 }}>Vote recorded</h1>
          <p style={{ color: "#1f2937", fontSize: 18, marginBottom: 18 }}>
            Your vote has been accepted and securely recorded.
          </p>

          {tx ? (
            <p style={{ wordBreak: "break-all", fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>
              Transaction hash: <code style={{ background: "#f1f5f9", padding: "4px 8px", borderRadius: 8 }}>{tx}</code>
            </p>
          ) : (
            <p style={{ color: "#475569" }}>No transaction information available.</p>
          )}

          <div style={{ marginTop: 18 }}>
            <Link to="/dashboard" style={buttonStyle}>Return to dashboard</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Confirmation;
