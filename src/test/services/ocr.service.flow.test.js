import OCR from '../../services/ocr.service.js';
import fs from 'fs/promises';
import sharp from 'sharp';

jest.mock('sharp');

describe('OCRService - preprocessImage and extractCNICData flows', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('preprocessImage returns original when image is too small', async () => {
    // sharp(...).metadata() will return small values
    sharp.mockImplementation((p) => ({
      metadata: async () => ({ width: 50, height: 50 })
    }));

    const res = await OCR.preprocessImage('small.jpg');
    expect(res).toBe('small.jpg');
  });

  test('preprocessImage returns enhanced path on success', async () => {
    sharp.mockImplementation((p) => {
      const obj = {
        metadata: async () => ({ width: 2000, height: 1500 }),
        resize: () => obj,
        greyscale: () => obj,
        normalise: () => obj,
        linear: () => obj,
        clahe: () => obj,
        sharpen: () => obj,
        gamma: () => obj,
        threshold: () => obj,
        median: () => obj,
        toFile: async () => Promise.resolve()
      };
      return obj;
    });

    // Also stub metadata call for processed file to be sufficiently large
    sharp.mockImplementationOnce((p) => ({ metadata: async () => ({ width: 200, height: 200 }), resize: () => ({ toFile: async () => Promise.resolve() }), greyscale: () => ({ toFile: async () => Promise.resolve() }) }));

    const res = await OCR.preprocessImage('big.jpg');
    expect(res).toMatch(/_ocr_enhanced\.jpg$/);
  });

  test('extractCNICData handles inaccessible files', async () => {
    jest.spyOn(fs, 'access').mockImplementation(() => Promise.reject(new Error('not found')));
    const out = await OCR.extractCNICData('x.jpg', 'y.jpg');
    expect(out.error).toMatch(/Image files not found/);
  });

  test('extractCNICData handles no text extracted', async () => {
    jest.spyOn(fs, 'access').mockImplementation(() => Promise.resolve());
    jest.spyOn(OCR, 'extractTextFromImage').mockImplementation(async () => ({ text: '', confidence: 50, digitSequences: [] }));

    const out = await OCR.extractCNICData('front.jpg', 'back.jpg');
    expect(out.error).toMatch(/No text extracted/);
  });
});
