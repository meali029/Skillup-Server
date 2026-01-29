import { v2 as cloudinary } from 'cloudinary';

/**
 * Cloudinary Configuration for CNIC Image Storage
 * 
 * SECURITY NOTES:
 * - All uploads use signed URLs
 * - Images are stored in a private folder
 * - No public listing is allowed
 * - URLs should only be accessed via authenticated API endpoints
 */

// Validate required environment variables
const validateCloudinaryConfig = () => {
  const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing Cloudinary environment variables: ${missing.join(', ')}`);
    console.error('CNIC image uploads will fail. Please configure Cloudinary credentials.');
    return false;
  }
  return true;
};

// Configure Cloudinary with environment variables
const configureCloudinary = () => {
  if (!validateCloudinaryConfig()) {
    return false;
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true, // Always use HTTPS
  });

  console.log('✅ Cloudinary configured successfully');
  return true;
};

/**
 * Upload image buffer to Cloudinary
 * @param {Buffer} buffer - Image buffer
 * @param {string} folder - Cloudinary folder path
 * @param {string} publicId - Custom public ID for the image
 * @param {Object} options - Additional upload options
 * @returns {Promise<Object>} Upload result with publicId and secureUrl
 */
export const uploadToCloudinary = async (buffer, folder, publicId, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder,
      public_id: publicId,
      resource_type: 'image',
      type: 'authenticated', // Require signed URLs for access
      access_mode: 'authenticated', // Not publicly accessible
      overwrite: true,
      invalidate: true, // Invalidate CDN cache on overwrite
      transformation: [
        { quality: 'auto:good' }, // Automatic quality optimization
        { fetch_format: 'auto' }, // Automatic format selection
      ],
      ...options,
    };

    // Use upload stream for buffer uploads
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(new Error(`Failed to upload image to Cloudinary: ${error.message}`));
        } else {
          resolve({
            publicId: result.public_id,
            secureUrl: result.secure_url,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
            resourceType: result.resource_type,
          });
        }
      }
    );

    // Write buffer to upload stream
    uploadStream.end(buffer);
  });
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - The public ID of the image to delete
 * @returns {Promise<Object>} Deletion result
 */
export const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return null;

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      type: 'authenticated',
      invalidate: true,
    });
    
    if (result.result === 'ok' || result.result === 'not found') {
      return { success: true, publicId };
    }
    
    console.warn(`Cloudinary deletion warning for ${publicId}:`, result);
    return { success: false, result };
  } catch (error) {
    console.error(`Cloudinary deletion error for ${publicId}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Delete multiple images from Cloudinary
 * @param {string[]} publicIds - Array of public IDs to delete
 * @returns {Promise<Object>} Deletion results
 */
export const deleteMultipleFromCloudinary = async (publicIds) => {
  if (!publicIds || publicIds.length === 0) return { deleted: [], failed: [] };

  const validIds = publicIds.filter(id => id);
  if (validIds.length === 0) return { deleted: [], failed: [] };

  try {
    const result = await cloudinary.api.delete_resources(validIds, {
      resource_type: 'image',
      type: 'authenticated',
      invalidate: true,
    });

    const deleted = Object.keys(result.deleted || {}).filter(
      id => result.deleted[id] === 'deleted' || result.deleted[id] === 'not_found'
    );
    const failed = Object.keys(result.deleted || {}).filter(
      id => result.deleted[id] !== 'deleted' && result.deleted[id] !== 'not_found'
    );

    return { deleted, failed };
  } catch (error) {
    console.error('Cloudinary bulk deletion error:', error);
    return { deleted: [], failed: validIds, error: error.message };
  }
};

/**
 * Generate a signed URL for authenticated access to a private image
 * This should be used when sending image URLs to the frontend
 * @param {string} publicId - The public ID of the image
 * @param {Object} options - URL generation options
 * @returns {string} Signed URL
 */
export const getSignedUrl = (publicId, options = {}) => {
  if (!publicId) return null;

  const defaultOptions = {
    type: 'authenticated',
    sign_url: true,
    secure: true,
    // URL expires in 1 hour (3600 seconds) by default
    expires_at: Math.floor(Date.now() / 1000) + (options.expiresIn || 3600),
  };

  return cloudinary.url(publicId, {
    ...defaultOptions,
    ...options,
  });
};

/**
 * Check if Cloudinary is properly configured
 * @returns {boolean} True if configured, false otherwise
 */
export const isCloudinaryConfigured = () => {
  return validateCloudinaryConfig();
};

// Initialize Cloudinary on module load
const isConfigured = configureCloudinary();

export { cloudinary, isConfigured };
export default cloudinary;
