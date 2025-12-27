import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

// Use process.cwd() as a stable base directory for test and runtime environments
const __dirname = process.cwd();

/**
 * Process and compress CNIC image
 * @param {string} filePath - Path to the original uploaded image
 * @returns {Promise<string>} - Path to the processed image
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
 * Delete CNIC images
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
