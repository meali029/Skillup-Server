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
    password: 'SuperAdmin@123',
    role: 'admin',
    adminRole: 'super_admin', // Full system access
    provider: 'local',
    isEmailVerified: true,
    isProfileComplete: true,
    isActive: true,
    avatar: 'https://ui-avatars.com/api/?name=Super+Admin&background=DC2626&color=fff&size=200'
  },
  {
    name: 'Admin User',
    email: 'admin@skillup.com',
    password: 'Admin@123',
    role: 'admin',
    adminRole: 'admin', // Can manage users, CNIC, jobs
    provider: 'local',
    isEmailVerified: true,
    isProfileComplete: true,
    isActive: true,
    avatar: 'https://ui-avatars.com/api/?name=Admin+User&background=3B82F6&color=fff&size=200'
  },
  {
    name: 'Content Moderator',
    email: 'moderator@skillup.com',
    password: 'Moderator@123',
    role: 'admin',
    adminRole: 'moderator', // Can view and moderate content
    provider: 'local',
    isEmailVerified: true,
    isProfileComplete: true,
    isActive: true,
    avatar: 'https://ui-avatars.com/api/?name=Content+Moderator&background=10B981&color=fff&size=200'
  },
];

const seedAdminUsers = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log('Connected to MongoDB');

    // Don't hash passwords here - User model's pre-save hook will handle it
    // This prevents double-hashing which causes login failures

    // Check if admin users already exist
    for (let adminData of adminUsers) {
      const existingUser = await User.findOne({ email: adminData.email });
      
      if (existingUser) {
        console.log(`✓ User already exists: ${adminData.email}`);
        
        // Update to admin role and set adminRole
        if (existingUser.role !== 'admin' || existingUser.adminRole !== adminData.adminRole) {
          existingUser.role = 'admin';
          existingUser.adminRole = adminData.adminRole;
          existingUser.isEmailVerified = true;
          existingUser.isProfileComplete = true;
          existingUser.avatar = adminData.avatar;
          await existingUser.save();
          console.log(`  → Updated ${adminData.email} to ${adminData.adminRole} role`);
        }
      } else {
        // Create new admin user - password will be hashed by User model's pre-save hook
        const newUser = await User.create(adminData);
        console.log(`✓ Created ${adminData.adminRole}: ${adminData.email}`);
      }
    }

    console.log('\n✅ Admin users seeded successfully!');
    console.log('\n📋 Login credentials:');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  SUPER ADMIN (Full Access)                                ║');
    console.log('║  Email: superadmin@skillup.com                            ║');
    console.log('║  Password: SuperAdmin@123                                 ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  ADMIN (User & Job Management)                            ║');
    console.log('║  Email: admin@skillup.com                                 ║');
    console.log('║  Password: Admin@123                                      ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  MODERATOR (View & Moderate Content)                      ║');
    console.log('║  Email: moderator@skillup.com                             ║');
    console.log('║  Password: Moderator@123                                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\n🔐 Role Permissions:');
    console.log('   • Super Admin: All permissions including admin management');
    console.log('   • Admin: User, CNIC, job management & analytics');
    console.log('   • Moderator: View & moderate content, basic CNIC verification\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding admin users:', error);
    process.exit(1);
  }
};

// Run the seed function
seedAdminUsers();
