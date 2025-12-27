import User from '../../models/User.js';
import createAppError from '../../core/errors/AppError.js';
import { processCNICImage, deleteCNICImages } from '../../core/utils/imageProcessor.js';
import CNICTemplateOCR from '../../services/ocr.service.template.js';
import path from 'path';
import { notifyAdmins, notifyUser } from '../notifications/notification.service.js';

/**
 * Submit CNIC for verification (User)
 */
export const submitCNIC = async (userId, files) => {
  if (!files || !files.frontImage || !files.backImage) {
    throw createAppError('Both front and back images of CNIC are required', 400);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw createAppError('User not found', 404);
  }

  // Check if CNIC already verified
  if (user.cnic?.status === 'verified') {
    throw createAppError('CNIC is already verified', 400);
  }

  // Check if CNIC is already submitted and pending/under review
  if (user.cnic?.status === 'pending' || user.cnic?.status === 'under_review') {
    throw createAppError('CNIC submission is already under review', 400);
  }

  // Delete old images if exists
  if (user.cnic?.frontImage || user.cnic?.backImage) {
    const oldFrontPath = user.cnic.frontImage ? path.join(process.cwd(), user.cnic.frontImage) : null;
    const oldBackPath = user.cnic.backImage ? path.join(process.cwd(), user.cnic.backImage) : null;
    deleteCNICImages(oldFrontPath, oldBackPath);
  }

  // Process images
  const frontImagePath = await processCNICImage(files.frontImage[0].path);
  const backImagePath = await processCNICImage(files.backImage[0].path);

  // Convert to relative paths for storage
  const frontImageUrl = frontImagePath.replace(process.cwd(), '').replace(/\\/g, '/');
  const backImageUrl = backImagePath.replace(process.cwd(), '').replace(/\\/g, '/');

  // Template-based OCR extraction (OCR-assisted manual entry)
  // OCR provides suggestions to admin, but never blocks submission
  let ocrData = null;
  
  try {
    const extractedData = await CNICTemplateOCR.extractCNICData(frontImagePath, backImagePath);
    
    if (extractedData && extractedData.success) {
      ocrData = {
        extractedCnicNumber: extractedData.extractedCnicNumber,
        extractedName: extractedData.extractedName,
        extractedFatherName: extractedData.extractedFatherName,
        extractedDateOfBirth: extractedData.extractedDateOfBirth,
        confidence: extractedData.confidence,
        extractionMethod: extractedData.extractionMethod,
        rawText: extractedData.rawText,
        extractedAt: extractedData.extractedAt
      };
      console.log('✅ OCR suggestion available for admin:', {
        cnicNumber: ocrData.extractedCnicNumber,
        confidence: ocrData.confidence.toFixed(1) + '%',
        method: ocrData.extractionMethod
      });
    } else {
      console.log('ℹ️ OCR could not extract CNIC - Admin will enter manually from images');
      // Store attempt info for debugging
      if (extractedData) {
        ocrData = {
          extractedCnicNumber: null,
          confidence: 0,
          extractedAt: new Date(),
          error: extractedData.error || 'No CNIC number detected'
        };
      }
    }
  } catch (error) {
    console.error('OCR processing error (non-blocking):', error.message);
    console.log('✓ Submission successful - Admin will enter details manually');
  }

  // Update user CNIC data
  user.cnic = {
    ...user.cnic,
    frontImage: frontImageUrl,
    backImage: backImageUrl,
    status: 'pending',
    submittedAt: new Date(),
    rejectionReason: undefined,
    ocrData: ocrData || undefined,
  };

  await user.save();

  // Notify admins that a new CNIC was submitted
  try {
    await notifyAdmins({
      type: 'cnic_submitted',
      title: 'New CNIC submitted',
      message: `${user.name} submitted CNIC for verification`,
      link: `/admin/cnic/${user._id}`,
      data: { userId: user._id }
    });
  } catch (err) {
    console.error('[Notification] Failed to notify admins about CNIC submission', err.message);
  }

  return {
    message: 'CNIC submitted successfully and is now pending admin review',
    cnicStatus: user.cnic.status,
    ocrData: ocrData ? {
      extractedCnicNumber: ocrData.extractedCnicNumber,
      extractedName: ocrData.extractedName,
      extractedFatherName: ocrData.extractedFatherName,
      extractedDateOfBirth: ocrData.extractedDateOfBirth,
      confidence: ocrData.confidence
    } : null,
  };
};

