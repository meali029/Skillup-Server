import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Contract from '../models/Contract.js';
import Proposal from '../models/Proposal.js';
import Job from '../models/Job.js';
import { CONTRACT_STATUS } from '../modules/contracts/contract.constants.js';

const isDryRun = process.argv.includes('--dry-run');

async function run() {
  await connectDB();

  const contracts = await Contract.find({
    status: { $in: [CONTRACT_STATUS.COMPLETED, CONTRACT_STATUS.CLOSED] },
    proposal: { $exists: true, $ne: null },
  })
    .select('status proposal job completedAt updatedAt')
    .lean();

  let completedProposals = 0;
  let closedProposals = 0;
  let completedJobs = 0;

  for (const contract of contracts) {
    const timestamp = contract.completedAt || contract.updatedAt || new Date();

    if (contract.status === CONTRACT_STATUS.CLOSED) {
      const filter = { _id: contract.proposal, status: { $in: ['accepted', 'completed'] } };
      if (isDryRun) {
        closedProposals += await Proposal.countDocuments(filter);
      } else {
        const proposalUpdate = await Proposal.updateOne(
          filter,
          { $set: { status: 'closed', closedAt: timestamp } }
        );
        closedProposals += proposalUpdate.modifiedCount || 0;
      }
    }

    if (contract.status === CONTRACT_STATUS.COMPLETED) {
      const filter = { _id: contract.proposal, status: 'accepted' };
      if (isDryRun) {
        completedProposals += await Proposal.countDocuments(filter);
      } else {
        const proposalUpdate = await Proposal.updateOne(
          filter,
          { $set: { status: 'completed', completedAt: timestamp } }
        );
        completedProposals += proposalUpdate.modifiedCount || 0;
      }
    }

    if (contract.job) {
      const filter = { _id: contract.job, status: { $nin: ['completed', 'cancelled'] } };
      if (isDryRun) {
        completedJobs += await Job.countDocuments(filter);
      } else {
        const jobUpdate = await Job.updateOne(
          filter,
          { $set: { status: 'completed', completedAt: timestamp } }
        );
        completedJobs += jobUpdate.modifiedCount || 0;
      }
    }
  }

  console.log('[Backfill] Proposal/contract status sync completed', {
    dryRun: isDryRun,
    contractsChecked: contracts.length,
    completedProposals,
    closedProposals,
    completedJobs,
  });
}

run()
  .catch((error) => {
    console.error('[Backfill] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
