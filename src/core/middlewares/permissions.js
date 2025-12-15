import { hasPermission, hasAnyPermission, hasAllPermissions } from '../../config/permissions.js';

/**
 * Middleware to check if user has a specific permission
 * @param {string} permission - The permission to check
 */
export const requirePermission = (permission) => {
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check if user is an admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    // Check if user has the required permission
    if (!hasPermission(req.user.adminRole, permission)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        required: permission,
        userRole: req.user.adminRole
      });
    }

    next();
  };
};

/**
 * Middleware to check if user has any of the specified permissions
 * @param {string[]} permissions - Array of permissions to check
 */
export const requireAnyPermission = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    if (!hasAnyPermission(req.user.adminRole, permissions)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        required: `One of: ${permissions.join(', ')}`,
        userRole: req.user.adminRole
      });
    }

    next();
  };
};

/**
 * Middleware to check if user has all of the specified permissions
 * @param {string[]} permissions - Array of permissions to check
 */
export const requireAllPermissions = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    if (!hasAllPermissions(req.user.adminRole, permissions)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        required: `All of: ${permissions.join(', ')}`,
        userRole: req.user.adminRole
      });
    }

    next();
  };
};

/**
 * Middleware to check if user is a specific admin role or higher
 * @param {string} minRole - Minimum required admin role (moderator, admin, or super_admin)
 */
export const requireAdminRole = (minRole) => {
  const roleHierarchy = {
    moderator: 1,
    admin: 2,
    super_admin: 3
  };

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const userRoleLevel = roleHierarchy[req.user.adminRole] || 0;
    const requiredRoleLevel = roleHierarchy[minRole] || 0;

    if (userRoleLevel < requiredRoleLevel) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient admin privileges',
        required: minRole,
        current: req.user.adminRole
      });
    }

    next();
  };
};

/**
 * Middleware to check if user is super admin
 */
export const requireSuperAdmin = () => requireAdminRole('super_admin');

/**
 * Helper to check permission in controller (doesn't halt execution)
 * @param {object} user - User object
 * @param {string} permission - Permission to check
 * @returns {boolean}
 */
export const checkPermission = (user, permission) => {
  if (!user || user.role !== 'admin') {
    return false;
  }
  return hasPermission(user.adminRole, permission);
};
