import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String }, // hashed (for email/password users) - not required for Google OAuth
  googleId: { type: String }, // Google OAuth ID
  avatar: { type: String },
  role: { type: String, enum: ["freelancer", "client", "admin"] }, // Not required - user selects during profile completion
  provider: { type: String, enum: ["local", "google"], default: "local" },
  
  // Profile information
  bio: { type: String, maxlength: 500 },
  location: { type: String },
  phone: { type: String },
  
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
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
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
  
  if (!hasBasicInfo) return false;
  
  if (this.role === 'freelancer') {
    return this.skills && this.skills.length > 0 && this.hourlyRate && this.experience;
  } else if (this.role === 'client') {
    return this.companyName && this.companySize && this.industry;
  }
  
  return false;
};

export default mongoose.models.User || mongoose.model("User", userSchema);
