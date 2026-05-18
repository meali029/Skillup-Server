import cron from 'node-cron';
import { verifyPendingSafepayTransactions } from '../modules/payments/safepay-verification.service.js';
import { JOB_LIMITS, JOB_SCHEDULES } from './jobSchedules.js';

let isRunning = false;

export function initSafepayVerifierCron() {
  const task = cron.schedule(JOB_SCHEDULES.safepayVerifier, async () => {
    if (isRunning) {
      console.log('[SafepayVerifier] Previous run still active, skipping');
      return;
    }

    isRunning = true;
    try {
      const result = await verifyPendingSafepayTransactions({
        logPrefix: 'Safepay cron verifier',
        limit: JOB_LIMITS.safepayVerifierBatchSize,
      });

      if (result.checked > 0 || result.verified > 0 || result.timedOut > 0 || result.failed > 0) {
        console.log('[SafepayVerifier] Run completed', result);
      }
    } catch (error) {
      console.error('[SafepayVerifier] Cron error:', error.message);
    } finally {
      isRunning = false;
    }
  });

  console.log(`[SafepayVerifier] Cron initialized (${JOB_SCHEDULES.safepayVerifier})`);
  return task;
}

export default { initSafepayVerifierCron };