/**
 * Get user's CNIC status (User)
 */
export const getMyCNICStatus = async (userId) => {
  const user = await User.findById(userId).select('cnic name email');
  
  if (!user) {
    throw createAppError('User not found', 404);
  }

  return {
    status: user.cnic?.status || 'not_submitted',
    submittedAt: user.cnic?.submittedAt,
    reviewedAt: user.cnic?.reviewedAt,
    rejectionReason: user.cnic?.rejectionReason,
    cnicNumber: user.cnic?.number,
    fullName: user.cnic?.fullName,
    expiryDate: user.cnic?.expiryDate,
  };
};

/**
 * Get all pending CNICs (Admin)
 */
export const getPendingCNICs = async (filters = {}) => {
  const {
    page = 1,
    limit = 20,
    status = 'pending',
    search,
  } = filters;

  const query = {
    'cnic.status': status,
  };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { 'cnic.number': { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(query)
      .select('name email cnic role createdAt')
      .sort({ 'cnic.submittedAt': -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get CNIC details by user ID (Admin)
 */
export const getCNICDetails = async (userId) => {
  const user = await User.findById(userId).select('name email cnic role createdAt');
  
  if (!user) {
    throw createAppError('User not found', 404);
  }

  if (!user.cnic || user.cnic.status === 'not_submitted') {
    throw createAppError('User has not submitted CNIC', 404);
  }

  return user;
};

/**
 * Approve CNIC (Admin)
 */
export const approveCNIC = async (userId, adminId, cnicData) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw createAppError('User not found', 404);
  }

  if (!user.cnic || user.cnic.status === 'not_submitted') {
    throw createAppError('User has not submitted CNIC', 400);
  }

  // Validate CNIC data
  const { number, fullName, dateOfBirth, issueDate, expiryDate } = cnicData;

  // Validate CNIC format: XXXXX-XXXXXXX-X
  const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
  if (!cnicRegex.test(number)) {
    throw createAppError('Invalid CNIC format. Must be XXXXX-XXXXXXX-X', 400);
  }

  // Check for duplicate CNIC
  const existingUser = await User.findOne({
    'cnic.number': number,
    _id: { $ne: userId },
  });
  if (existingUser) {
    throw createAppError('This CNIC number is already registered', 400);
  }

  // Validate age only if the dateOfBirth seems valid and reasonable
  const dob = dateOfBirth ? new Date(dateOfBirth) : null;
  const age = dob ? Math.floor((new Date() - dob) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  // If age is provided and is obviously invalid (negative or >120) reject it
  if (age !== null && (isNaN(age) || age < 0 || age > 120)) {
    throw createAppError('Invalid date of birth provided', 400);
  }

  // Validate CNIC not expired
  const expiry = new Date(expiryDate);
  if (expiry < new Date()) {
    throw createAppError('CNIC has expired', 400);
  }

  // Update user CNIC
  user.cnic.number = number;
  user.cnic.fullName = fullName;
  user.cnic.dateOfBirth = dob;
  user.cnic.issueDate = new Date(issueDate);
  user.cnic.expiryDate = expiry;
  user.cnic.status = 'verified';
  user.cnic.reviewedAt = new Date();
  user.cnic.reviewedBy = adminId;
  user.cnic.rejectionReason = undefined;

  await user.save();

  // Notify the user that their CNIC was approved
  try {
    await notifyUser(user._id, {
      type: 'cnic_approved',
      title: 'CNIC approved',
      message: 'Your CNIC has been approved by admin',
      link: '/profile/cnic',
      data: { userId: user._id }
    });
  } catch (err) {
    console.error('[Notification] Failed to notify user about CNIC approval', err.message);
  }

  return {
    message: 'CNIC verified successfully',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      cnicStatus: user.cnic.status,
    },
  };
};

/**
 * Reject CNIC (Admin)
 */
export const rejectCNIC = async (userId, adminId, reason) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw createAppError('User not found', 404);
  }

  if (!user.cnic || user.cnic.status === 'not_submitted') {
    throw createAppError('User has not submitted CNIC', 400);
  }

  if (!reason || reason.trim().length < 10) {
    throw createAppError('Rejection reason must be at least 10 characters', 400);
  }

  // Delete CNIC images for rejected submissions
  if (user.cnic.frontImage || user.cnic.backImage) {
    const oldFrontPath = user.cnic.frontImage ? path.join(process.cwd(), user.cnic.frontImage) : null;
    const oldBackPath = user.cnic.backImage ? path.join(process.cwd(), user.cnic.backImage) : null;
    deleteCNICImages(oldFrontPath, oldBackPath);
  }

  user.cnic.status = 'rejected';
  user.cnic.rejectionReason = reason;
  user.cnic.reviewedAt = new Date();
  user.cnic.reviewedBy = adminId;
  user.cnic.frontImage = undefined;
  user.cnic.backImage = undefined;

  await user.save();

  // Notify the user about rejection
  try {
    await notifyUser(user._id, {
      type: 'cnic_rejected',
      title: 'CNIC rejected',
      message: `Your CNIC submission was rejected: ${reason}`,
      link: '/profile/cnic',
      data: { userId: user._id }
    });
  } catch (err) {
    console.error('[Notification] Failed to notify user about CNIC rejection', err.message);
  }

  return {
    message: 'CNIC rejected',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      cnicStatus: user.cnic.status,
    },
  };
};

