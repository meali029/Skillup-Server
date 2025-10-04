import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String }, // hashed (for email/password users)
  googleId: { type: String }, // Google OAuth ID
  avatar: { type: String },
  role: { type: String, enum: ["freelancer","client","admin"], default: "freelancer" },
  provider: { type: String, enum: ["local","google"], default: "local" },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.User || mongoose.model("User", userSchema);
