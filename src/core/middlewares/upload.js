import multer from "multer";
import path from "path";
import fs from "fs";
import { createAppError } from "../errors/index.js";

// Use process.cwd() as base to avoid import.meta usage which can break Jest parsing
// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});

// File filter to accept only images
export const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed"), false);
  }
};

// File filter for CNIC documents (images and PDFs)
export const cnicFileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg", 
    "image/jpg", 
    "image/png", 
    "image/gif", 
    "image/webp",
    "application/pdf"
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG, PNG, GIF, WebP images, and PDF documents are allowed for CNIC verification"), false);
  }
};

// Configure multer for images
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Configure multer for CNIC documents (larger file size allowed)
const uploadCNIC = multer({
  storage: storage,
  fileFilter: cnicFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for CNIC documents
  },
});

// Middleware to handle multer errors
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return next(createAppError("File size too large. Maximum size is 5MB", 400));
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return next(createAppError("Too many files uploaded", 400));
    }
    return next(createAppError(err.message, 400));
  }
  next(err);
};

// Export configured upload middleware
export const uploadSingle = (fieldName) => upload.single(fieldName);
export const uploadMultiple = (fieldName, maxCount) => upload.array(fieldName, maxCount);

// CNIC document upload middleware
export const uploadCNICSingle = (fieldName) => uploadCNIC.single(fieldName);
export const uploadCNICMultiple = (fieldName, maxCount) => uploadCNIC.array(fieldName, maxCount);

export default upload;
