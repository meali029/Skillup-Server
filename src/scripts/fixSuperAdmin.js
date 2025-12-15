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

const fixSuperAdmin = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log('Connected to MongoDB');

    // Find the super admin user by email
    const superAdmin = await User.findOne({ email: 'superadmin@skillup.com' });
    
    if (!superAdmin) {
      console.log('❌ Super admin user not found!');
      console.log('Run the seedAdminUsers.js script first.');
      process.exit(1);
    }

    console.log('\n📋 Current Super Admin Details:');
    console.log('   Name:', superAdmin.name);
    console.log('   Email:', superAdmin.email);
    console.log('   Role:', superAdmin.role);
    console.log('   Admin Role:', superAdmin.adminRole);

    // Update to correct adminRole
    superAdmin.adminRole = 'super_admin';
    superAdmin.role = 'admin';
    superAdmin.isEmailVerified = true;
    superAdmin.isProfileComplete = true;
    
    await superAdmin.save({ validateBeforeSave: false });

    console.log('\n✅ Super Admin fixed successfully!');
    console.log('\n📋 Updated Super Admin Details:');
    console.log('   Name:', superAdmin.name);
    console.log('   Email:', superAdmin.email);
    console.log('   Role:', superAdmin.role);
    console.log('   Admin Role:', superAdmin.adminRole);

    console.log('\n🔐 Login with:');
    console.log('   Email: superadmin@skillup.com');
    console.log('   Password: SuperAdmin@123');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

fixSuperAdmin();
