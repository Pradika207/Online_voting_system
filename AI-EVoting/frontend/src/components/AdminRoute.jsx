import React from "react";
import { Navigate } from "react-router-dom";

function AdminRoute({ children }) {

    const token = localStorage.getItem("token");

    if (!token) {
        return <Navigate to="/login" />;
    }

    try {

        const payload = JSON.parse(
            atob(token.split(".")[1])
        );

        if (payload.role !== "admin") {
            return <Navigate to="/dashboard" />;
        }

        return children;

    } catch (error) {

        localStorage.removeItem("token");

        return <Navigate to="/login" />;
    }
}

export default AdminRoute;
