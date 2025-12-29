import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { 
    type: String, 
    select: false // Don't return password by default
  }, // hashed (for email/password users) - not required for Google OAuth
  googleId: { type: String }, // Google OAuth ID
  avatar: { type: String },
  role: { type: String, enum: ["freelancer", "client", "admin"] }, // Not required - user selects during profile completion
  adminRole: { 
    type: String, 
    enum: ["super_admin", "admin", "moderator"],
    // Only set if role is "admin"
  },
  provider: { type: String, enum: ["local", "google"], default: "local" },
  
  // Profile information
  bio: { type: String, maxlength: 500 },
  location: { type: String },
  phone: { type: String },
  website: { type: String },
  languages: [{ type: String }],
  availability: { 
    type: String, 
    enum: ["available", "busy", "not-available"],
    default: "available"
  },
  
  // Freelancer specific fields
  skills: [{ type: String }],
  hourlyRate: { type: Number },
  experience: { type: String, enum: ["beginner", "intermediate", "expert"] },
  portfolio: [{ 
    title: String, 
    description: String, 
    url: String, 
    image: String 
  }],
  
  // Freelancer job statistics
  appliedJobsCount: { type: Number, default: 0, min: 0 },
  activeProposalsCount: { type: Number, default: 0, min: 0 },
  completedJobsCount: { type: Number, default: 0, min: 0 },
  totalEarnings: { type: Number, default: 0, min: 0 },
  
  // Client specific fields
  companyName: { type: String },
  companySize: { type: String, enum: ["1-10", "11-50", "51-200", "201-500", "500+"] },
  industry: { type: String },
  
  // Client job statistics
  postedJobsCount: { type: Number, default: 0, min: 0 },
  activeJobsCount: { type: Number, default: 0, min: 0 },
  totalSpent: { type: Number, default: 0, min: 0 },
  
  // Profile completion and verification
  isProfileComplete: { type: Boolean, default: false },
  isEmailVerified: { type: Boolean, default: false },
  
  // CNIC Verification fields
  cnic: {
    number: { type: String }, // Format: XXXXX-XXXXXXX-X
    fullName: { type: String },
    dateOfBirth: { type: Date },
    issueDate: { type: Date },
    expiryDate: { type: Date },
    frontImage: { type: String }, // URL to front image
    backImage: { type: String }, // URL to back image
    status: {
      type: String,
      enum: ['not_submitted', 'pending', 'under_review', 'verified', 'rejected', 'reupload_requested'],
      default: 'not_submitted'
    },
    rejectionReason: { type: String },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // OCR extracted data
    ocrData: {
      extractedCnicNumber: { type: String },
      extractedName: { type: String },
      extractedFatherName: { type: String },
      extractedDateOfBirth: { type: Date },
      confidence: { type: Number, min: 0, max: 100 },
      rawText: {
        front: { type: String },
        back: { type: String }
      },
      extractedAt: { type: Date }
    }
  },
  
  // Account status
  isActive: { type: Boolean, default: true },
  
  // Admin actions - suspension and ban
  isBanned: { type: Boolean, default: false },
  suspensionReason: { type: String },
  banReason: { type: String },
  suspendedAt: { type: Date },
  bannedAt: { type: Date },
  suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  activatedAt: { type: Date },
  activatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Password reset OTP fields
  resetPasswordOTP: { type: String, select: false },
  resetPasswordOTPExpires: { type: Date, select: false },
  // Flag indicating the OTP was verified (allows reset without re-supplying OTP)
  resetPasswordOTPVerified: { type: Boolean, default: false, select: false },
  
  // Wallet reference
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for efficient querying
userSchema.index({ email: 1 }, { unique: true }); // Email unique index
userSchema.index({ 'cnic.number': 1 }, { sparse: true }); // CNIC number index (sparse for users without CNIC)
userSchema.index({ 'cnic.status': 1 }); // CNIC status index for admin filtering
userSchema.index({ role: 1, isActive: 1 }); // Role and active status
userSchema.index({ createdAt: -1 }); // Recent users

// Virtual field for CNIC verification status (for easier access)
userSchema.virtual('cnicVerificationStatus').get(function() {
  return this.cnic?.status || 'not_submitted';
});

// Virtual field for CNIC verified date
userSchema.virtual('cnicVerifiedAt').get(function() {
  return this.cnic?.reviewedAt;
});

// Virtual field for CNIC rejection reason
userSchema.virtual('cnicRejectionReason').get(function() {
  return this.cnic?.rejectionReason;
});

// Virtual field for CNIC submitted date
userSchema.virtual('cnicSubmittedAt').get(function() {
  return this.cnic?.submittedAt;
});

// Ensure virtuals are included in JSON and toObject
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

// Update the updatedAt field before saving
userSchema.pre('save', async function(next) {
  this.updatedAt = new Date();
  
  // Validate: If role is 'admin', adminRole must be set
  if (this.role === 'admin' && !this.adminRole) {
    const error = new Error('Admin users must have an adminRole (super_admin, admin, or moderator)');
    return next(error);
  }
  
  // Validate: If role is not 'admin', adminRole should not be set
  if (this.role !== 'admin' && this.adminRole) {
    this.adminRole = undefined; // Clear adminRole for non-admin users
  }
  
  // Hash password if it's modified or new
  if (this.isModified('password') && this.password) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      return next(error);
    }
  }
  
  // Auto-calculate isProfileComplete if not explicitly set to false
  if (this.isModified('role') || this.isModified('skills') || this.isModified('hourlyRate') || 
      this.isModified('experience') || this.isModified('companyName') || this.isModified('companySize') || 
      this.isModified('industry')) {
    // Only auto-calculate if we have the checkProfileComplete method
    if (typeof this.checkProfileComplete === 'function') {
      // Ensure the result is a boolean
      this.isProfileComplete = Boolean(this.checkProfileComplete());
    }
  }
  
  next();
});

// Method to check if profile is complete
userSchema.methods.checkProfileComplete = function() {
  const hasBasicInfo = this.name && this.email && this.role;
  
  if (!hasBasicInfo) {
    return false;
  }
  
  if (this.role === 'freelancer') {
    const hasFreelancerInfo = Boolean(
      this.skills && 
      this.skills.length > 0 && 
      this.hourlyRate && 
      this.hourlyRate > 0 &&
      this.experience
    );
    return hasFreelancerInfo;
  } else if (this.role === 'client') {
    const hasClientInfo = Boolean(
      this.companyName && 
      this.companySize &&
      this.industry
    );   
    return hasClientInfo;
  }
  
  return false;
};

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Method to generate auth token (convenience method)
userSchema.methods.generateAuthToken = function() {
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { 
      id: this._id, 
      email: this.email, 
      role: this.role 
    },
    (() => {
      if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET environment variable is not set');
      }
      return process.env.JWT_SECRET;
    })(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  return token;
};

export default mongoose.models.User || mongoose.model("User", userSchema);
