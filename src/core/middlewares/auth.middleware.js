import jwt from "jsonwebtoken";
import User from "../../models/User.js";
import { AppError } from "../errors/index.js";
import { asyncHandler } from "../utils/index.js";

const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.token || 
    (req.headers.authorization && req.headers.authorization.split(" ")[1]);
  
  if (!token) {
    throw AppError("Authentication required. Please log in", 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.id).select("-password");
    
    if (!user) {
      throw AppError("User no longer exists", 401);
    }

    // Check if user is banned or suspended
    if (user.isBanned) {
      throw AppError(
        "Your account has been banned. Please contact our help center for assistance.",
        403
      );
    }

    if (!user.isActive) {
      throw AppError(
        "Your account has been suspended. Please contact our help center for assistance.",
        403
      );
    }

    req.user = {
      id: user._id,
      email: user.email,
      role: user.role,
      adminRole: user.adminRole,
      name: user.name,
      isProfileComplete: user.isProfileComplete
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw AppError("Invalid token. Please log in again", 401);
    }
    if (error.name === 'TokenExpiredError') {
      throw AppError("Your session has expired. Please log in again", 401);
    }
    throw error;
  }
});

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw AppError("Authentication required", 401);
    }

    if (!roles.includes(req.user.role)) {
      throw AppError(
        `Access denied. This action requires ${roles.join(' or ')} role`,
        403
      );
    }

    next();
  };
};

// Specific middleware for admin routes - checks both role and adminRole
const authorizeAdmin = (req, res, next) => {
  if (!req.user) {
    throw AppError("Authentication required", 401);
  }

  // Must have role === 'admin' AND have an adminRole set
  if (req.user.role !== 'admin' || !req.user.adminRole) {
    throw AppError(
      "Access denied. Admin access required with valid admin role",
      403
    );
  }

  next();
};

export { authenticate, authorize, authorizeAdmin };