/**
 * Request re-upload (Admin)
 */
export const requestReupload = async (userId, adminId, reason) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw createAppError('User not found', 404);
  }

  if (!user.cnic || user.cnic.status === 'not_submitted') {
    throw createAppError('User has not submitted CNIC', 400);
  }

  if (!reason || reason.trim().length < 10) {
    throw createAppError('Reason must be at least 10 characters', 400);
  }

  // Delete CNIC images for reupload requests
  if (user.cnic.frontImage || user.cnic.backImage) {
    const oldFrontPath = user.cnic.frontImage ? path.join(process.cwd(), user.cnic.frontImage) : null;
    const oldBackPath = user.cnic.backImage ? path.join(process.cwd(), user.cnic.backImage) : null;
    deleteCNICImages(oldFrontPath, oldBackPath);
  }

  user.cnic.status = 'reupload_requested';
  user.cnic.rejectionReason = reason;
  user.cnic.reviewedAt = new Date();
  user.cnic.frontImage = undefined;
  user.cnic.backImage = undefined;
  user.cnic.reviewedBy = adminId;

  await user.save();

  // Notify the user to re-upload CNIC
  try {
    await notifyUser(user._id, {
      type: 'cnic_reupload_requested',
      title: 'CNIC re-upload requested',
      message: `Admin requested re-upload: ${reason}`,
      link: '/profile/cnic',
      data: { userId: user._id }
    });
  } catch (err) {
    console.error('[Notification] Failed to notify user about CNIC reupload request', err.message);
  }

  return {
    message: 'Re-upload requested',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      cnicStatus: user.cnic.status,
    },
  };
};

/**
 * Get CNIC statistics (Admin)
 */
export const getCNICStats = async () => {
  const stats = await User.aggregate([
    {
      $group: {
        _id: '$cnic.status',
        count: { $sum: 1 },
      },
    },
  ]);

  const statsObj = {
    not_submitted: 0,
    pending: 0,
    under_review: 0,
    verified: 0,
    rejected: 0,
    reupload_requested: 0,
  };

  stats.forEach((stat) => {
    if (stat._id) {
      statsObj[stat._id] = stat.count;
    }
  });

  return statsObj;
};
