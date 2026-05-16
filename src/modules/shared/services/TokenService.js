import jwt from "jsonwebtoken";

export const generateToken = (user, options = {}) => {
  const secret = process.env.JWT_SECRET;
  
  if (!secret || secret === 'null' || secret === 'undefined' || secret.length < 32) {
    throw new Error('JWT_SECRET is not properly configured. Please set a valid JWT_SECRET environment variable (minimum 32 characters).');
  }
  
  const payload = {
    id: user._id || user.id,
    email: user.email,
    role: user.role,
    adminRole: user.adminRole
  };

  if (options.sessionId) {
    payload.sid = options.sessionId;
  }

  return jwt.sign(
    payload,
    secret,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d"
    }
  );
};

export const verifyToken = (token) => {
  const secret = process.env.JWT_SECRET;
  
  if (!secret || secret === 'null' || secret === 'undefined' || secret.length < 32) {
    throw new Error('JWT_SECRET is not properly configured. Please set a valid JWT_SECRET environment variable (minimum 32 characters).');
  }
  
  return jwt.verify(token, secret);
};

export const getCookieOptions = () => {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7
  };
};
