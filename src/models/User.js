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
  
  // Account status
  isActive: { type: Boolean, default: true },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update the updatedAt field before saving
userSchema.pre('save', async function(next) {
  this.updatedAt = new Date();
  
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
    console.log('❌ Profile incomplete: Missing basic info (name/email/role)');
    return false;
  }
  
  if (this.role === 'freelancer') {
    // Freelancer needs: skills (at least 1), hourly rate, and experience
    const hasFreelancerInfo = Boolean(
      this.skills && 
      this.skills.length > 0 && 
      this.hourlyRate && 
      this.hourlyRate > 0 &&
      this.experience
    );
    
    if (!hasFreelancerInfo) {
      console.log('❌ Freelancer profile incomplete:', {
        hasSkills: this.skills && this.skills.length > 0,
        hasHourlyRate: Boolean(this.hourlyRate && this.hourlyRate > 0),
        hasExperience: Boolean(this.experience)
      });
    }
    
    return hasFreelancerInfo;
  } else if (this.role === 'client') {
    // Client needs: company name, company size, and industry
    const hasClientInfo = Boolean(
      this.companyName && 
      this.companySize &&
      this.industry
    );
    
    if (!hasClientInfo) {
      console.log('❌ Client profile incomplete:', {
        hasCompanyName: Boolean(this.companyName),
        hasCompanySize: Boolean(this.companySize),
        hasIndustry: Boolean(this.industry)
      });
    }
    
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
