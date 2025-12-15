import mongoose from 'mongoose';
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

const checkAdminUsers = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log('Connected to MongoDB\n');

    // Find all admin users
    const adminUsers = await User.find({ role: 'admin' })
      .select('name email adminRole')
      .lean();
    
    console.log('📋 All Admin Users in Database:\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    
    adminUsers.forEach((user, index) => {
      console.log(`║ ${index + 1}. ${user.name.padEnd(25)} │`);
      console.log(`║    Email: ${user.email.padEnd(37)} │`);
      console.log(`║    Admin Role: ${(user.adminRole || 'NOT SET').padEnd(32)} │`);
      if (index < adminUsers.length - 1) {
        console.log('╠══════════════════════════════════════════════════════════════╣');
      }
    });
    
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // Check the specific superadmin account
    const superAdmin = await User.findOne({ email: 'superadmin@skillup.com' })
      .select('name email role adminRole');
    
    if (superAdmin) {
      console.log('🔍 Super Admin Account Details:');
      console.log('   Name:', superAdmin.name);
      console.log('   Email:', superAdmin.email);
      console.log('   Role:', superAdmin.role);
      console.log('   Admin Role:', superAdmin.adminRole);
      console.log(superAdmin.adminRole === 'super_admin' ? '   ✅ Correct!' : '   ❌ WRONG - Should be super_admin');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

checkAdminUsers();
