import { registerLocal, loginLocal } from "./auth.service.js";
import jwt from "jsonwebtoken";

const createToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
};

const cookieOptions = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === "true",
  sameSite: "lax",
  maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
};

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const { user, token } = await registerLocal({ name, email, password });
    
    // Set both cookie (for fallback/server-side) and return token in response
    res.cookie("token", token, cookieOptions)
       .status(201)
       .json({ 
         user: { id: user._id, name: user.name, email: user.email },
         token: token
       });
  } catch (err) {
    res.status(400).json({ error: err.message || "Registration failed" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const { user, token } = await loginLocal({ email, password });
    
    // Set both cookie (for fallback/server-side) and return token in response
    res.cookie("token", token, cookieOptions)
       .json({ 
         user: { id: user._id, name: user.name, email: user.email },
         token: token
       });
  } catch (err) {
    res.status(401).json({ error: err.message || "Login failed" });
  }
};

// Google OAuth callback - called by Passport after successful authentication
export const googleCallback = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=auth_failed`);
    }
    
    const token = createToken(req.user);
    res.cookie("token", token, cookieOptions);
    
    // Redirect to client's Google callback handler with token
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}/auth/google/callback?token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error("googleCallback error:", err);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=server_error`);
  }
};

export const logout = (req, res) => {
  res.clearCookie("token", { httpOnly: true, sameSite: "lax" }).json({ ok: true });
};

export const me = async (req, res) => {
  // authMiddleware should have set req.user
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  res.json({ user });
};
