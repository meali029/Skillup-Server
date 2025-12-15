import { getPermissions } from '../../../config/permissions.js';

/**
 * Get current admin user's permissions
 */
export const getMyPermissions = (req, res) => {
  try {
    const { user } = req;

    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const permissions = getPermissions(user.adminRole);

    res.status(200).json({
      success: true,
      data: {
        adminRole: user.adminRole,
        permissions
      }
    });
  } catch (error) {
    console.error('Error getting permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve permissions'
    });
  }
};

/**
 * Get admin user profile with role and permissions
 */
export const getMyAdminProfile = (req, res) => {
  try {
    const { user } = req;

    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const permissions = getPermissions(user.adminRole);

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        adminRole: user.adminRole,
        permissions,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Error getting admin profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve admin profile'
    });
  }
};
