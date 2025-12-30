/**
 * Wallet Migration Script
 * Creates wallets for all existing users and initializes wallet balances
 * Run with: node src/scripts/migrate-wallets.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

import User from '../models/User.js';
import Wallet from '../models/Wallet.js';

const migrateWallets = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('❌ MONGO_URI not found in environment variables');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get all users
    const users = await User.find({});
    console.log(`📊 Found ${users.length} users`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Create wallets for each user
    for (const user of users) {
      try {
        // Check if wallet already exists
        let wallet = await Wallet.findOne({ userId: user._id });

        if (wallet) {
          console.log(`⏭️  Wallet already exists for user ${user.email}`);
          skipped++;
          continue;
        }

        // Create new wallet
        wallet = await Wallet.create({
          userId: user._id,
          availableBalance: 0,
          lockedBalance: 0,
          totalEarned: user.totalEarnings || 0,
          totalWithdrawn: 0,
          currency: 'PKR',
        });

        // Update user with wallet reference
        user.walletId = wallet._id;
        await user.save();

        created++;
        console.log(`✅ Created wallet for user ${user.email}`);
      } catch (error) {
        console.error(`❌ Error creating wallet for user ${user.email}:`, error.message);
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${users.length}`);

    console.log('\n✅ Wallet migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
};

// Run migration
migrateWallets();

