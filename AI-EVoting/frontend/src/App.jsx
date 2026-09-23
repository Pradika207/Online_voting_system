import React from "react";
import {
  BrowserRouter,
  Routes,
  Route
} from "react-router-dom";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Voting from "./Voting";
import Confirmation from "./pages/Confirmation";
import ElectionDetails from "./pages/ElectionDetails";
import ReviewVote from "./pages/ReviewVote";
import Results from "./pages/Results";
import AdminDashboard from "./AdminDashboard";

import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

function App() {

  return (
    <BrowserRouter>

      <Routes>

        <Route path="/" element={<Home />} />

        <Route path="/login" element={<Login />} />

        <Route path="/register" element={<Register />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

        <Route path="/vote" element={<ProtectedRoute><Voting /></ProtectedRoute>} />

        <Route path="/review" element={<ProtectedRoute><ReviewVote /></ProtectedRoute>} />

        <Route path="/election" element={<ProtectedRoute><ElectionDetails /></ProtectedRoute>} />

        <Route path="/results" element={<ProtectedRoute><Results /></ProtectedRoute>} />

        <Route path="/confirmation" element={<ProtectedRoute><Confirmation /></ProtectedRoute>} />

        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />

      </Routes>

    </BrowserRouter>
  );
}

export default App;
