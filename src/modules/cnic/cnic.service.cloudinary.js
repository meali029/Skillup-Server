import User from '../../models/User.js';
import createAppError from '../../core/errors/AppError.js';
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  deleteMultipleFromCloudinary,
  getSignedUrl,
  isCloudinaryConfigured,
} from '../../config/cloudinary.js';
import cnicOCRService, { CONFIDENCE_THRESHOLD } from '../../services/cnic-ocr.service.js';
import sharp from 'sharp';
import { notifyAdmins, notifyUser } from '../notifications/notification.service.js';

/**
 * CNIC Service with Cloudinary Storage and Production-Grade OCR
 * 
 * STORAGE: Cloudinary (secure, authenticated access only)
 * OCR: Tesseract.js with multi-pass preprocessing
 * 
 * KEY PRINCIPLES:
 * - CNIC does NOT block authentication
 * - OCR is assistive only, not authoritative
 * - Admin makes final verification decision
 * - All images stored securely in Cloudinary
 */

// Rate limiting: Max submissions per user per day
const MAX_SUBMISSIONS_PER_DAY = 3;

/**
 * Process and optimize image buffer before upload
 * @param {Buffer} buffer - Original image buffer
 * @returns {Promise<Buffer>} Optimized image buffer
 */
const processImageBuffer = async (buffer) => {
  try {
    return await sharp(buffer)
      .resize(1600, 1200, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 85,
        progressive: true,
      })
      .toBuffer();
  } catch (error) {
    console.error('Image processing error:', error.message);
    // Return original buffer if processing fails
    return buffer;
  }
};

/**
 * Validate image buffer
 * @param {Buffer} buffer - Image buffer to validate
 * @returns {Promise<Object>} Validation result
 */
const validateImageBuffer = async (buffer) => {
  try {
    const metadata = await sharp(buffer).metadata();
    
    if (!metadata.width || !metadata.height) {
      return { valid: false, error: 'Cannot read image dimensions' };
    }

    if (metadata.width < 200 || metadata.height < 150) {
      return { valid: false, error: 'Image too small. Minimum size is 200x150 pixels.' };
    }

    if (metadata.width > 6000 || metadata.height > 6000) {
      return { valid: false, error: 'Image too large. Maximum size is 6000x6000 pixels.' };
    }

    return { valid: true, metadata };
  } catch (error) {
    return { valid: false, error: `Invalid image format: ${error.message}` };
  }
};

/**
 * Submit CNIC for verification (User)
 * @param {string} userId - User ID
 * @param {Object} files - Uploaded files (frontImage, backImage)
 * @returns {Promise<Object>} Submission result
 */
