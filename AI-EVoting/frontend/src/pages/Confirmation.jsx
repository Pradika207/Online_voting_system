import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5002";

function Confirmation() {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const receiptReference = localStorage.getItem("lastReceiptReference");
    if (!receiptReference) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE_URL}/api/receipts/${encodeURIComponent(receiptReference)}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data || data.message) {
          setError(data?.message || "Receipt could not be verified.");
          setReceipt(null);
          return;
        }
        setReceipt(data);
        setError("");
      })
      .catch(() => {
        setError("Receipt verification is temporarily unavailable.");
      })
      .finally(() => setLoading(false));
  }, []);

  const tx = localStorage.getItem("lastTx");
  const receiptReference = localStorage.getItem("lastReceiptReference");
  const electionName = localStorage.getItem("lastVoteElectionName") || "This election";
  const submittedAt = localStorage.getItem("lastVoteSubmittedAt");

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

          <h1 style={{ marginTop: 0, marginBottom: 12, fontSize: 36 }}>Vote Successfully Recorded</h1>
          <p style={{ color: "#1f2937", fontSize: 18, marginBottom: 18 }}>
            Your vote has been accepted and securely recorded.
          </p>

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 18, padding: 20, marginBottom: 20, textAlign: "left" }}>
            <p style={{ margin: "0 0 10px", color: "#475569" }}><strong>Election:</strong> {electionName}</p>
            <p style={{ margin: "0 0 10px", color: "#475569", wordBreak: "break-all" }}><strong>Receipt reference:</strong> {receiptReference || "Retrieving..."}</p>
            <p style={{ margin: "0 0 10px", color: "#475569" }}><strong>Submitted:</strong> {submittedAt ? new Date(submittedAt).toLocaleString() : "Recorded"}</p>
            <p style={{ margin: 0, color: "#065f46", fontWeight: 600 }}>
              This receipt confirms that your vote was recorded successfully. It does not reveal the candidate you selected.
            </p>
          </div>

          {tx ? (
            <p style={{ wordBreak: "break-all", fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>
              Transaction hash: <code style={{ background: "#f1f5f9", padding: "4px 8px", borderRadius: 8 }}>{tx}</code>
            </p>
          ) : null}

          {loading ? (
            <p style={{ color: "#475569" }}>Verifying your receipt...</p>
          ) : error ? (
            <p style={{ color: "#b91c1c" }}>{error}</p>
          ) : receipt ? (
            <p style={{ color: "#065f46", fontWeight: 700 }}>
              Verification status: {receipt.status || "accepted"}
            </p>
          ) : null}

          <div style={{ marginTop: 18 }}>
            <Link to="/dashboard" style={buttonStyle}>Return to dashboard</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Confirmation;
