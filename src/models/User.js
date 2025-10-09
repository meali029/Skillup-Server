import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String }, // hashed (for email/password users)
  googleId: { type: String }, // Google OAuth ID
  avatar: { type: String },
  role: { type: String, enum: ["freelancer", "client", "admin"], default: "freelancer", required: true },
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
  
  // Client specific fields
  companyName: { type: String },
  companySize: { type: String, enum: ["1-10", "11-50", "51-200", "201-500", "500+"] },
  industry: { type: String },
  
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
  next();
});

export default mongoose.models.User || mongoose.model("User", userSchema);
