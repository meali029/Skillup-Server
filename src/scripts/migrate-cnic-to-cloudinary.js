#!/usr/bin/env node

/**
 * CNIC Image Migration Script
 * 
 * Migrates existing CNIC images from local storage to Cloudinary
 * 
 * Usage:
 *   node src/scripts/migrate-cnic-to-cloudinary.js [--dry-run]
 * 
 * Options:
 *   --dry-run    Preview migration without making changes
 */

import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import after env is loaded
import User from '../models/User.js';
import { uploadToCloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';

const DRY_RUN = process.argv.includes('--dry-run');
const LOCAL_CNIC_PATH = path.join(process.cwd(), 'uploads', 'cnic');

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

async function migrateUserCNIC(user) {
  const userId = user._id.toString();
  const cnic = user.cnic;

  // Skip if already migrated (has publicId)
  if (cnic.frontImage?.publicId && cnic.backImage?.publicId) {
    return { status: 'skipped', reason: 'Already migrated to Cloudinary' };
  }

  // Skip if no images
  if (!cnic.frontImage && !cnic.backImage) {
    return { status: 'skipped', reason: 'No images to migrate' };
  }

  const results = {
    front: null,
    back: null,
  };

  // Migrate front image
  if (cnic.frontImage && typeof cnic.frontImage === 'string' && !cnic.frontImage.publicId) {
    const localPath = path.join(process.cwd(), cnic.frontImage);
    
    try {
      const exists = await fs.access(localPath).then(() => true).catch(() => false);
      
      if (exists) {
        if (!DRY_RUN) {
          const buffer = await fs.readFile(localPath);
          const uploadResult = await uploadToCloudinary(
            buffer,
            `skillup/cnic/${userId}`,
            `front_migrated_${Date.now()}`,
            { tags: ['cnic', 'front', userId, 'migrated'] }
          );
          results.front = uploadResult;
        } else {
          results.front = { dryRun: true, localPath };
        }
      } else {
        results.front = { error: 'File not found', localPath };
      }
    } catch (error) {
      results.front = { error: error.message };
    }
  }

  // Migrate back image
  if (cnic.backImage && typeof cnic.backImage === 'string' && !cnic.backImage.publicId) {
    const localPath = path.join(process.cwd(), cnic.backImage);
    
    try {
      const exists = await fs.access(localPath).then(() => true).catch(() => false);
      
      if (exists) {
        if (!DRY_RUN) {
          const buffer = await fs.readFile(localPath);
          const uploadResult = await uploadToCloudinary(
            buffer,
            `skillup/cnic/${userId}`,
            `back_migrated_${Date.now()}`,
            { tags: ['cnic', 'back', userId, 'migrated'] }
          );
          results.back = uploadResult;
        } else {
          results.back = { dryRun: true, localPath };
        }
      } else {
        results.back = { error: 'File not found', localPath };
      }
    } catch (error) {
      results.back = { error: error.message };
    }
  }

  // Update user in database
  if (!DRY_RUN && (results.front?.publicId || results.back?.publicId)) {
    const updateData = {};
    
    if (results.front?.publicId) {
      updateData['cnic.frontImage'] = {
        publicId: results.front.publicId,
        secureUrl: results.front.secureUrl,
        width: results.front.width,
        height: results.front.height,
      };
    }
    
    if (results.back?.publicId) {
      updateData['cnic.backImage'] = {
        publicId: results.back.publicId,
        secureUrl: results.back.secureUrl,
        width: results.back.width,
        height: results.back.height,
      };
    }

    await User.findByIdAndUpdate(userId, { $set: updateData });
  }

  return { status: 'migrated', results };
}

async function main() {
  console.log('\n🚀 CNIC Image Migration to Cloudinary\n');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes will be made)' : '⚡ LIVE MIGRATION'}\n`);

  // Check Cloudinary configuration
  if (!DRY_RUN && !isCloudinaryConfigured()) {
    console.error('❌ Cloudinary is not configured. Set environment variables and try again.');
    process.exit(1);
  }

  await connectDB();

  // Find users with CNIC submissions
  const users = await User.find({
    'cnic.status': { $in: ['pending', 'under_review', 'verified'] },
    $or: [
      { 'cnic.frontImage': { $type: 'string' } },
      { 'cnic.backImage': { $type: 'string' } },
    ],
  }).select('_id name email cnic');

  console.log(`📋 Found ${users.length} users with CNIC images to potentially migrate\n`);

  const stats = {
    total: users.length,
    migrated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const user of users) {
    console.log(`\nProcessing: ${user.name} (${user.email})`);
    
    try {
      const result = await migrateUserCNIC(user);
      
      if (result.status === 'migrated') {
        stats.migrated++;
        console.log(`  ✅ Migrated successfully`);
        if (result.results.front) console.log(`     Front: ${result.results.front.publicId || result.results.front.dryRun || result.results.front.error}`);
        if (result.results.back) console.log(`     Back: ${result.results.back.publicId || result.results.back.dryRun || result.results.back.error}`);
      } else if (result.status === 'skipped') {
        stats.skipped++;
        console.log(`  ⏭️ Skipped: ${result.reason}`);
      }
    } catch (error) {
      stats.failed++;
      console.log(`  ❌ Failed: ${error.message}`);
    }
  }

  console.log('\n📊 Migration Summary:');
  console.log(`   Total users: ${stats.total}`);
  console.log(`   Migrated: ${stats.migrated}`);
  console.log(`   Skipped: ${stats.skipped}`);
  console.log(`   Failed: ${stats.failed}`);
  
  if (DRY_RUN) {
    console.log('\n⚠️ This was a dry run. No changes were made.');
    console.log('   Run without --dry-run to perform actual migration.');
  }

  await mongoose.disconnect();
  console.log('\n✅ Migration complete!\n');
}

main().catch(console.error);
