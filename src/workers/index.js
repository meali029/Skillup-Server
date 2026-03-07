import { isRedisConnected } from '../config/redis.js';

let emailWorker = null;
let ocrWorker = null;

export const startWorkers = async () => {
  if (!isRedisConnected()) {
    console.warn('[Workers] Redis not connected — BullMQ workers disabled');
    return;
  }

  try {
    const emailMod = await import('./email.worker.js');
    emailWorker = emailMod.default;

    const ocrMod = await import('./ocr.worker.js');
    ocrWorker = ocrMod.default;

    console.log('[Workers] Email and OCR workers started');
  } catch (err) {
    console.error('[Workers] Failed to start workers:', err.message);
  }
};

export const stopWorkers = async () => {
  const closing = [];
  if (emailWorker) closing.push(emailWorker.close());
  if (ocrWorker) closing.push(ocrWorker.close());
  await Promise.allSettled(closing);
  console.log('[Workers] All workers stopped');
};
