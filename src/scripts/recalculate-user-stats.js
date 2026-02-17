/**
 * Migration Script: Recalculate User Statistics
 * 
 * This script recalculates job and proposal statistics for all users:
 * - For clients: postedJobsCount, activeJobsCount, completedJobsCount, totalSpent
 * - For freelancers: appliedJobsCount, activeProposalsCount, completedJobsCount, totalEarnings
 * 
 * Usage: node src/scripts/recalculate-user-stats.js
 */

import mongoose from 'mongoose';
import User from '../models/User.js';
import Job from '../models/Job.js';
import Proposal from '../models/Proposal.js';
import Contract from '../models/Contract.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const recalculateClientStats = async (clientId) => {
  try {
    // Count posted jobs
    const postedJobsCount = await Job.countDocuments({
      client: clientId,
      deletedAt: null
    });

    // Count active jobs (open or in-progress)
    const activeJobsCount = await Job.countDocuments({
      client: clientId,
      status: { $in: ['open', 'in-progress'] },
      isActive: true,
      deletedAt: null
    });

    // Count completed contracts for this client
    const completedContracts = await Contract.find({
      client: clientId,
      status: 'completed'
    });

    const completedJobsCount = completedContracts.length;

    // Calculate total spent from completed contracts
    const totalSpent = completedContracts.reduce((sum, contract) => {
      // Use paymentDetails.grossAmount if available (actual amount paid with fees),
      // otherwise use totalAmount (contract amount)
      const amount = contract.paymentDetails?.grossAmount || contract.totalAmount || 0;
      return sum + amount;
    }, 0);

    // Update user
    await User.findByIdAndUpdate(clientId, {
      postedJobsCount,
      activeJobsCount,
      completedJobsCount,
      totalSpent
    });

    return { postedJobsCount, activeJobsCount, completedJobsCount, totalSpent };
  } catch (error) {
    console.error(`Error recalculating stats for client ${clientId}:`, error.message);
    return null;
  }
};

const recalculateFreelancerStats = async (freelancerId) => {
  try {
    // Count applied jobs (total proposals submitted, excluding withdrawn)
    const appliedJobsCount = await Proposal.countDocuments({
      freelancerId: freelancerId,
      status: { $ne: 'withdrawn' }
    });

    // Count active proposals (pending proposals)
    const activeProposalsCount = await Proposal.countDocuments({
      freelancerId: freelancerId,
      status: 'pending'
    });

    // Count completed contracts for this freelancer
    const completedContracts = await Contract.find({
      freelancer: freelancerId,
      status: 'completed'
    });

    const completedJobsCount = completedContracts.length;

    // Calculate total earnings from completed contracts
    const totalEarnings = completedContracts.reduce((sum, contract) => {
      // Use paymentDetails.netAmount if available (amount after platform fee),
      // otherwise calculate 95% of totalAmount (assuming 5% platform fee)
      const amount = contract.paymentDetails?.netAmount || (contract.totalAmount * 0.95) || 0;
      return sum + amount;
    }, 0);

    // Update user
    await User.findByIdAndUpdate(freelancerId, {
      appliedJobsCount,
      activeProposalsCount,
      completedJobsCount,
      totalEarnings
    });

    return { appliedJobsCount, activeProposalsCount, completedJobsCount, totalEarnings };
  } catch (error) {
    console.error(`Error recalculating stats for freelancer ${freelancerId}:`, error.message);
    return null;
  }
};

const runMigration = async () => {
  console.log('🚀 Starting user statistics recalculation...\n');

  try {
    // Get all clients
    const clients = await User.find({ role: 'client' }).select('_id name email');
    console.log(`📊 Found ${clients.length} clients\n`);

    let clientsUpdated = 0;
    for (const client of clients) {
      const stats = await recalculateClientStats(client._id);
      if (stats) {
        clientsUpdated++;
        console.log(`✅ Client: ${client.name} (${client.email})`);
        console.log(`   Posted: ${stats.postedJobsCount} | Active: ${stats.activeJobsCount} | Completed: ${stats.completedJobsCount} | Spent: Rs. ${stats.totalSpent}\n`);
      }
    }

    // Get all freelancers
    const freelancers = await User.find({ role: 'freelancer' }).select('_id name email');
    console.log(`\n📊 Found ${freelancers.length} freelancers\n`);

    let freelancersUpdated = 0;
    for (const freelancer of freelancers) {
      const stats = await recalculateFreelancerStats(freelancer._id);
      if (stats) {
        freelancersUpdated++;
        console.log(`✅ Freelancer: ${freelancer.name} (${freelancer.email})`);
        console.log(`   Applied: ${stats.appliedJobsCount} | Active: ${stats.activeProposalsCount} | Completed: ${stats.completedJobsCount} | Earned: Rs. ${stats.totalEarnings}\n`);
      }
    }

    console.log('\n✨ Migration completed successfully!');
    console.log(`📈 Updated ${clientsUpdated} clients and ${freelancersUpdated} freelancers\n`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Main execution
(async () => {
  try {
    await connectDB();
    await runMigration();
    console.log('✅ Done! Disconnecting...');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
})();
