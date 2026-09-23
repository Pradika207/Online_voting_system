import React from "react";
import { Link, useNavigate } from "react-router-dom";

function Navbar() {
  const navigate = useNavigate();

  async function logout() {
    const token = localStorage.getItem("token");
    if (token) {
      await fetch("http://localhost:5002/api/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("biometricToken");
    localStorage.removeItem("votingToken");
    localStorage.removeItem("votingElectionId");
    navigate("/login");
  }

  const token = localStorage.getItem("token");
  let isAdmin = false;

  if (token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      isAdmin = payload.role === "admin";
    } catch (e) {
      // ignore
    }
  }

  const navStyle = {
    background: "linear-gradient(135deg, #0f172a 0%, #111827 100%)",
    borderBottom: "1px solid rgba(148,163,184,0.18)",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  };

  const navInner = {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "18px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  };

  const brand = {
    fontWeight: 800,
    color: "#f8fafc",
    fontSize: 20,
    textDecoration: "none",
    letterSpacing: "0.04em",
  };

  const links = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  };

  const linkStyle = {
    color: "#dbeafe",
    textDecoration: "none",
    fontWeight: 600,
    padding: "8px 12px",
    borderRadius: 999,
    transition: "all 0.2s ease",
  };

  const buttonStyle = {
    border: "none",
    background: "linear-gradient(135deg, #f59e0b, #f97316)",
    color: "#111827",
    fontWeight: 700,
    borderRadius: 999,
    padding: "10px 16px",
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(245, 158, 11, 0.25)",
  };

  return (
    <nav style={navStyle}>
      <div style={navInner}>
        <Link to="/" style={brand}>E-VOTE</Link>

        <div style={links}>
          {token ? (
            <>
              <Link to="/dashboard" style={linkStyle}>Dashboard</Link>
              <Link to="/election" style={linkStyle}>Elections</Link>
              <Link to="/vote" style={linkStyle}>Vote</Link>
              <Link to="/results" style={linkStyle}>Results</Link>
              {isAdmin && <Link to="/admin" style={linkStyle}>Admin</Link>}
              <button onClick={logout} style={buttonStyle}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" style={linkStyle}>Login</Link>
              <Link to="/register" style={linkStyle}>Register</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
