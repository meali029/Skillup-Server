import OCR from '../../services/ocr.service.js';
import sharp from 'sharp';
import fs from 'fs/promises';

jest.mock('sharp');

function fluent(meta = { width: 2000, height: 1500 }) {
  const obj = {
    metadata: async () => meta,
    resize: () => obj,
    greyscale: () => obj,
    normalise: () => obj,
    normalize: () => obj,
    linear: () => obj,
    clahe: () => obj,
    sharpen: () => obj,
    gamma: () => obj,
    threshold: () => obj,
    median: () => obj,
    toFile: async () => Promise.resolve()
  };
  return obj;
}

describe('OCRService - preprocessImage edge cases', () => {
  beforeEach(() => jest.resetAllMocks());

  test('returns original when processed image is too small after preprocessing', async () => {
    // First call: initial metadata
    sharp.mockImplementationOnce(() => ({ metadata: async () => ({ width: 2000, height: 1500 }) }));
    // Second call: processing chain
    sharp.mockImplementation(() => fluent({ width: 2000, height: 1500 }));
    // Third call: metadata for processed file -> small
    sharp.mockImplementationOnce(() => ({ metadata: async () => ({ width: 80, height: 80 }) }));

    jest.spyOn(fs, 'unlink').mockImplementation(() => Promise.resolve());

    const res = await OCR.preprocessImage('big.jpg');
    expect(res).toBe('big.jpg');
  });

  test('returns original on preprocessing exception', async () => {
    sharp.mockImplementation(() => ({ metadata: async () => ({ width: 500, height: 500 }), resize: () => ({ greyscale: () => { throw new Error('preprocess fail'); } }) }));

    const res = await OCR.preprocessImage('fail.jpg');
    expect(res).toBe('fail.jpg');
  });
});