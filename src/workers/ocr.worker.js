import { Worker } from 'bullmq';
import cnicOCRService from '../services/cnic-ocr.service.js';
import User from '../models/User.js';
import { QUEUE_NAMES, WORKER_CONCURRENCY } from './jobSchedules.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const ocrWorker = new Worker(
  QUEUE_NAMES.ocr,
  async (job) => {
    const { userId, frontImageUrl, backImageUrl } = job.data;
    console.log(`[OCRWorker] Processing CNIC OCR for user ${userId} (job ${job.id})`);

    const ocrResult = await cnicOCRService.extractCNICData(frontImageUrl, backImageUrl || null);

    // Update the user document with OCR results
    const updateData = {
      'cnic.ocrData': ocrResult,
      'cnic.status': ocrResult.success ? 'pending_verification' : 'ocr_failed',
    };

    if (ocrResult.success && ocrResult.extractedCnicNumber) {
      updateData['cnic.ocrData.extractedCnicNumber'] = ocrResult.extractedCnicNumber;
    }

    await User.findByIdAndUpdate(userId, { $set: updateData });

    console.log(`[OCRWorker] CNIC OCR ${ocrResult.success ? 'succeeded' : 'failed'} for user ${userId}`);
    return { success: ocrResult.success, confidence: ocrResult.confidence };
  },
  {
    connection: { url: REDIS_URL },
    concurrency: WORKER_CONCURRENCY.ocr, // CPU/memory intensive — keep low
  },
);

ocrWorker.on('completed', (job, result) => {
  console.log(`[OCRWorker] Job ${job.id} completed — success: ${result.success}`);
});

ocrWorker.on('failed', (job, err) => {
  console.error(`[OCRWorker] Job ${job?.id} failed:`, err.message);
});

export default ocrWorker;
