import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

// Use process.cwd() as a stable base directory for test and runtime environments
const __dirname = process.cwd();

/**
 * Process and compress CNIC image from file path (legacy - for local storage)
 * @param {string} filePath - Path to the original uploaded image
 * @returns {Promise<string>} - Path to the processed image
 * @deprecated Use processCNICImageBuffer for Cloudinary storage
 */
export const processCNICImage = async (filePath) => {
  try {
    const parsedPath = path.parse(filePath);
    const processedFileName = `${parsedPath.name}-processed${parsedPath.ext}`;
    const processedFilePath = path.join(parsedPath.dir, processedFileName);

    await sharp(filePath)
      .resize(1200, 800, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toFile(processedFilePath);

    // Delete original file
    fs.unlinkSync(filePath);

    return processedFilePath;
  } catch (error) {
    console.error('Error processing CNIC image:', error);
    throw new Error('Failed to process CNIC image');
  }
};

/**
 * Process and compress CNIC image from buffer (for Cloudinary storage)
 * @param {Buffer} buffer - Image buffer
 * @param {Object} options - Processing options
 * @returns {Promise<Buffer>} - Processed image buffer
 */
export const processCNICImageBuffer = async (buffer, options = {}) => {
  const {
    maxWidth = 1600,
    maxHeight = 1200,
    quality = 85,
    format = 'jpeg',
  } = options;

  try {
    return await sharp(buffer)
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality,
        progressive: true,
      })
      .toBuffer();
  } catch (error) {
    console.error('Error processing CNIC image buffer:', error);
    throw new Error('Failed to process CNIC image');
  }
};

/**
 * Validate image buffer
 * @param {Buffer} buffer - Image buffer to validate
 * @returns {Promise<Object>} - Validation result with metadata
 */
export const validateImageBuffer = async (buffer) => {
  try {
    const metadata = await sharp(buffer).metadata();
    
    return {
      valid: true,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: buffer.length,
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid image: ${error.message}`,
    };
  }
};

/**
 * Delete CNIC images from local storage (legacy)
 * @param {string} frontImagePath - Path to front image
 * @param {string} backImagePath - Path to back image
 */
export const deleteCNICImages = (frontImagePath, backImagePath) => {
  try {
    if (frontImagePath && fs.existsSync(frontImagePath)) {
      fs.unlinkSync(frontImagePath);
    }
    if (backImagePath && fs.existsSync(backImagePath)) {
      fs.unlinkSync(backImagePath);
    }
  } catch (error) {
    console.error('Error deleting CNIC images:', error);
  }
};
