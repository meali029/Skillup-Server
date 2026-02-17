import multer from 'multer';

/**
 * Multer configuration for CNIC image uploads using memory storage
 * 
 * This configuration stores uploaded files in memory as Buffer objects
 * rather than writing to disk. The buffers are then uploaded directly
 * to Cloudinary for secure cloud storage.
 * 
 * BENEFITS:
 * - No temporary files on disk
 * - Faster processing (no disk I/O)
 * - Cleaner rollback on failures
 * - Better for containerized deployments
 * 
 * SECURITY:
 * - File type validation via MIME type
 * - File size limits enforced
 * - Memory limits prevent DoS attacks
 */

// Allowed MIME types for CNIC images
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Maximum memory for uploads (10MB total for both images)
const MAX_MEMORY_SIZE = 10 * 1024 * 1024;

/**
 * File filter for validating uploaded CNIC images
 */
const cnicFileFilter = (req, file, cb) => {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new Error('Invalid file type. Only JPEG, PNG, and WEBP images are allowed.'),
      false
    );
  }

  // Check field name
  if (!['frontImage', 'backImage'].includes(file.fieldname)) {
    return cb(
      new Error('Invalid field name. Use frontImage or backImage.'),
      false
    );
  }

  cb(null, true);
};

/**
 * Memory storage configuration
 * Files are stored as Buffer objects in req.files
 */
const memoryStorage = multer.memoryStorage();

/**
 * Multer instance configured for CNIC uploads with memory storage
 */
export const uploadCNICMemory = multer({
  storage: memoryStorage,
  fileFilter: cnicFileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 2, // Maximum 2 files (front and back)
    fieldSize: MAX_MEMORY_SIZE,
  },
});

/**
 * Middleware for handling CNIC file uploads
 * Expects 'frontImage' and 'backImage' fields
 */
export const handleCNICUpload = uploadCNICMemory.fields([
  { name: 'frontImage', maxCount: 1 },
  { name: 'backImage', maxCount: 1 },
]);

/**
 * Error handler middleware for multer errors
 */
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const errorMessages = {
      LIMIT_FILE_SIZE: 'File size is too large. Maximum size is 5MB per image.',
      LIMIT_FILE_COUNT: 'Too many files. Maximum 2 images allowed (front and back).',
      LIMIT_FIELD_KEY: 'Invalid field name.',
      LIMIT_FIELD_VALUE: 'Field value too large.',
      LIMIT_FIELD_COUNT: 'Too many fields.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected field. Use frontImage and backImage.',
      LIMIT_PART_COUNT: 'Too many parts.',
    };

    return res.status(400).json({
      success: false,
      message: errorMessages[err.code] || `Upload error: ${err.message}`,
      error: err.code,
    });
  }

  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload failed',
    });
  }

  next();
};

// Export constants for use in other modules
export const CNIC_UPLOAD_LIMITS = {
  maxFileSize: MAX_FILE_SIZE,
  maxFiles: 2,
  allowedMimeTypes: ALLOWED_MIME_TYPES,
};
