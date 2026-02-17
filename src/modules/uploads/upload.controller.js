import { asyncHandler } from '../../core/utils/index.js';
import { createAppError } from '../../core/errors/index.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../../config/cloudinary.js';
import multer from 'multer';

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'application/x-rar-compressed',
      'text/plain',
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: images, PDFs, documents, and archives.`));
    }
  },
});

/**
 * Upload deliverable file to Cloudinary
 * POST /api/uploads/deliverable
 */
export const uploadDeliverable = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw createAppError('No file uploaded', 400);
  }

  const userId = req.user.id;
  const { contractId, milestoneId } = req.body;

  if (!contractId || !milestoneId) {
    throw createAppError('Contract ID and Milestone ID are required', 400);
  }

  const file = req.file;
  
  // Create unique public ID
  const timestamp = Date.now();
  const publicId = `deliverable_${userId}_${timestamp}`;
  const folder = `skill_up/deliverables/${contractId}/${milestoneId}`;

  // Upload to Cloudinary
  const uploadOptions = {
    resource_type: 'auto', // Auto-detect file type (image, video, raw)
    type: 'upload', // Public access with signed URL
    access_mode: 'public',
  };

  const result = await uploadToCloudinary(
    file.buffer,
    folder,
    publicId,
    uploadOptions
  );

  res.status(200).json({
    success: true,
    data: {
      fileUrl: result.secureUrl,
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      publicId: result.publicId,
      resourceType: result.resourceType,
      format: result.format,
    },
  });
});

/**
 * Upload avatar/profile image to Cloudinary
 * POST /api/uploads/avatar
 */
export const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw createAppError('No file uploaded', 400);
  }

  const userId = req.user.id;
  const file = req.file;

  // Validate image type
  if (!file.mimetype.startsWith('image/')) {
    throw createAppError('Only image files are allowed for avatars', 400);
  }

  const publicId = `avatar_${userId}`;
  const folder = 'skill_up/avatars';

  const uploadOptions = {
    resource_type: 'image',
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto:good' },
      { fetch_format: 'auto' },
    ],
  };

  const result = await uploadToCloudinary(
    file.buffer,
    folder,
    publicId,
    uploadOptions
  );

  res.status(200).json({
    success: true,
    data: {
      avatarUrl: result.secureUrl,
      publicId: result.publicId,
      width: result.width,
      height: result.height,
      format: result.format,
    },
  });
});

/**
 * Delete file from Cloudinary
 * DELETE /api/uploads/:publicId
 */
export const deleteFile = asyncHandler(async (req, res) => {
  const { publicId } = req.params;

  if (!publicId) {
    throw createAppError('Public ID is required', 400);
  }

  // Decode public ID if it's URL encoded
  const decodedPublicId = decodeURIComponent(publicId);

  await deleteFromCloudinary(decodedPublicId);

  res.status(200).json({
    success: true,
    message: 'File deleted successfully',
  });
});

export const uploadMiddleware = upload.single('file');
