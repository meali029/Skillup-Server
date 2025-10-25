import jwt from "jsonwebtoken";
import User from "../../models/User.js";
import { AppError } from "../errors/index.js";
import { asyncHandler } from "../utils/index.js";

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = asyncHandler(async (req, res, next) => {
  // Extract token from cookie or Authorization header
  const token = req.cookies?.token || 
    (req.headers.authorization && req.headers.authorization.split(" ")[1]);
  
  if (!token) {
    throw new AppError("Authentication required. Please log in", 401);
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch user from database
    const user = await User.findById(decoded.id).select("-password");
    
    if (!user) {
      throw new AppError("User no longer exists", 401);
    }

    // Attach user to request object
    req.user = {
      id: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
      isProfileComplete: user.isProfileComplete
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw new AppError("Invalid token. Please log in again", 401);
    }
    if (error.name === 'TokenExpiredError') {
      throw new AppError("Your session has expired. Please log in again", 401);
    }
    throw error;
  }
});

/**
 * Authorization Middleware
 * Restricts access based on user roles
 * @param {...String} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError(
        `Access denied. This action requires ${roles.join(' or ')} role`,
        403
      );
    }

    next();
  };
};

export { authenticate, authorize };
