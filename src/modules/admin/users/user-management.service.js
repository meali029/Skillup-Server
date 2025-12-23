import User from '../../../models/User.js';
import Job from '../../../models/Job.js';
import Proposal from '../../../models/Proposal.js';
import AppError from '../../../core/errors/AppError.js';
import ExcelJS from 'exceljs';
import { notifyUser } from '../../notifications/notification.service.js';

/**
 * Get all users with advanced filters
 */
export const getAllUsers = async (filters) => {
  const {
    page = 1,
    limit = 10,
    role,
    status,
    isVerified,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    startDate,
    endDate,
  } = filters;

  // Build query
  const query = {};

  // Role filter
  if (role) {
    query.role = role;
  }

  // Status filter
  if (status === 'active') {
    query.isActive = true;
  } else if (status === 'suspended') {
    query.isActive = false;
    query.isBanned = { $ne: true };
  } else if (status === 'banned') {
    query.isBanned = true;
  }

  // Verification filter
  if (isVerified !== undefined) {
    query.isEmailVerified = isVerified === 'true';
  }

  // Search filter (name or email)
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  // Date range filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Pagination
  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  // Execute query
  const [users, total] = await Promise.all([
    User.find(query)
      .select('-password -resetPasswordOTP -resetPasswordOTPExpires')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  return {
    users,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get user by ID with detailed info
 */
export const getUserById = async (userId) => {
  const user = await User.findById(userId)
    .select('-password -resetPasswordOTP -resetPasswordOTPExpires')
    .lean();

  if (!user) {
    throw AppError('User not found', 404);
  }

  // Get additional stats
  if (user.role === 'freelancer') {
    const [proposalsCount, completedJobs] = await Promise.all([
      Proposal.countDocuments({ freelancer: userId }),
      Proposal.countDocuments({ freelancer: userId, status: 'accepted' }),
    ]);

    user.stats = {
      totalProposals: proposalsCount,
      completedJobs,
      successRate: proposalsCount > 0 ? ((completedJobs / proposalsCount) * 100).toFixed(1) : 0,
    };
  } else if (user.role === 'client') {
    const [jobsCount, activeJobs, completedJobs] = await Promise.all([
      Job.countDocuments({ client: userId }),
      Job.countDocuments({ client: userId, status: 'open' }),
      Job.countDocuments({ client: userId, status: 'completed' }),
    ]);

    user.stats = {
      totalJobs: jobsCount,
      activeJobs,
      completedJobs,
    };
  }

  return user;
};

/**
 * Suspend user
 */
export const suspendUser = async (userId, reason, adminId) => {
  const user = await User.findById(userId);

  if (!user) {
    throw AppError('User not found', 404);
  }

  if (user.role === 'admin') {
    throw AppError('Cannot suspend admin users', 403);
  }

  user.isActive = false;
  user.suspensionReason = reason;
  user.suspendedAt = new Date();
  user.suspendedBy = adminId;

  await user.save();

  // Cascade: Close all jobs if user is a client
  if (user.role === 'client') {
    await Job.updateMany(
      { 
        client: userId, 
        status: { $in: ['open', 'draft'] } 
      },
      { 
        $set: { 
          status: 'closed',
          suspendedByAdmin: true,
          suspendedAt: new Date()
        } 
      }
    );
  }

  // Cascade: Close all proposals if user is a freelancer
  if (user.role === 'freelancer') {
    await Proposal.updateMany(
      { 
        freelancerId: userId, 
        status: 'pending' 
      },
      { 
        $set: { 
          status: 'withdrawn',
          suspendedByAdmin: true,
          suspendedAt: new Date()
        } 
      }
    );
  }

  // TODO: Send email notification to user
  // await emailService.sendSuspensionEmail(user.email, reason);

  // Real-time notification
  try {
    await notifyUser(user._id, {
      type: 'account_suspended',
      title: 'Account suspended',
      message: `Your account was suspended by admin: ${reason}`,
      link: '/help',
      data: { reason }
    });
  } catch (err) {
    console.error('[Notification] Failed to notify user about suspension', err.message);
  }

  // Return user without password
  const updatedUser = await User.findById(userId).select('-password');
  return updatedUser;
};

/**
 * Ban user permanently
 */
export const banUser = async (userId, reason, adminId) => {
  const user = await User.findById(userId);

  if (!user) {
    throw AppError('User not found', 404);
  }

  if (user.role === 'admin') {
    throw AppError('Cannot ban admin users', 403);
  }

  user.isActive = false;
  user.isBanned = true;
  user.banReason = reason;
  user.bannedAt = new Date();
  user.bannedBy = adminId;

  await user.save();

  // Cascade: Close all jobs if user is a client
  if (user.role === 'client') {
    await Job.updateMany(
      { 
        client: userId, 
        status: { $in: ['open', 'draft'] } 
      },
      { 
        $set: { 
          status: 'closed',
          suspendedByAdmin: true,
          suspendedAt: new Date()
        } 
      }
    );
  }

  // Cascade: Close all proposals if user is a freelancer
  if (user.role === 'freelancer') {
    await Proposal.updateMany(
      { 
        freelancerId: userId, 
        status: 'pending' 
      },
      { 
        $set: { 
          status: 'withdrawn',
          suspendedByAdmin: true,
          suspendedAt: new Date()
        } 
      }
    );
  }

  // TODO: Send email notification to user
  // await emailService.sendBanEmail(user.email, reason);

  // Real-time notification
  try {
    await notifyUser(user._id, {
      type: 'account_banned',
      title: 'Account banned',
      message: `Your account has been banned: ${reason}`,
      link: '/help',
      data: { reason }
    });
  } catch (err) {
    console.error('[Notification] Failed to notify user about ban', err.message);
  }

  // Return user without password
  const updatedUser = await User.findById(userId).select('-password');
  return updatedUser;
};

/**
 * Activate user
 */
export const activateUser = async (userId, adminId) => {
  const user = await User.findById(userId);

  if (!user) {
    throw AppError('User not found', 404);
  }

  user.isActive = true;
  user.isBanned = false;
  user.suspensionReason = undefined;
  user.banReason = undefined;
  user.suspendedAt = undefined;
  user.bannedAt = undefined;
  user.activatedAt = new Date();
  user.activatedBy = adminId;

  await user.save();

  // Cascade: Reopen jobs that were closed due to suspension/ban if user is a client
  if (user.role === 'client') {
    await Job.updateMany(
      { 
        client: userId, 
        status: 'closed',
        suspendedByAdmin: true 
      },
      { 
        $set: { 
          status: 'open',
          suspendedByAdmin: false
        },
        $unset: { 
          suspendedAt: '' 
        }
      }
    );
  }

  // Cascade: Reactivate proposals that were withdrawn due to suspension/ban if user is a freelancer
  if (user.role === 'freelancer') {
    await Proposal.updateMany(
      { 
        freelancerId: userId, 
        status: 'withdrawn',
        suspendedByAdmin: true 
      },
      { 
        $set: { 
          status: 'pending',
          suspendedByAdmin: false
        },
        $unset: { 
          suspendedAt: '' 
        }
      }
    );
  }

  // TODO: Send email notification to user
  // await emailService.sendActivationEmail(user.email);

  // Real-time notification
  try {
    await notifyUser(user._id, {
      type: 'account_activated',
      title: 'Account activated',
      message: 'Your account has been activated by admin',
      link: '/profile',
      data: {}
    });
  } catch (err) {
    console.error('[Notification] Failed to notify user about activation', err.message);
  }

  // Return user without password
  const updatedUser = await User.findById(userId).select('-password');
  return updatedUser;
};

/**
 * Get user activity
 */
export const getUserActivity = async (userId) => {
  const user = await User.findById(userId).select('name email role').lean();

  if (!user) {
    throw AppError('User not found', 404);
  }

  // Get recent jobs and proposals
  let recentJobs = [];
  let recentProposals = [];

  if (user.role === 'freelancer') {
    recentProposals = await Proposal.find({ freelancer: userId })
      .populate('job', 'title')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
  } else if (user.role === 'client') {
    recentJobs = await Job.find({ client: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
  }

  return {
    user,
    recentJobs,
    recentProposals,
    // TODO: Add login history when implemented
    loginHistory: [],
  };
};

/**
 * Export users to Excel or CSV
 */
export const exportUsers = async (filters, format = 'excel') => {
  // Get all users without pagination
  const query = {};

  if (filters.role) query.role = filters.role;
  if (filters.status === 'active') query.isActive = true;
  if (filters.status === 'suspended') {
    query.isActive = false;
    query.isBanned = { $ne: true };
  }
  if (filters.status === 'banned') query.isBanned = true;
  if (filters.isVerified !== undefined) {
    query.isEmailVerified = filters.isVerified === 'true';
  }
  if (filters.search) {
    query.$or = [
      { name: { $regex: filters.search, $options: 'i' } },
      { email: { $regex: filters.search, $options: 'i' } },
    ];
  }
  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
  }

  const users = await User.find(query)
    .select('name email role isActive isEmailVerified createdAt location phone')
    .lean();

  if (format === 'excel') {
    return await generateExcel(users);
  } else {
    return generateCSV(users);
  }
};

/**
 * Generate Excel file
 */
async function generateExcel(users) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Users');

  // Define columns
  worksheet.columns = [
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Role', key: 'role', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Verified', key: 'verified', width: 12 },
    { header: 'Location', key: 'location', width: 20 },
    { header: 'Phone', key: 'phone', width: 15 },
    { header: 'Joined', key: 'createdAt', width: 20 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF84A98C' },
  };

  // Add data
  users.forEach((user) => {
    worksheet.addRow({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.isBanned ? 'Banned' : user.isActive ? 'Active' : 'Suspended',
      verified: user.isEmailVerified ? 'Yes' : 'No',
      location: user.location || 'N/A',
      phone: user.phone || 'N/A',
      createdAt: new Date(user.createdAt).toLocaleDateString(),
    });
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * Generate CSV file
 */
function generateCSV(users) {
  const headers = ['Name', 'Email', 'Role', 'Status', 'Verified', 'Location', 'Phone', 'Joined'];
  const rows = users.map((user) => [
    user.name,
    user.email,
    user.role,
    user.isBanned ? 'Banned' : user.isActive ? 'Active' : 'Suspended',
    user.isEmailVerified ? 'Yes' : 'No',
    user.location || 'N/A',
    user.phone || 'N/A',
    new Date(user.createdAt).toLocaleDateString(),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');

  return Buffer.from(csv);
}
