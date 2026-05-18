import Transaction from '../../models/Transaction.js';
import Escrow from '../../models/Escrow.js';
import Contract from '../../models/Contract.js';
import walletService from './wallet.service.js';
import escrowService from './escrow.service.js';
import safepayService from '../../services/paymentGateways/safepay.service.js';
import subscriptionService from '../subscriptions/subscription.service.js';
import { notifyUser } from '../notifications/notification.service.js';

async function autoFundEscrowAndActivateContract(transaction, logPrefix = 'Safepay verifier') {
  if (!transaction.escrowId) return;

  try {
    const escrow = await Escrow.findById(transaction.escrowId);
    if (!escrow) return;

    if (escrow.status === 'CREATED') {
      await escrowService.fundEscrow(transaction.escrowId.toString(), {
        transactionId: transaction._id.toString(),
        paymentMethod: transaction.paymentMethod,
        gatewayTransactionId: transaction.gatewayTransactionId,
      });
    }

    if (escrow.contractId && escrow.milestoneId === 'TOTAL') {
      const updated = await Contract.findOneAndUpdate(
        { _id: escrow.contractId, paymentStatus: { $ne: 'COMPLETED' } },
        { $set: { paymentStatus: 'COMPLETED' } },
        { new: true }
      );

      if (updated) {
        console.log(`${logPrefix}: contract`, escrow.contractId, 'payment completed');
      }
    }
  } catch (error) {
    console.error(`${logPrefix}: escrow fund error for txn`, transaction._id, error.message);
  }
}

export async function verifyPendingSafepayTransactions({
  userId = null,
  limit = Number(process.env.SAFEPAY_VERIFY_BATCH_SIZE || 50),
  logPrefix = 'Safepay verifier',
} = {}) {
  const timeoutHours = Number(process.env.SAFEPAY_PENDING_TIMEOUT_HOURS || 24);
  const staleCutoff = new Date(Date.now() - timeoutHours * 60 * 60 * 1000);

  const query = {
    paymentMethod: 'SAFEPAY',
    status: 'PENDING',
    type: { $in: ['DEPOSIT', 'SUBSCRIPTION'] },
  };

  if (userId) query.userId = userId;

  const pendingTxns = await Transaction.find(query)
    .sort({ createdAt: 1 })
    .limit(limit);

  let verified = 0;
  let timedOut = 0;
  let failed = 0;

  for (const txn of pendingTxns) {
    if (txn.createdAt && txn.createdAt <= staleCutoff) {
      const failedTxn = await Transaction.findOneAndUpdate(
        { _id: txn._id, status: 'PENDING' },
        {
          status: 'FAILED',
          failureReason: `Safepay verification timeout after ${timeoutHours} hours`,
          completedAt: new Date(),
        },
        { new: true }
      );

      if (failedTxn) {
        timedOut += 1;
        try {
          await notifyUser(txn.userId, {
            type: 'payment_failed',
            title: 'Payment Verification Timed Out',
            message:
              failedTxn.type === 'SUBSCRIPTION'
                ? 'Your pending subscription payment timed out. Please retry from the pricing page if you still want to upgrade.'
                : 'Your pending wallet deposit timed out. Please try the deposit again.',
            link: failedTxn.type === 'SUBSCRIPTION' ? '/pricing' : '/wallet',
          });
        } catch (error) {
          console.error(`${logPrefix}: timeout notification error for txn`, txn._id, error.message);
        }
      }

      continue;
    }

    try {
      const result = await safepayService.verifyPaymentByTracker(
        txn.gatewayTransactionId,
        txn.description
      );

      if (!result.success) continue;

      const updated = await Transaction.findOneAndUpdate(
        { _id: txn._id, status: 'PENDING' },
        {
          status: 'SUCCESS',
          completedAt: new Date(),
          gatewayTransactionId: result.gatewayTransactionId || txn.gatewayTransactionId,
        },
        { new: true }
      );

      if (!updated) continue;

      if (updated.type === 'SUBSCRIPTION') {
        await subscriptionService.activateAfterPayment(updated._id);
        console.log(`${logPrefix}: subscription activated for user`, updated.userId);
      } else {
        await walletService.creditExistingDeposit(updated.userId, updated.amount);
        console.log(`${logPrefix}: credited`, updated.amount, 'to user', updated.userId);
        await autoFundEscrowAndActivateContract(updated, logPrefix);
      }

      verified += 1;
    } catch (error) {
      failed += 1;
      console.error(`${logPrefix}: error for txn`, txn._id, error.message);
    }
  }

  return {
    checked: pendingTxns.length,
    verified,
    timedOut,
    failed,
    pending: Math.max(pendingTxns.length - verified - timedOut, 0),
  };
}

export default {
  verifyPendingSafepayTransactions,
};
