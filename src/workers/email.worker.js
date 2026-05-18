import { Worker } from 'bullmq';
import {
  directSendEmailVerification,
  directSendOTPEmail,
  directSendPasswordResetConfirmation,
  directSendSubscriptionEmail,
} from '../core/utils/emailService.js';
import { JOB_NAMES, QUEUE_NAMES, WORKER_CONCURRENCY } from './jobSchedules.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const emailWorker = new Worker(
  QUEUE_NAMES.email,
  async (job) => {
    const { type } = job.data;
    console.log(`[EmailWorker] Processing ${type} (job ${job.id})`);

    switch (type) {
      case JOB_NAMES.emailVerification: {
        const { email, name, token } = job.data;
        await directSendEmailVerification(email, name, token);
        break;
      }
      case JOB_NAMES.emailOtp: {
        const { email, otp, name } = job.data;
        await directSendOTPEmail(email, otp, name);
        break;
      }
      case JOB_NAMES.emailPasswordReset: {
        const { email, name } = job.data;
        await directSendPasswordResetConfirmation(email, name);
        break;
      }
      case JOB_NAMES.emailSubscription: {
        const { email, ...data } = job.data;
        await directSendSubscriptionEmail(email, data);
        break;
      }
      default:
        console.warn(`[EmailWorker] Unknown job type: ${type}`);
    }
  },
  {
    connection: { url: REDIS_URL },
    concurrency: WORKER_CONCURRENCY.email,
  },
);

emailWorker.on('completed', (job) => {
  console.log(`[EmailWorker] Job ${job.id} completed (${job.data.type})`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[EmailWorker] Job ${job?.id} failed:`, err.message);
});

export default emailWorker;
