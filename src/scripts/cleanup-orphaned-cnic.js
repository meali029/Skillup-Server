/**
 * Cleanup Script: Find and Fix Orphaned CNIC Records
 * 
 * This script identifies CNIC records in the database that reference
 * image files that no longer exist on the filesystem.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = join(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath });

import mongoose from 'mongoose';
import User from '../models/User.js';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

const checkFileExists = async (filePath) => {
  try {
    const fullPath = join(process.cwd(), filePath);
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
};

const findOrphanedCNICRecords = async () => {
  console.log('\n🔍 Scanning for orphaned CNIC records...\n');

  const users = await User.find({
    $or: [
      { 'cnic.frontImage': { $exists: true, $ne: null } },
      { 'cnic.backImage': { $exists: true, $ne: null } }
    ]
  }).select('_id email username cnic.frontImage cnic.backImage cnic.status');

  const orphanedRecords = [];
  const validRecords = [];

  for (const user of users) {
    const issues = [];
    
    if (user.cnic?.frontImage) {
      const exists = await checkFileExists(user.cnic.frontImage);
      if (!exists) {
        issues.push({
          type: 'frontImage',
          path: user.cnic.frontImage
        });
      }
    }
    
    if (user.cnic?.backImage) {
      const exists = await checkFileExists(user.cnic.backImage);
      if (!exists) {
        issues.push({
          type: 'backImage',
          path: user.cnic.backImage
        });
      }
    }

    if (issues.length > 0) {
      orphanedRecords.push({
        userId: user._id,
        email: user.email,
        username: user.username,
        status: user.cnic?.status,
        issues
      });
    } else if (user.cnic?.frontImage || user.cnic?.backImage) {
      validRecords.push({
        userId: user._id,
        email: user.email,
        status: user.cnic?.status
      });
    }
  }

  return { orphanedRecords, validRecords };
};

const displayResults = (orphanedRecords, validRecords) => {
  console.log('📊 SCAN RESULTS\n');
  console.log(`✅ Valid CNIC records: ${validRecords.length}`);
  console.log(`❌ Orphaned CNIC records: ${orphanedRecords.length}\n`);

  if (orphanedRecords.length > 0) {
    console.log('🔴 ORPHANED RECORDS (files missing from disk):\n');
    orphanedRecords.forEach((record, index) => {
      console.log(`${index + 1}. User: ${record.username || record.email}`);
      console.log(`   ID: ${record.userId}`);
      console.log(`   Status: ${record.status}`);
      console.log(`   Missing files:`);
      record.issues.forEach(issue => {
        console.log(`   - ${issue.type}: ${issue.path}`);
      });
      console.log();
    });
  }

  if (validRecords.length > 0) {
    console.log('✅ VALID RECORDS:\n');
    validRecords.forEach((record, index) => {
      console.log(`${index + 1}. User: ${record.email} (Status: ${record.status})`);
    });
    console.log();
  }
};

const fixOrphanedRecords = async (orphanedRecords, action = 'list') => {
  if (action === 'list') {
    console.log('\n💡 To fix these records, run:');
    console.log('   node src/scripts/cleanup-orphaned-cnic.js --fix reset');
    console.log('   This will reset orphaned records to allow re-upload\n');
    return;
  }

  if (action === 'reset') {
    console.log('\n🔧 Fixing orphaned records...\n');
    
    for (const record of orphanedRecords) {
      try {
        await User.findByIdAndUpdate(record.userId, {
          $set: {
            'cnic.frontImage': null,
            'cnic.backImage': null,
            'cnic.status': 'not_uploaded',
            'cnic.rejectionReason': 'System cleanup: Files were missing from server',
            'cnic.updatedAt': new Date()
          },
          $unset: {
            'cnic.ocrData': '',
            'cnic.extractedData': ''
          }
        });
        console.log(`✅ Reset CNIC for user: ${record.email}`);
      } catch (error) {
        console.error(`❌ Failed to reset CNIC for ${record.email}:`, error.message);
      }
    }
    
    console.log(`\n✅ Fixed ${orphanedRecords.length} orphaned records`);
    console.log('Users can now re-upload their CNIC documents\n');
  }
};

const main = async () => {
  try {
    await connectDB();

    const action = process.argv[2] === '--fix' ? process.argv[3] : 'list';
    
    const { orphanedRecords, validRecords } = await findOrphanedCNICRecords();
    
    displayResults(orphanedRecords, validRecords);
    
    if (orphanedRecords.length > 0) {
      await fixOrphanedRecords(orphanedRecords, action);
    } else {
      console.log('✨ No orphaned records found! All CNIC files are intact.\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
};

main();
