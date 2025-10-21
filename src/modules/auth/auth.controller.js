import { registerLocal, loginLocal, completeProfile as completeProfileService } from "./auth.service.js";
import jwt from "jsonwebtoken";

const createToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );
};

const cookieOptions = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === "true",
  sameSite: "lax",
  maxAge: 1000 * 60 * 60 * 24 * 1 // 1 day
};

export const register = async (req, res) => {
  try {
    // Use validated data from middleware
    const { 
      name, 
      email, 
      password, 
      role
    } = req.validatedData;

    const { user, token } = await registerLocal({ 
      name, 
      email, 
      password, 
      role
    });
    
    // Set both cookie (for fallback/server-side) and return token in response
    res.cookie("token", token, cookieOptions)
       .status(201)
       .json({ 
         user: { 
           id: user._id, 
           name: user.name, 
           email: user.email, 
           role: user.role,
           isProfileComplete: user.isProfileComplete,
           avatar: user.avatar
         },
         token: token
       });
  } catch (err) {
    res.status(400).json({ error: err.message || "Registration failed" });
  }
};

export const login = async (req, res) => {
  try {
    // Use validated data from middleware
    const { email, password } = req.validatedData;
    const { user, token } = await loginLocal({ email, password });
    
    // Set both cookie (for fallback/server-side) and return token in response
    res.cookie("token", token, cookieOptions)
       .json({ 
         user: { 
           id: user._id, 
           name: user.name, 
           email: user.email,
           role: user.role,
           isProfileComplete: user.isProfileComplete,
           avatar: user.avatar
         },
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
      console.error("Google OAuth: No user object received");
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5174'}/login?error=authentication_failed`);
    }
    
    console.log("Google OAuth successful for user:", req.user.email);
    
    const token = createToken(req.user);
    res.cookie("token", token, cookieOptions);
    
    // Check if profile is complete
    const isProfileComplete = req.user.isProfileComplete && req.user.role;
    
    // Redirect to client's Google callback handler with token
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5174';
    
    if (!isProfileComplete) {
      // Profile incomplete - redirect to complete profile page
      res.redirect(`${clientUrl}/auth/google/callback?token=${encodeURIComponent(token)}&profileIncomplete=true`);
    } else {
      // Profile complete - redirect to dashboard
      res.redirect(`${clientUrl}/auth/google/callback?token=${encodeURIComponent(token)}&success=true`);
    }
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5174'}/login?error=server_error`);
  }
};

export const completeProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const profileData = req.body;

    const user = await completeProfileService(userId, profileData);

    // Return user without password
    const userObject = user.toObject();
    delete userObject.password;

    res.json({ user: userObject, message: 'Profile completed successfully' });
  } catch (err) {
    console.error('Profile completion error:', err);
    res.status(400).json({ error: err.message });
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
