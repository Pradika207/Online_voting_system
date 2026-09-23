import React, { useEffect, useState } from "react";
import Navbar from "./components/Navbar";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5002";

function AdminDashboard() {
    const [dashboard, setDashboard] = useState(null);
    const [message, setMessage] = useState("");
    const [blockchainVotes, setBlockchainVotes] = useState([]);
    const [fraudAlerts, setFraudAlerts] = useState([]);
    const [fraudSummary, setFraudSummary] = useState(null);
    const [activityFeed, setActivityFeed] = useState([]);
    const [candidates, setCandidates] = useState([]);
    const [elections, setElections] = useState([]);
    const [voters, setVoters] = useState([]);
    const [voterSearch, setVoterSearch] = useState("");
    const [voterFilter, setVoterFilter] = useState("all");
    const [candidateForm, setCandidateForm] = useState({ name: "", party: "", photoUrl: "", manifesto: "", electionId: "" });
    const [editingCandidateId, setEditingCandidateId] = useState(null);
    const [electionForm, setElectionForm] = useState({ name: "", description: "", startDate: "", endDate: "" });
    const [profile, setProfile] = useState(null);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
    const [formMessage, setFormMessage] = useState("");
    const [activeTab, setActiveTab] = useState("overview");

    useEffect(() => {
        const token = localStorage.getItem("token");

        fetch(`${API_BASE_URL}/api/admin/dashboard`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then((response) => response.json())
            .then((data) => {
                if (data.message) {
                    setMessage(data.message);
                } else {
                    setDashboard(data);
                }
            })
            .catch(() => {
                setMessage("Failed to load dashboard");
            });

        fetch(`${API_BASE_URL}/api/admin/blockchain-votes`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then((r) => r.json())
            .then((b) => {
                if (b && b.votes) setBlockchainVotes(b.votes);
            })
            .catch(() => {});

        fetch(`${API_BASE_URL}/api/admin/profile`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then((r) => r.json())
            .then((data) => setProfile(data.profile || null))
            .catch(() => {});

        fetch(`${API_BASE_URL}/api/admin/fraud-alerts`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then((r) => r.json())
            .then((b) => {
                if (b && b.alerts) setFraudAlerts(b.alerts);
            })
            .catch(() => {});

        fetch(`${API_BASE_URL}/api/admin/fraud-summary`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then((r) => r.json())
            .then((s) => {
                if (s) setFraudSummary(s);
            })
            .catch(() => {});

        fetch(`${API_BASE_URL}/api/admin/activity-feed`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then((r) => r.json())
            .then((a) => {
                if (a && a.activities) setActivityFeed(a.activities);
            })
            .catch(() => {});

        fetch(`${API_BASE_URL}/api/candidates`)
            .then((r) => r.json())
            .then((data) => setCandidates(Array.isArray(data) ? data : []))
            .catch(() => {});

        fetch(`${API_BASE_URL}/api/admin/elections`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then((r) => r.json())
            .then((data) => setElections(data.elections || []))
            .catch(() => {});

        fetch(`${API_BASE_URL}/api/admin/voters`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then((r) => r.json())
            .then((data) => setVoters(data.voters || []))
            .catch(() => {});
    }, []);

    const adminRequest = async (path, options = {}) => {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                ...(options.headers || {}),
            },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Request failed");
        return data;
    };

    const refreshCandidates = async () => {
        const data = await fetch(`${API_BASE_URL}/api/candidates`).then((response) => response.json());
        setCandidates(Array.isArray(data) ? data : []);
    };

    const submitCandidate = async (event) => {
        event.preventDefault();
        try {
            const path = editingCandidateId ? `/api/admin/candidates/${editingCandidateId}` : "/api/admin/candidates";
            const method = editingCandidateId ? "PUT" : "POST";
            await adminRequest(path, { method, body: JSON.stringify(candidateForm) });
            await refreshCandidates();
            setCandidateForm({ name: "", party: "", photoUrl: "", manifesto: "", electionId: "" });
            setEditingCandidateId(null);
            setFormMessage("Candidate saved successfully.");
        } catch (error) {
            setFormMessage(error.message);
        }
    };

    const editCandidate = (candidate) => {
        setEditingCandidateId(candidate.id);
        setCandidateForm({ name: candidate.name || "", party: candidate.party || "", photoUrl: candidate.photo_url || "", manifesto: candidate.manifesto || "", electionId: candidate.election_id || "" });
        setFormMessage("");
    };

    const deleteCandidate = async (candidateId) => {
        if (!window.confirm("Delete this candidate?")) return;
        try {
            await adminRequest(`/api/admin/candidates/${candidateId}`, { method: "DELETE" });
            await refreshCandidates();
            setFormMessage("Candidate deleted successfully.");
        } catch (error) {
            setFormMessage(error.message);
        }
    };

    const submitElection = async (event) => {
        event.preventDefault();
        try {
            await adminRequest("/api/admin/elections", { method: "POST", body: JSON.stringify(electionForm) });
            const data = await adminRequest("/api/admin/elections");
            setElections(data.elections || []);
            setElectionForm({ name: "", description: "", startDate: "", endDate: "" });
            setFormMessage("Election created successfully.");
        } catch (error) {
            setFormMessage(error.message);
        }
    };

    const changeElectionStatus = async (electionId, status) => {
        try {
            await adminRequest(`/api/admin/elections/${electionId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
            const data = await adminRequest("/api/admin/elections");
            setElections(data.elections || []);
        } catch (error) {
            setFormMessage(error.message);
        }
    };

    const loadVoters = async (search = voterSearch, filter = voterFilter) => {
        const params = new URLSearchParams({ search, filter });
        const data = await adminRequest(`/api/admin/voters?${params.toString()}`);
        setVoters(data.voters || []);
    };

    const changePassword = async (event) => {
        event.preventDefault();
        try {
            const data = await adminRequest("/api/admin/change-password", { method: "POST", body: JSON.stringify(passwordForm) });
            setPasswordForm({ currentPassword: "", newPassword: "" });
            setFormMessage(data.message);
        } catch (error) {
            setFormMessage(error.message);
        }
    };

    const pageStyle = {
        minHeight: "100vh",
        background: "linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%)",
        color: "#0f172a",
    };

    const wrap = {
        maxWidth: 1400,
        margin: "0 auto",
        padding: "40px 20px 80px",
    };

    const statGrid = {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 18,
        marginBottom: 28,
    };

    const statCard = {
        background: "rgba(255,255,255,0.95)",
        border: "1px solid rgba(148,163,184,0.25)",
        borderRadius: 22,
        padding: 20,
        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
    };

    const sectionCard = {
        background: "rgba(255,255,255,0.95)",
        border: "1px solid rgba(148,163,184,0.25)",
        borderRadius: 24,
        padding: 24,
        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.07)",
    };

    const tabButton = (tab) => ({
        border: activeTab === tab ? "1px solid #1d4ed8" : "1px solid #dbeafe",
        background: activeTab === tab ? "#dbeafe" : "#fff",
        color: activeTab === tab ? "#1d4ed8" : "#334155",
        borderRadius: 999,
        padding: "10px 16px",
        fontWeight: 700,
        cursor: "pointer",
    });

    const inputStyle = {
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "12px 14px",
        font: "inherit",
        background: "#fff",
    };

    const primaryButton = {
        border: "none",
        background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
        color: "#fff",
        fontWeight: 800,
        borderRadius: 12,
        padding: "12px 18px",
        cursor: "pointer",
    };

    const smallButton = {
        border: "1px solid #bfdbfe",
        background: "#eff6ff",
        color: "#1d4ed8",
        fontWeight: 700,
        borderRadius: 10,
        padding: "8px 12px",
        cursor: "pointer",
    };

    const tableHeader = {
        textAlign: "left",
        padding: "10px 8px",
        borderBottom: "1px solid #cbd5e1",
        color: "#475569",
        fontSize: 13,
    };

    const tableCell = {
        padding: "12px 8px",
        borderBottom: "1px solid #f1f5f9",
    };

    const chartMax = Math.max(...(dashboard?.results || []).map((candidate) => Number(candidate.vote_count || 0)), 1);
    const voteChartData = (dashboard?.results || []).map((candidate) => ({
        ...candidate,
        votes: Number(candidate.vote_count || 0),
        width: `${(Number(candidate.vote_count || 0) / chartMax) * 100}%`,
    }));

    const exportCsv = () => {
        const rows = [
            ["Election Summary", ""],
            ["Total Voters", String(dashboard?.totalVoters || 0)],
            ["Total Votes", String(dashboard?.totalVotes || 0)],
            ["Total Candidates", String(dashboard?.totalCandidates || 0)],
            ["", ""],
            ["Candidate Name", "Party", "Votes"],
            ...(dashboard?.results || []).map((candidate) => [candidate.name, candidate.party, String(candidate.vote_count)])
        ];

        const activityRows = [
            ["", ""],
            ["Recent Activity", ""],
            ["User", "Action", "Email", "Time"],
            ...activityFeed.map((activity) => [activity.user_name || `User #${activity.user_id}`, activity.action, activity.email || "-", new Date(activity.created_at).toISOString()])
        ];

        const fraudRows = [
            ["", ""],
            ["Fraud Alerts", ""],
            ["User", "Prediction", "Login Attempts", "Failed Logins", "IP Changes", "Device Changes", "Session Duration", "Time"],
            ...fraudAlerts.map((alert) => [String(alert.user_id), alert.prediction, String(alert.login_attempts), String(alert.failed_logins), String(alert.ip_changes), String(alert.device_changes), String(alert.session_duration), new Date(alert.created_at).toISOString()])
        ];

        const csv = [...rows, ...activityRows, ...fraudRows]
            .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
            .join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "ai-evoting-admin-report.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    if (message) {
        return (
            <div style={pageStyle}>
                <Navbar />
                <div style={wrap}><h2>{message}</h2></div>
            </div>
        );
    }

    if (!dashboard) {
        return (
            <div style={pageStyle}>
                <Navbar />
                <div style={wrap}><h2>Loading admin portal...</h2></div>
            </div>
        );
    }

    const turnout = dashboard.totalVoters ? ((dashboard.totalVotes / dashboard.totalVoters) * 100).toFixed(1) : "0.0";

    return (
        <div style={pageStyle}>
            <Navbar />

            <main style={wrap}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
                    <div>
                        <p style={{ margin: 0, color: "#2563eb", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Admin portal</p>
                        <h1 style={{ margin: "8px 0 0", fontSize: 42 }}>Election Control Center</h1>
                    </div>

                    <button
                        type="button"
                        onClick={exportCsv}
                        style={{
                            border: "none",
                            background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
                            color: "#fff",
                            fontWeight: 800,
                            borderRadius: 12,
                            padding: "12px 18px",
                            cursor: "pointer",
                            boxShadow: "0 10px 22px rgba(14, 165, 233, 0.28)",
                        }}
                    >
                        Export CSV
                    </button>
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
                    <button type="button" onClick={() => setActiveTab("overview")} style={tabButton("overview")}>Overview</button>
                    <button type="button" onClick={() => setActiveTab("elections")} style={tabButton("elections")}>Elections</button>
                    <button type="button" onClick={() => setActiveTab("candidates")} style={tabButton("candidates")}>Candidates</button>
                    <button type="button" onClick={() => setActiveTab("voters")} style={tabButton("voters")}>Voters</button>
                    <button type="button" onClick={() => setActiveTab("monitoring")} style={tabButton("monitoring")}>Monitoring</button>
                    <button type="button" onClick={() => setActiveTab("audit")} style={tabButton("audit")}>Audit Logs</button>
                    <button type="button" onClick={() => setActiveTab("settings")} style={tabButton("settings")}>Settings</button>
                </div>

                <div style={statGrid}>
                    <div style={statCard}>
                        <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total voters</div>
                        <div style={{ marginTop: 10, fontSize: 32, fontWeight: 800 }}>{dashboard.totalVoters}</div>
                    </div>

                    <div style={statCard}>
                        <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Verified voters</div>
                        <div style={{ marginTop: 10, fontSize: 32, fontWeight: 800 }}>{dashboard.verifiedVoters ?? dashboard.totalVoters}</div>
                    </div>

                    <div style={statCard}>
                        <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Candidates</div>
                        <div style={{ marginTop: 10, fontSize: 32, fontWeight: 800 }}>{dashboard.totalCandidates}</div>
                    </div>

                    <div style={statCard}>
                        <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Votes cast</div>
                        <div style={{ marginTop: 10, fontSize: 32, fontWeight: 800 }}>{dashboard.totalVotes}</div>
                    </div>

                    <div style={statCard}>
                        <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Turnout</div>
                        <div style={{ marginTop: 10, fontSize: 32, fontWeight: 800 }}>{turnout}%</div>
                    </div>

                    <div style={statCard}>
                        <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Election status</div>
                        <div style={{ marginTop: 10, fontSize: 24, fontWeight: 800, color: "#16a34a" }}>Active</div>
                    </div>
                </div>

                {activeTab === "overview" && (
                    <>
                        <div style={sectionCard}>
                            <h2 style={{ marginTop: 0, marginBottom: 20 }}>Candidate vote breakdown</h2>

                            <div style={{ display: "grid", gap: 18 }}>
                                {voteChartData.map((candidate) => (
                                    <div key={candidate.id}>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontWeight: 700 }}>
                                            <span>{candidate.name}</span>
                                            <span>{candidate.votes} votes</span>
                                        </div>
                                        <div style={{ height: 18, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
                                            <div
                                                style={{
                                                    width: candidate.width,
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

                        <div style={sectionCard}>
                            <h2 style={{ marginTop: 0 }}>Recent activity</h2>
                            <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #ddd" }}>User</th>
                                            <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #ddd" }}>Action</th>
                                            <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #ddd" }}>Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activityFeed.slice(0, 6).map((activity) => (
                                            <tr key={activity.id}>
                                                <td style={{ padding: "10px 8px", borderBottom: "1px solid #f0f0f0" }}>{activity.user_name || `User #${activity.user_id}`}</td>
                                                <td style={{ padding: "10px 8px", borderBottom: "1px solid #f0f0f0" }}>{activity.action}</td>
                                                <td style={{ padding: "10px 8px", borderBottom: "1px solid #f0f0f0" }}>{new Date(activity.created_at).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                {activeTab === "elections" && (
                    <div style={sectionCard}>
                        <h2 style={{ marginTop: 0 }}>Election management</h2>
                        <form onSubmit={submitElection} style={{ display: "grid", gap: 12, marginBottom: 28 }}>
                            <input required placeholder="Election name" value={electionForm.name} onChange={(event) => setElectionForm({ ...electionForm, name: event.target.value })} style={inputStyle} />
                            <textarea placeholder="Description" value={electionForm.description} onChange={(event) => setElectionForm({ ...electionForm, description: event.target.value })} style={{ ...inputStyle, minHeight: 80 }} />
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                                <input type="datetime-local" value={electionForm.startDate} onChange={(event) => setElectionForm({ ...electionForm, startDate: event.target.value })} style={inputStyle} />
                                <input type="datetime-local" value={electionForm.endDate} onChange={(event) => setElectionForm({ ...electionForm, endDate: event.target.value })} style={inputStyle} />
                            </div>
                            <button type="submit" style={primaryButton}>Create Election</button>
                        </form>

                        {elections.map((election) => (
                            <div key={election.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", border: "1px solid #e2e8f0", borderRadius: 18, padding: 16, marginBottom: 12, background: "#f8fafc" }}>
                                <div>
                                    <h3 style={{ margin: "0 0 4px" }}>{election.name}</h3>
                                    <p style={{ margin: 0, color: "#475569" }}>{election.description || "No description"}</p>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <strong style={{ color: election.status === "active" ? "#16a34a" : "#475569" }}>{election.status}</strong>
                                    {election.status !== "active" && <button type="button" onClick={() => changeElectionStatus(election.id, "active")} style={smallButton}>Open</button>}
                                    {election.status === "active" && <button type="button" onClick={() => changeElectionStatus(election.id, "completed")} style={smallButton}>Close</button>}
                                </div>
                            </div>
                        ))}

                        {formMessage && <p style={{ color: formMessage.includes("successfully") ? "#15803d" : "#dc2626", fontWeight: 700 }}>{formMessage}</p>}
                    </div>
                )}

                {activeTab === "candidates" && (
                    <div style={sectionCard}>
                        <h2 style={{ marginTop: 0 }}>Candidate management</h2>
                        <form onSubmit={submitCandidate} style={{ display: "grid", gap: 12, marginBottom: 28 }}>
                            <input required placeholder="Candidate name" value={candidateForm.name} onChange={(event) => setCandidateForm({ ...candidateForm, name: event.target.value })} style={inputStyle} />
                            <input placeholder="Party" value={candidateForm.party} onChange={(event) => setCandidateForm({ ...candidateForm, party: event.target.value })} style={inputStyle} />
                            <input placeholder="Photo URL" value={candidateForm.photoUrl} onChange={(event) => setCandidateForm({ ...candidateForm, photoUrl: event.target.value })} style={inputStyle} />
                            <textarea placeholder="Description / manifesto" value={candidateForm.manifesto} onChange={(event) => setCandidateForm({ ...candidateForm, manifesto: event.target.value })} style={{ ...inputStyle, minHeight: 80 }} />
                            <select value={candidateForm.electionId} onChange={(event) => setCandidateForm({ ...candidateForm, electionId: event.target.value })} style={inputStyle}>
                                <option value="">Unassigned election</option>
                                {elections.map((election) => <option key={election.id} value={election.id}>{election.name}</option>)}
                            </select>
                            <button type="submit" style={primaryButton}>{editingCandidateId ? "Save Candidate" : "Add Candidate"}</button>
                        </form>

                        <div style={{ display: "grid", gap: 12 }}>
                            {candidates.map((candidate) => (
                                <div key={candidate.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", border: "1px solid #e2e8f0", borderRadius: 18, padding: 16, background: "#f8fafc" }}>
                                    <div>
                                        <h3 style={{ margin: "0 0 4px" }}>{candidate.name}</h3>
                                        <p style={{ margin: 0, color: "#475569" }}>{candidate.party}</p>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <button type="button" onClick={() => editCandidate(candidate)} style={smallButton}>Edit</button>
                                        <button type="button" onClick={() => deleteCandidate(candidate.id)} style={{ ...smallButton, color: "#b91c1c", borderColor: "#fecaca" }}>Delete</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {formMessage && <p style={{ color: formMessage.includes("successfully") ? "#15803d" : "#dc2626", fontWeight: 700 }}>{formMessage}</p>}
                    </div>
                )}

                {activeTab === "voters" && (
                    <div style={sectionCard}>
                        <h2 style={{ marginTop: 0 }}>Voter management</h2>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                            <input placeholder="Search name or email" value={voterSearch} onChange={(event) => setVoterSearch(event.target.value)} style={{ ...inputStyle, flex: "1 1 240px" }} />
                            <select value={voterFilter} onChange={(event) => { setVoterFilter(event.target.value); loadVoters(voterSearch, event.target.value); }} style={{ ...inputStyle, flex: "0 1 180px" }}>
                                <option value="all">All voters</option>
                                <option value="verified">Verified</option>
                                <option value="pending">Pending</option>
                                <option value="voted">Voted</option>
                                <option value="not_voted">Not voted</option>
                            </select>
                            <button type="button" onClick={() => loadVoters()} style={primaryButton}>Search</button>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                                <thead><tr><th style={tableHeader}>Name</th><th style={tableHeader}>Email</th><th style={tableHeader}>Phone</th><th style={tableHeader}>Verification</th><th style={tableHeader}>Vote status</th></tr></thead>
                                <tbody>
                                    {voters.map((voter) => <tr key={voter.id}>
                                        <td style={tableCell}>{voter.name}</td><td style={tableCell}>{voter.email}</td><td style={tableCell}>{voter.phone || "-"}</td>
                                        <td style={tableCell}><span style={{ color: voter.verified ? "#15803d" : "#b45309", fontWeight: 700 }}>{voter.verified ? "Verified" : "Pending"}</span></td>
                                        <td style={tableCell}>{voter.has_voted ? "Voted" : "Not voted"}</td>
                                    </tr>)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === "monitoring" && (
                    <div style={sectionCard}>
                        <h2 style={{ marginTop: 0 }}>Live voting monitor</h2>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 }}>
                            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18 }}>
                                <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Live votes cast</div>
                                <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800 }}>{dashboard.totalVotes}</div>
                            </div>
                            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18 }}>
                                <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Turnout %</div>
                                <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800 }}>{turnout}%</div>
                            </div>
                            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18 }}>
                                <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Status</div>
                                <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#16a34a" }}>Stable</div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "audit" && (
                    <div style={sectionCard}>
                        <h2 style={{ marginTop: 0 }}>Audit logs</h2>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #ddd" }}>User</th>
                                        <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #ddd" }}>Action</th>
                                        <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #ddd" }}>Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activityFeed.map((activity) => (
                                        <tr key={activity.id}>
                                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #f0f0f0" }}>{activity.user_name || `User #${activity.user_id}`}</td>
                                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #f0f0f0" }}>{activity.action}</td>
                                            <td style={{ padding: "10px 8px", borderBottom: "1px solid #f0f0f0" }}>{new Date(activity.created_at).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === "settings" && (
                    <div style={sectionCard}>
                        <h2 style={{ marginTop: 0 }}>Admin profile and security</h2>
                        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18, marginBottom: 22 }}>
                            <p style={{ margin: "0 0 8px" }}><strong>Name:</strong> {profile?.name || "Admin User"}</p>
                            <p style={{ margin: "0 0 8px" }}><strong>Email:</strong> {profile?.email || "admin@example.com"}</p>
                            <p style={{ margin: 0 }}><strong>Session:</strong> Authenticated admin session</p>
                        </div>
                        <h3>Change password</h3>
                        <form onSubmit={changePassword} style={{ display: "grid", gap: 12, maxWidth: 560 }}>
                            <input required type="password" placeholder="Current password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} style={inputStyle} />
                            <input required minLength={8} type="password" placeholder="New password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} style={inputStyle} />
                            <button type="submit" style={primaryButton}>Update Password</button>
                        </form>
                        {formMessage && <p style={{ color: formMessage.includes("successfully") ? "#15803d" : "#dc2626", fontWeight: 700 }}>{formMessage}</p>}
                    </div>
                )}

                <div style={sectionCard}>
                    <h2 style={{ marginTop: 0 }}>AI security overview</h2>
                    {fraudSummary ? (
                        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontWeight: 700 }}>
                            <span>Normal: {fraudSummary.normal}</span>
                            <span>Suspicious: {fraudSummary.suspicious}</span>
                        </div>
                    ) : (
                        <p style={{ marginBottom: 0, color: "#475569" }}>No recent AI alerts available.</p>
                    )}
                </div>
            </main>
        </div>
    );
}

export default AdminDashboard;
