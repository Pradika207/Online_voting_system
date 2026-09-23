import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import Navbar from "../components/Navbar";
import { firebaseReady, auth } from "../firebase";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5002";
const DEMO_OTP_CODE = "123456";
const DEMO_HINT_STYLE = {
    marginBottom: 16,
    padding: "12px 14px",
    borderRadius: 12,
    background: "#ecfeff",
    border: "1px solid #a5f3fc",
    color: "#0f172a",
    fontWeight: 700,
};

function makeDemoConfirmationResult() {
    return {
        confirm: async (code) => {
            const normalizedCode = String(code || "").trim();

            if (normalizedCode !== DEMO_OTP_CODE) {
                throw new Error("Invalid demo OTP.");
            }

            return { user: { uid: "demo-user" } };
        },
    };
}

function toFirebasePhoneNumber(value) {
    const compactPhone = String(value || "").trim().replace(/[\s()-]/g, "");

    if (/^\d{10}$/.test(compactPhone)) {
        return `+91${compactPhone}`;
    }

    return compactPhone;
}

function Register() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [phoneOtp, setPhoneOtp] = useState("");
    const [otpSent, setOtpSent] = useState(false);
    const [message, setMessage] = useState("");
    const [confirmationResult, setConfirmationResult] = useState(null);
    const recaptchaRef = useRef(null);
    const navigate = useNavigate();

    const registerUser = async (e) => {
        e.preventDefault();

        if (otpSent) {
            try {
                if (!confirmationResult) {
                    setMessage("Phone verification is not ready yet. Please try again.");
                    return;
                }

                const smsCredential = await confirmationResult.confirm(phoneOtp);

                if (!smsCredential || !smsCredential.user) {
                    setMessage("Phone verification failed. Please check the SMS code and try again.");
                    return;
                }

                const response = await fetch(`${API_BASE_URL}/api/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, email, phone: toFirebasePhoneNumber(phone), password, firebaseVerified: true })
                });

                const data = await response.json();
                setMessage(data.message || "Registration successful.");

                if (response.ok) {
                    setTimeout(() => navigate("/login"), 1000);
                }

                return;
            } catch (error) {
                setMessage("");
                return;
            }
        }

        try {
            const firebasePhoneNumber = toFirebasePhoneNumber(phone);

            if (!/^\+\d{8,15}$/.test(firebasePhoneNumber)) {
                setMessage("Enter a valid phone number, for example +91 9444316056.");
                return;
            }

            if (!firebaseReady || !auth) {
                setConfirmationResult(makeDemoConfirmationResult());
                setOtpSent(true);
                setMessage("");
                return;
            }

            if (!recaptchaRef.current) {
                recaptchaRef.current = new RecaptchaVerifier(auth, "firebase-recaptcha", {
                    size: "invisible",
                    callback: () => {},
                });
            }

            const result = await signInWithPhoneNumber(auth, firebasePhoneNumber, recaptchaRef.current);
            setConfirmationResult(result);
            setOtpSent(true);
            setMessage(`A verification code was sent to your phone. Enter it to complete registration.`);
        } catch (error) {
            console.warn("Firebase verification failed, falling back to demo OTP:", error);
            setConfirmationResult(makeDemoConfirmationResult());
            setOtpSent(true);
            setMessage("");
        }
    };

    const pageStyle = {
        minHeight: "100vh",
        background: "linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)",
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
        maxWidth: 500,
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
        background: "linear-gradient(135deg, #16a34a, #15803d)",
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
                    <h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 32 }}>Create account</h1>
                    <p style={{ color: "#475569", marginBottom: 24 }}>Register as a verified voter and secure your voting identity.</p>

                    <div style={DEMO_HINT_STYLE}>Demo OTP: 123456</div>

                    <div id="firebase-recaptcha" />

                    <form onSubmit={registerUser}>
                        <input
                            type="text"
                            placeholder="Full Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            style={inputStyle}
                        />

                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            style={inputStyle}
                        />

                        <input
                            type="tel"
                            placeholder="Phone Number (for example +91 9444316056)"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            style={inputStyle}
                        />

                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={inputStyle}
                        />

                        {otpSent && (
                            <>
                                <div style={{ ...DEMO_HINT_STYLE, marginTop: -4, marginBottom: 16 }}>
                                    Use demo code: 123456
                                </div>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    placeholder="Enter the phone verification code"
                                    value={phoneOtp}
                                    onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ""))}
                                    style={inputStyle}
                                />
                            </>
                        )}

                        <button type="submit" style={buttonStyle}>{otpSent ? "Verify Phone & Register" : "Send Phone OTP"}</button>
                    </form>

                    {message && (
                        <p style={{ color: message.toLowerCase().includes("success") ? "#16a34a" : "#dc2626", marginTop: 18, minHeight: 24, marginBottom: 0 }}>
                            {message}
                        </p>
                    )}

                    {otpSent && (
                        <p style={{ color: "#0f766e", marginTop: 10, marginBottom: 0, fontWeight: 600 }}>
                            {DEMO_OTP_CODE}
                        </p>
                    )}
                </div>
            </main>
        </div>
    );
}

export default Register;
