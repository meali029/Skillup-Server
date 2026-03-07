import { Worker } from 'bullmq';
import {
  directSendEmailVerification,
  directSendOTPEmail,
  directSendPasswordResetConfirmation,
} from '../core/utils/emailService.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const emailWorker = new Worker(
  'email-queue',
  async (job) => {
    const { type } = job.data;
    console.log(`[EmailWorker] Processing ${type} (job ${job.id})`);

    switch (type) {
      case 'send-verification': {
        const { email, name, token } = job.data;
        await directSendEmailVerification(email, name, token);
        break;
      }
      case 'send-otp': {
        const { email, otp, name } = job.data;
        await directSendOTPEmail(email, otp, name);
        break;
      }
      case 'send-password-reset': {
        const { email, name } = job.data;
        await directSendPasswordResetConfirmation(email, name);
        break;
      }
      default:
        console.warn(`[EmailWorker] Unknown job type: ${type}`);
    }
  },
  {
    connection: { url: REDIS_URL },
    concurrency: 5,
  },
);

emailWorker.on('completed', (job) => {
  console.log(`[EmailWorker] Job ${job.id} completed (${job.data.type})`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[EmailWorker] Job ${job?.id} failed:`, err.message);
});

export default emailWorker;
