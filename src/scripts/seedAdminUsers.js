import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import connectDB from '../config/db.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = join(__dirname, '../../.env');
dotenv.config({ path: envPath });

const adminUsers = [
  {
    name: 'Super Admin',
    email: 'superadmin@skillup.com',
    password: 'Admin@123',
    role: 'admin',
    provider: 'local',
    isEmailVerified: true,
    isProfileComplete: true,
    isActive: true,
  },
  {
    name: 'Admin User',
    email: 'admin@skillup.com',
    password: 'Admin@123',
    role: 'admin',
    provider: 'local',
    isEmailVerified: true,
    isProfileComplete: true,
    isActive: true,
  },
  {
    name: 'Moderator',
    email: 'moderator@skillup.com',
    password: 'Moderator@123',
    role: 'admin',
    provider: 'local',
    isEmailVerified: true,
    isProfileComplete: true,
    isActive: true,
  },
];

const seedAdminUsers = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log('Connected to MongoDB');

    // Hash passwords
    for (let user of adminUsers) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(user.password, salt);
    }

    // Check if admin users already exist
    for (let adminData of adminUsers) {
      const existingUser = await User.findOne({ email: adminData.email });
      
      if (existingUser) {
        console.log(`✓ User already exists: ${adminData.email}`);
        
        // Update to admin role if not already
        if (existingUser.role !== 'admin') {
          existingUser.role = 'admin';
          existingUser.isEmailVerified = true;
          existingUser.isProfileComplete = true;
          await existingUser.save();
          console.log(`  → Updated ${adminData.email} to admin role`);
        }
      } else {
        // Create new admin user
        const newUser = await User.create(adminData);
        console.log(`✓ Created admin user: ${adminData.email}`);
      }
    }


    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding admin users:', error);
    process.exit(1);
  }
};

// Run the seed function
seedAdminUsers();