export const submitCNIC = async (userId, files) => {
  // Validate files
  if (!files || !files.frontImage || !files.backImage) {
    throw createAppError('Both front and back images of CNIC are required', 400);
  }

  if (!files.frontImage[0]?.buffer || !files.backImage[0]?.buffer) {
    throw createAppError('Invalid file upload. Please try again.', 400);
  }

  // Check Cloudinary configuration
  if (!isCloudinaryConfigured()) {
    throw createAppError('Image storage service is not configured. Please contact support.', 500);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw createAppError('User not found', 404);
  }

  // Check if CNIC already verified
  if (user.cnic?.status === 'verified') {
    throw createAppError('CNIC is already verified. Cannot resubmit.', 400);
  }

  // Check if CNIC is already pending
  if (user.cnic?.status === 'pending' || user.cnic?.status === 'under_review') {
    throw createAppError('CNIC submission is already pending review. Please wait for admin decision.', 400);
  }

  // Rate limiting check
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const submissionsToday = user.cnic?.submissionHistory?.filter(
    s => s.submittedAt >= today
  )?.length || 0;

  if (submissionsToday >= MAX_SUBMISSIONS_PER_DAY) {
    throw createAppError(`Maximum ${MAX_SUBMISSIONS_PER_DAY} CNIC submissions per day. Please try tomorrow.`, 429);
  }

  // Get buffers from uploaded files
  const frontBuffer = files.frontImage[0].buffer;
  const backBuffer = files.backImage[0].buffer;

  // Validate images
  const frontValidation = await validateImageBuffer(frontBuffer);
  if (!frontValidation.valid) {
    throw createAppError(`Front image: ${frontValidation.error}`, 400);
  }

  const backValidation = await validateImageBuffer(backBuffer);
  if (!backValidation.valid) {
    throw createAppError(`Back image: ${backValidation.error}`, 400);
  }

  // Process images for optimal storage and OCR
  const processedFront = await processImageBuffer(frontBuffer);
  const processedBack = await processImageBuffer(backBuffer);

  // Delete old Cloudinary images if exists
  const oldPublicIds = [];
  if (user.cnic?.frontImage?.publicId) {
    oldPublicIds.push(user.cnic.frontImage.publicId);
  }
  if (user.cnic?.backImage?.publicId) {
    oldPublicIds.push(user.cnic.backImage.publicId);
  }

  let frontUploadResult = null;
  let backUploadResult = null;

  try {
    // Upload to Cloudinary
    const timestamp = Date.now();
    const cloudinaryFolder = `skillup/cnic/${userId}`;
    // Upload front image
    frontUploadResult = await uploadToCloudinary(
      processedFront,
      cloudinaryFolder,
      `front_${timestamp}`,
      { tags: ['cnic', 'front', userId] }
    );

    // Upload back image
    backUploadResult = await uploadToCloudinary(
      processedBack,
      cloudinaryFolder,
      `back_${timestamp}`,
      { tags: ['cnic', 'back', userId] }
    );
    // Delete old images after successful upload
    if (oldPublicIds.length > 0) {
      await deleteMultipleFromCloudinary(oldPublicIds);
    }

  } catch (uploadError) {
    // Rollback: Delete any uploaded images on failure
    console.error('❌ Cloudinary upload failed:', uploadError.message);

    if (frontUploadResult?.publicId) {
      await deleteFromCloudinary(frontUploadResult.publicId);
    }
    if (backUploadResult?.publicId) {
      await deleteFromCloudinary(backUploadResult.publicId);
    }

    throw createAppError('Failed to upload CNIC images. Please try again.', 500);
  }

  // Update user CNIC data
  const previousStatus = user.cnic?.status;
  
  // OCR will be triggered by admin on-demand, so we store null for now
  let ocrData = null;
  let verificationConfidence = 0;
  let ocrMatchStatus = 'pending_ocr';
  user.cnic = {
    ...user.cnic?.toObject?.() || {},
    frontImage: {
      publicId: frontUploadResult.publicId,
      secureUrl: frontUploadResult.secureUrl,
      width: frontUploadResult.width,
      height: frontUploadResult.height,
    },
    backImage: {
      publicId: backUploadResult.publicId,
      secureUrl: backUploadResult.secureUrl,
      width: backUploadResult.width,
      height: backUploadResult.height,
    },
    status: 'pending',
    submittedAt: new Date(),
    rejectionReason: undefined,
    ocrData: undefined, // OCR will be run by admin
    // Track submission history for rate limiting
    submissionHistory: [
      ...(user.cnic?.submissionHistory || []).slice(-9), // Keep last 10
      {
        submittedAt: new Date(),
        previousStatus,
        ocrConfidence: 0,
        ocrMatchStatus: 'pending_ocr',
      },
    ],
  };

  try {
    await user.save();
  } catch (saveError) {
    // Rollback Cloudinary uploads on DB save failure
    console.error('❌ Database save failed, rolling back Cloudinary uploads...');
    await deleteMultipleFromCloudinary([
      frontUploadResult.publicId,
      backUploadResult.publicId,
    ]);
    throw createAppError('Failed to save CNIC submission. Please try again.', 500);
  }

  // Notify admins
  try {
    await notifyAdmins({
      type: 'cnic_submitted',
      title: 'New CNIC Submission',
      message: `${user.name} submitted CNIC for verification - OCR pending`,
      link: `/admin/cnic/${user._id}`,
      data: {
        userId: user._id,
        userName: user.name,
        ocrConfidence: 0,
        hasOCRData: false,
        ocrPending: true,
      },
    });
  } catch (notifyError) {
    console.error('[Notification] Failed to notify admins:', notifyError.message);
  }

  return {
    message: 'CNIC submitted successfully and is pending admin review. OCR extraction will be performed by admin.',
    cnicStatus: user.cnic.status,
    ocrData: null, // OCR will be run by admin on-demand
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
    // OCR-extracted data (filled when admin runs OCR)
    extractedCnicNumber: user.cnic?.ocrData?.extractedCnicNumber,
    extractedName: user.cnic?.ocrData?.extractedName,
    extractedFatherName: user.cnic?.ocrData?.extractedFatherName,
    extractedDateOfBirth: user.cnic?.ocrData?.extractedDateOfBirth,
    fullName: user.cnic?.fullName, // Admin-approved name
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
      { 'cnic.ocrData.extractedCnicNumber': { $regex: search, $options: 'i' } },
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

  // Add signed URLs for images (1 hour expiry)
  const usersWithSignedUrls = users.map(user => ({
    ...user,
    cnic: {
      ...user.cnic,
      frontImageUrl: user.cnic?.frontImage?.publicId
        ? getSignedUrl(user.cnic.frontImage.publicId, { expiresIn: 3600 })
        : user.cnic?.frontImage, // Fallback for old local paths
      backImageUrl: user.cnic?.backImage?.publicId
        ? getSignedUrl(user.cnic.backImage.publicId, { expiresIn: 3600 })
        : user.cnic?.backImage, // Fallback for old local paths
    },
  }));

  return {
    users: usersWithSignedUrls,
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

  // Generate signed URLs for images
  const cnicData = {
    ...user.cnic.toObject?.() || user.cnic,
    frontImageUrl: user.cnic.frontImage?.publicId
      ? getSignedUrl(user.cnic.frontImage.publicId, { expiresIn: 3600 })
      : user.cnic.frontImage, // Fallback for old local paths
    backImageUrl: user.cnic.backImage?.publicId
      ? getSignedUrl(user.cnic.backImage.publicId, { expiresIn: 3600 })
      : user.cnic.backImage, // Fallback for old local paths
  };

  // Debug log to see what ocrData contains
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    cnic: cnicData,
  };
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

  if (user.cnic.status === 'verified') {
    throw createAppError('CNIC is already verified', 400);
  }

  // Validate CNIC data
  const { number, fullName, dateOfBirth, issueDate, expiryDate } = cnicData;

  // Validate CNIC format: XXXXX-XXXXXXX-X
  const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
  if (!cnicRegex.test(number)) {
    throw createAppError('Invalid CNIC format. Must be XXXXX-XXXXXXX-X', 400);
  }

  // Validate first digit (1-6 for Pakistani provinces)
  const firstDigit = number.charAt(0);
  if (!['1', '2', '3', '4', '5', '6'].includes(firstDigit)) {
    throw createAppError('Invalid CNIC number. First digit must be 1-6.', 400);
  }

  // Check for duplicate CNIC (verified CNICs or OCR extracted)
  const existingUser = await User.findOne({
    $or: [
      { 'cnic.number': number },
      { 'cnic.ocrData.extractedCnicNumber': number }
    ],
    _id: { $ne: userId },
  });
  if (existingUser) {
    throw createAppError('This CNIC number is already registered to another user', 400);
  }

  // Validate date of birth (reasonable age)
  const dob = dateOfBirth ? new Date(dateOfBirth) : null;
  if (dob) {
    const age = Math.floor((new Date() - dob) / (365.25 * 24 * 60 * 60 * 1000));
    if (isNaN(age) || age < 13 || age > 120) {
      throw createAppError('Invalid date of birth provided', 400);
    }
  }

  // Validate CNIC not expired
  const expiry = new Date(expiryDate);
  if (expiry < new Date()) {
    throw createAppError('CNIC has expired. User must provide valid CNIC.', 400);
  }

  // Update user CNIC
  user.cnic.number = number;
  user.cnic.fullName = fullName;
  user.cnic.dateOfBirth = dob;
  user.cnic.issueDate = issueDate ? new Date(issueDate) : undefined;
  user.cnic.expiryDate = expiry;
  user.cnic.status = 'verified';
  user.cnic.reviewedAt = new Date();
  user.cnic.reviewedBy = adminId;
  user.cnic.rejectionReason = undefined;

  await user.save();

  // Notify user
  try {
    await notifyUser(user._id, {
      type: 'cnic_approved',
      title: 'CNIC Verified',
      message: 'Your CNIC has been verified successfully. You now have full access to the platform.',
      link: '/profile/cnic',
      data: { userId: user._id },
    });
  } catch (notifyError) {
    console.error('[Notification] Failed to notify user:', notifyError.message);
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

  // Delete CNIC images from Cloudinary
  const publicIdsToDelete = [];
  if (user.cnic.frontImage?.publicId) {
    publicIdsToDelete.push(user.cnic.frontImage.publicId);
  }
  if (user.cnic.backImage?.publicId) {
    publicIdsToDelete.push(user.cnic.backImage.publicId);
  }

  if (publicIdsToDelete.length > 0) {
    await deleteMultipleFromCloudinary(publicIdsToDelete);
  }

  user.cnic.status = 'rejected';
  user.cnic.rejectionReason = reason.trim();
  user.cnic.reviewedAt = new Date();
  user.cnic.reviewedBy = adminId;
  user.cnic.frontImage = undefined;
  user.cnic.backImage = undefined;
  user.cnic.ocrData = undefined;

  await user.save();

  // Notify user
  try {
    await notifyUser(user._id, {
      type: 'cnic_rejected',
      title: 'CNIC Rejected',
      message: `Your CNIC submission was rejected: ${reason}. You may resubmit with valid documents.`,
      link: '/profile/cnic',
      data: { userId: user._id, reason },
    });
  } catch (notifyError) {
    console.error('[Notification] Failed to notify user:', notifyError.message);
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

  // Delete CNIC images from Cloudinary
  const publicIdsToDelete = [];
  if (user.cnic.frontImage?.publicId) {
    publicIdsToDelete.push(user.cnic.frontImage.publicId);
  }
  if (user.cnic.backImage?.publicId) {
    publicIdsToDelete.push(user.cnic.backImage.publicId);
  }

  if (publicIdsToDelete.length > 0) {
    await deleteMultipleFromCloudinary(publicIdsToDelete);
  }

  user.cnic.status = 'reupload_requested';
  user.cnic.rejectionReason = reason.trim();
  user.cnic.reviewedAt = new Date();
  user.cnic.reviewedBy = adminId;
  user.cnic.frontImage = undefined;
  user.cnic.backImage = undefined;

  await user.save();

  // Notify user
  try {
    await notifyUser(user._id, {
      type: 'cnic_reupload_requested',
      title: 'CNIC Re-upload Required',
      message: `Please re-upload your CNIC: ${reason}`,
      link: '/profile/cnic',
      data: { userId: user._id, reason },
    });
  } catch (notifyError) {
    console.error('[Notification] Failed to notify user:', notifyError.message);
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

  // Calculate additional metrics
  const totalSubmissions = statsObj.pending + statsObj.under_review + statsObj.verified + statsObj.rejected;
  const verificationRate = totalSubmissions > 0 ? ((statsObj.verified / totalSubmissions) * 100).toFixed(1) : 0;

  return {
    ...statsObj,
    totalSubmissions,
    verificationRate: `${verificationRate}%`,
  };
};

/**
 * Run OCR extraction on CNIC images (Admin triggered)
 * @param {string} userId - User ID
 * @param {string} adminId - Admin ID who triggered OCR
 * @returns {Promise<Object>} OCR extraction results
 */
export const runOCRExtraction = async (userId, adminId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw createAppError('User not found', 404);
  }

  if (!user.cnic || !user.cnic.frontImage?.publicId) {
    throw createAppError('No CNIC images found. User needs to submit CNIC first.', 400);
  }

  // Get signed URLs for the images
  const frontSignedUrl = await getSignedUrl(user.cnic.frontImage.publicId);
  const backSignedUrl = await getSignedUrl(user.cnic.backImage.publicId);
  // Run OCR on the front image (contains CNIC number, name, etc.)
  let ocrData = null;
  let verificationConfidence = 0;

  try {
    const extractedData = await cnicOCRService.extractCNICData(frontSignedUrl);
    // Handle both old and new field names from OCR service
    const extractedCnic = extractedData?.extractedCnicNumber || extractedData?.cnic;
    const extractedName = extractedData?.extractedName || extractedData?.name;
    const extractedFatherName = extractedData?.extractedFatherName || extractedData?.fatherName;
    const extractedDOB = extractedData?.extractedDateOfBirth || extractedData?.dateOfBirth;
    const extractedIssueDate = extractedData?.extractedDateOfIssue;
    const extractedExpiryDate = extractedData?.extractedDateOfExpiry;
    const extractedGender = extractedData?.extractedGender;
    const confidence = extractedData?.confidence || 0;
    if (extractedData && extractedCnic) {
      // Use schema-correct field names (extractedCnicNumber, extractedName, etc.)
      ocrData = {
        extractedCnicNumber: extractedCnic,
        extractedName: extractedName || null,
        extractedFatherName: extractedFatherName || null,
        extractedDateOfBirth: extractedDOB || null,
        extractedDateOfIssue: extractedIssueDate || null,
        extractedDateOfExpiry: extractedExpiryDate || null,
        extractedGender: extractedGender || null,
        extractedAt: new Date(),
        confidence: confidence,
        isLowConfidence: confidence < 70,
        extractionMethod: extractedData.extractionMethod || 'easyocr',
        rawText: extractedData.rawText || { front: '', back: '' },
        errors: extractedData.errors || [],
      };
      verificationConfidence = confidence;
    } else {
    }
  } catch (ocrError) {
    console.error('❌ OCR extraction failed:', ocrError.message);
    ocrData = {
      error: ocrError.message,
      extractedAt: new Date(),
      confidence: 0,
    };
  }

  // Update user's CNIC record with OCR data
  user.cnic.ocrData = ocrData;
  
  // Update the latest submission history entry
  if (user.cnic.submissionHistory && user.cnic.submissionHistory.length > 0) {
    const lastIndex = user.cnic.submissionHistory.length - 1;
    user.cnic.submissionHistory[lastIndex].ocrConfidence = verificationConfidence;
    user.cnic.submissionHistory[lastIndex].ocrRunAt = new Date();
    user.cnic.submissionHistory[lastIndex].ocrRunBy = adminId;
  }

  await user.save();
  return {
    message: ocrData?.extractedCnicNumber 
      ? `OCR extraction completed successfully. Confidence: ${verificationConfidence.toFixed(1)}%`
      : 'OCR extraction completed but could not extract CNIC data from image.',
    ocrData,
    verificationConfidence,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  };
};
