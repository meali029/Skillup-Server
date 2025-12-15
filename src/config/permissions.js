// Admin Role Permissions Configuration

// Define all available permissions
export const PERMISSIONS = {
  // User Management
  VIEW_USERS: 'view_users',
  MANAGE_USERS: 'manage_users', // Activate, suspend, ban users
  DELETE_USERS: 'delete_users',
  
  // CNIC Verification
  VIEW_CNIC: 'view_cnic',
  VERIFY_CNIC: 'verify_cnic',
  REJECT_CNIC: 'reject_cnic',
  
  // Job Management
  VIEW_JOBS: 'view_jobs',
  MANAGE_JOBS: 'manage_jobs', // Edit, flag jobs
  DELETE_JOBS: 'delete_jobs',
  
  // Proposal Management
  VIEW_PROPOSALS: 'view_proposals',
  MANAGE_PROPOSALS: 'manage_proposals',
  DELETE_PROPOSALS: 'delete_proposals',
  
  // Analytics
  VIEW_ANALYTICS: 'view_analytics',
  VIEW_ADVANCED_ANALYTICS: 'view_advanced_analytics',
  EXPORT_ANALYTICS: 'export_analytics',
  
  // Audit Logs
  VIEW_AUDIT_LOGS: 'view_audit_logs',
  MANAGE_AUDIT_LOGS: 'manage_audit_logs',
  
  // System Settings
  VIEW_SETTINGS: 'view_settings',
  MANAGE_SETTINGS: 'manage_settings',
  
  // Admin Management (Super Admin only)
  VIEW_ADMINS: 'view_admins',
  MANAGE_ADMINS: 'manage_admins',
  DELETE_ADMINS: 'delete_admins',
};

// Role-based permission mapping
export const ROLE_PERMISSIONS = {
  super_admin: [
    // Full access to everything
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.DELETE_USERS,
    PERMISSIONS.VIEW_CNIC,
    PERMISSIONS.VERIFY_CNIC,
    PERMISSIONS.REJECT_CNIC,
    PERMISSIONS.VIEW_JOBS,
    PERMISSIONS.MANAGE_JOBS,
    PERMISSIONS.DELETE_JOBS,
    PERMISSIONS.VIEW_PROPOSALS,
    PERMISSIONS.MANAGE_PROPOSALS,
    PERMISSIONS.DELETE_PROPOSALS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.VIEW_ADVANCED_ANALYTICS,
    PERMISSIONS.EXPORT_ANALYTICS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.MANAGE_AUDIT_LOGS,
    PERMISSIONS.VIEW_SETTINGS,
    PERMISSIONS.MANAGE_SETTINGS,
    PERMISSIONS.VIEW_ADMINS,
    PERMISSIONS.MANAGE_ADMINS,
    PERMISSIONS.DELETE_ADMINS,
  ],
  
  admin: [
    // Can manage users, CNIC, jobs, and view analytics
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_CNIC,
    PERMISSIONS.VERIFY_CNIC,
    PERMISSIONS.REJECT_CNIC,
    PERMISSIONS.VIEW_JOBS,
    PERMISSIONS.MANAGE_JOBS,
    PERMISSIONS.DELETE_JOBS,
    PERMISSIONS.VIEW_PROPOSALS,
    PERMISSIONS.MANAGE_PROPOSALS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.EXPORT_ANALYTICS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.VIEW_SETTINGS,
  ],
  
  moderator: [
    // Can view and moderate content, basic CNIC verification
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.VIEW_CNIC,
    PERMISSIONS.VERIFY_CNIC,
    PERMISSIONS.REJECT_CNIC,
    PERMISSIONS.VIEW_JOBS,
    PERMISSIONS.MANAGE_JOBS, // Can flag inappropriate jobs
    PERMISSIONS.VIEW_PROPOSALS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
  ],
};

// Helper function to check if a role has a specific permission
export const hasPermission = (adminRole, permission) => {
  if (!adminRole || !ROLE_PERMISSIONS[adminRole]) {
    return false;
  }
  return ROLE_PERMISSIONS[adminRole].includes(permission);
};

// Helper function to get all permissions for a role
export const getPermissions = (adminRole) => {
  return ROLE_PERMISSIONS[adminRole] || [];
};

// Middleware helper to check multiple permissions (user needs at least one)
export const hasAnyPermission = (adminRole, permissions) => {
  return permissions.some(permission => hasPermission(adminRole, permission));
};

// Middleware helper to check multiple permissions (user needs all)
export const hasAllPermissions = (adminRole, permissions) => {
  return permissions.every(permission => hasPermission(adminRole, permission));
};
