import jwt from "jsonwebtoken";

export const generateToken = (user) => {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET is not configured. Please set JWT_SECRET environment variable.');
  }
  
  return jwt.sign(
    {
      id: user._id || user.id,
      email: user.email,
      role: user.role,
      adminRole: user.adminRole
    },
    secret,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d"
    }
  );
};

export const verifyToken = (token) => {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET is not configured. Please set JWT_SECRET environment variable.');
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
