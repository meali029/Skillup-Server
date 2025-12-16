import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Import User model
import User from '../models/User.js';

const updateExistingAdmins = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/skillup';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find all admin users without adminRole
    const adminsWithoutRole = await User.find({
      role: 'admin',
      $or: [
        { adminRole: { $exists: false } },
        { adminRole: null }
      ]
    });

    if (adminsWithoutRole.length === 0) {
      console.log('✅ No admin users found without adminRole field');
      process.exit(0);
    }

    console.log(`\n🔄 Found ${adminsWithoutRole.length} admin user(s) without adminRole field\n`);

    // Update each admin to have super_admin role
    for (const admin of adminsWithoutRole) {
      admin.adminRole = 'super_admin';
      await admin.save();
      
      console.log(`✅ Updated admin: ${admin.email} → adminRole: super_admin`);
    }

    console.log('\n✅ All existing admin users have been updated with adminRole: super_admin');
    console.log('🔐 Please log out and log back in to refresh your permissions\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating admin users:', error);
    process.exit(1);
  }
};

updateExistingAdmins();
