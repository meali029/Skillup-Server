import OCR from '../../services/ocr.service.js';

describe('OCRService - terminate', () => {
  test('terminate calls worker.terminate and clears worker', async () => {
    const fakeWorker = { terminate: jest.fn(async () => Promise.resolve()) };
    OCR.worker = fakeWorker;

    await OCR.terminate();
    expect(fakeWorker.terminate).toHaveBeenCalled();
    expect(OCR.worker).toBeNull();
  });
});