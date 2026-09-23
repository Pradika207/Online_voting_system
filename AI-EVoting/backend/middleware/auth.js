const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET || "dev-secret-change-me";
const revokedTokens = new Map();

function revokeToken(token, expiresAt) {
    revokedTokens.set(token, expiresAt || Date.now() + 60 * 60 * 1000);
}

function isRevoked(token) {
    const expiresAt = revokedTokens.get(token);
    if (!expiresAt) return false;
    if (expiresAt <= Date.now()) {
        revokedTokens.delete(token);
        return false;
    }
    return true;
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];

    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Access token required"
        });
    }

    if (isRevoked(token)) {
        return res.status(401).json({ message: "Session has been revoked" });
    }

    jwt.verify(
        token,
        jwtSecret,
        (error, user) => {

            if (error) {
                return res.status(403).json({
                    message: "Invalid or expired token"
                });
            }

            if (!user.jti) {
                return res.status(401).json({ message: "Session is invalid" });
            }

            req.user = user;
            req.accessToken = token;

            next();
        }
    );
}

authenticateToken.revokeToken = revokeToken;

module.exports = authenticateToken;
