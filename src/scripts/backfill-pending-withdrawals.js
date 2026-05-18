import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Transaction from '../models/Transaction.js';
import Wallet from '../models/Wallet.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';

const isDryRun = process.argv.includes('--dry-run');
const pendingStatuses = ['REQUESTED', 'PROCESSING'];

async function run() {
  await connectDB();

  const withdrawals = await WithdrawalRequest.find({
    status: { $in: pendingStatuses },
  }).select('_id userId amount status');

  let checked = 0;
  let fixed = 0;

  for (const withdrawal of withdrawals) {
    checked += 1;

    const transaction = await Transaction.findOne({
      withdrawalRequestId: withdrawal._id,
      type: 'WITHDRAWAL',
      status: 'SUCCESS',
    });

    if (!transaction) continue;

    fixed += 1;

    if (isDryRun) continue;

    transaction.status = withdrawal.status === 'PROCESSING' ? 'PROCESSING' : 'PENDING';
    transaction.completedAt = undefined;
    await transaction.save();

    await Wallet.findOneAndUpdate(
      { userId: withdrawal.userId },
      {
        $inc: {
          lockedBalance: withdrawal.amount,
          totalWithdrawn: -withdrawal.amount,
          version: 1,
        },
        $set: { lastTransactionAt: new Date() },
      }
    );
  }

  console.log('[Backfill] Pending withdrawal sync completed', {
    dryRun: isDryRun,
    checked,
    fixed,
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
