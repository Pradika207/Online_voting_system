import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5002";
const DEMO_ADMIN = { email: "admin@example.com", password: "AdminPass123" };
const DEMO_VOTER = { email: "voter@example.com", password: "VoterPass123" };

function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const location = useLocation();
    const [message, setMessage] = useState(location.state?.message || "");
    const navigate = useNavigate();

    const loginUser = async (e) => {
        e.preventDefault();

        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem("token", data.token);
            navigate("/dashboard");
        } else {
            setMessage(data.message || "Login failed");
        }
    };

    const fillDemoAccount = (account) => {
        setEmail(account.email);
        setPassword(account.password);
        setMessage(`Demo login loaded for ${account.email}`);
    };

    const pageStyle = {
        minHeight: "100vh",
        background: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)",
        color: "#0f172a",
    };

    const wrap = {
        maxWidth: 1200,
        margin: "0 auto",
        padding: "56px 24px",
        display: "grid",
        placeItems: "center",
    };

    const card = {
        width: "100%",
        maxWidth: 460,
        background: "rgba(255,255,255,0.9)",
        border: "1px solid rgba(148,163,184,0.35)",
        boxShadow: "0 18px 40px rgba(15, 23, 42, 0.12)",
        borderRadius: 28,
        padding: 28,
    };

    const inputStyle = {
        width: "100%",
        boxSizing: "border-box",
        marginBottom: 16,
        padding: "14px 16px",
        borderRadius: 12,
        border: "1px solid #cbd5e1",
        fontSize: 16,
        outline: "none",
    };

    const buttonStyle = {
        width: "100%",
        border: "none",
        background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
        color: "#fff",
        fontWeight: 700,
        borderRadius: 12,
        padding: "14px 18px",
        cursor: "pointer",
        marginTop: 8,
    };

    return (
        <div style={pageStyle}>
            <Navbar />

            <main style={wrap}>
                <div style={card}>
                    <h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 32 }}>Welcome back</h1>
                    <p style={{ color: "#475569", marginBottom: 24 }}>Login to continue to your secure voting dashboard.</p>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                        <button type="button" onClick={() => fillDemoAccount(DEMO_ADMIN)} style={{ flex: 1, border: "1px solid #93c5fd", background: "#dbeafe", color: "#1e3a8a", borderRadius: 10, padding: "10px 12px", fontWeight: 700, cursor: "pointer" }}>
                            Admin Demo
                        </button>
                        <button type="button" onClick={() => fillDemoAccount(DEMO_VOTER)} style={{ flex: 1, border: "1px solid #bbf7d0", background: "#dcfce7", color: "#166534", borderRadius: 10, padding: "10px 12px", fontWeight: 700, cursor: "pointer" }}>
                            Voter Demo
                        </button>
                    </div>

                    <form onSubmit={loginUser}>
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            style={inputStyle}
                        />

                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={inputStyle}
                        />

                        <button type="submit" style={buttonStyle}>Login</button>
                    </form>

                    <p style={{ color: message.toLowerCase().includes("failed") || message.toLowerCase().includes("invalid") ? "#dc2626" : "#16a34a", marginTop: 18, minHeight: 24, marginBottom: 0 }}>
                        {message}
                    </p>
                </div>
            </main>
        </div>
    );
}

export default Login;
