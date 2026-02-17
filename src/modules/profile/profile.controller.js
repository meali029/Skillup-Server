import { 
  getProfile,
  updateProfile,
  updateAvatar,
  addPortfolioItem,
  updatePortfolioItem,
  deletePortfolioItem
} from "./profile.service.js";
import { asyncHandler, successResponse } from "../../core/utils/index.js";
import { AppError, createAppError } from "../../core/errors/index.js";
import { formatUser } from "../shared/dtos/index.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../../config/cloudinary.js";
import sharp from "sharp";
import path from "path";

export const getUserProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  const user = await getProfile(userId);
  
  successResponse(
    res,
    { user: formatUser(user) },
    "Profile retrieved successfully"
  );
});

export const getMyProfile = asyncHandler(async (req, res) => {
  const user = await getProfile(req.user.id);
  
  successResponse(
    res,
    { user: formatUser(user) },
    "Profile retrieved successfully"
  );
});

export const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await updateProfile(req.user.id, req.validatedData);
  
  successResponse(
    res,
    { user: formatUser(user) },
    "Profile updated successfully"
  );
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw AppError("No file uploaded", 400);
  }
  
  try {
    // Get current user to check for existing avatar
    const currentUser = await getProfile(req.user.id);
    
    // Optimize image with Sharp: resize to 400x400, compress, convert to JPEG
    const optimizedBuffer = await sharp(req.file.buffer)
      .resize(400, 400, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 90 })
      .toBuffer();
    
    // Upload to Cloudinary
    const publicId = `user_${req.user.id}_${Date.now()}`;
    const uploadResult = await uploadToCloudinary(
      optimizedBuffer,
      'avatars',
      publicId,
      {
        type: 'upload', // Make avatars public (not authenticated)
        access_mode: 'public',
        transformation: [
          { width: 400, height: 400, crop: 'fill' },
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ]
      }
    );
    
    // Delete old avatar from Cloudinary if it exists and is a Cloudinary URL
    if (currentUser.avatar && currentUser.avatar.includes('cloudinary')) {
      const oldPublicId = currentUser.avatar.split('/').pop().split('.')[0];
      const folderPath = `avatars/${oldPublicId}`;
      await deleteFromCloudinary(folderPath).catch(err => {
        // Silent fail on old avatar deletion
      });
    }
    
    // Update user with new avatar URL
    const user = await updateAvatar(req.user.id, uploadResult.secureUrl);
    
    successResponse(
      res,
      { 
        user: formatUser(user), 
        avatarUrl: uploadResult.secureUrl,
        cloudinaryData: {
          publicId: uploadResult.publicId,
          width: uploadResult.width,
          height: uploadResult.height
        }
      },
      "Avatar uploaded successfully"
    );
  } catch (error) {
    console.error('Avatar upload error:', error);
    throw AppError(`Failed to upload avatar: ${error.message}`, 500);
  }
});

export const uploadPortfolioImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw AppError("No file uploaded", 400);
  }
  
  try {
    // Optimize image using Sharp (resize to max 1200px width, maintain aspect ratio)
    const optimizedBuffer = await sharp(req.file.buffer)
      .resize(1200, null, { 
        withoutEnlargement: true, // Don't enlarge if smaller than 1200px
        fit: 'inside' 
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    // Upload to Cloudinary
    const publicId = `portfolio/${req.user.id}/${Date.now()}`;
    const imageUrl = await uploadToCloudinary(optimizedBuffer, 'portfolio', publicId);

    successResponse(
      res,
      { imageUrl },
      "Portfolio image uploaded successfully"
    );
  } catch (error) {
    console.error('Portfolio image upload error:', error);
    throw AppError("Failed to upload image to Cloudinary", 500);
  }
});

export const addPortfolio = asyncHandler(async (req, res) => {
  const user = await addPortfolioItem(req.user.id, req.validatedData);
  
  successResponse(
    res,
    { user: formatUser(user) },
    "Portfolio item added successfully",
    201
  );
});

export const updatePortfolio = asyncHandler(async (req, res) => {
  const { portfolioId } = req.params;
  
  const user = await updatePortfolioItem(req.user.id, portfolioId, req.validatedData);
  
  successResponse(
    res,
    { user: formatUser(user) },
    "Portfolio item updated successfully"
  );
});

export const deletePortfolio = asyncHandler(async (req, res) => {
  const { portfolioId } = req.params;
  
  const user = await deletePortfolioItem(req.user.id, portfolioId);
  
  successResponse(
    res,
    { user: formatUser(user) },
    "Portfolio item deleted successfully"
  );
});
