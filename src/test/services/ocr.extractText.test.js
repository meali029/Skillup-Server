import OCR from '../../services/ocr.service.js';
import fs from 'fs/promises';
import sharp from 'sharp';

jest.mock('sharp');

describe('OCRService - extractTextFromImage', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('successful extraction with region OCR', async () => {
    jest.spyOn(OCR, 'initialize').mockImplementation(async () => { OCR.worker = { recognize: async (p) => ({ data: { text: p.includes('region') ? 'REGIONTEXT' : 'FULLTEXT', confidence: 90, words: [{ text: 'w' }] } }) }; });
    jest.spyOn(OCR, 'preprocessImage').mockResolvedValue('file_ocr_enhanced.jpg');

    const metadataMap = {
      'file_ocr_enhanced.jpg': { width: 1000, height: 800 }
    };

    sharp.mockImplementation((p) => ({
      metadata: async () => metadataMap[p] || { width: 1000, height: 800 },
      extract: () => ({ toFile: async () => Promise.resolve() }),
      toFile: async () => Promise.resolve(),
    }));

    jest.spyOn(fs, 'unlink').mockImplementation(() => Promise.resolve());

    const res = await OCR.extractTextFromImage('input.jpg', false);
    expect(res.text).toContain('FULLTEXT');
    expect(res.text).toContain('REGIONTEXT');
    expect(res.confidence).toBe(90);
    expect(res.digitSequences).toEqual([]);
  });

  test('region extraction failure is handled gracefully', async () => {
    jest.spyOn(OCR, 'initialize').mockImplementation(async () => { OCR.worker = { recognize: async () => ({ data: { text: 'FULL', confidence: 80 } }) }; });
    jest.spyOn(OCR, 'preprocessImage').mockResolvedValue('file_ocr_enhanced.jpg');

    // First metadata ok, then throw when extracting region
    sharp.mockImplementation((p) => ({
      metadata: async () => ({ width: 1000, height: 800 }),
      extract: () => ({ toFile: async () => { throw new Error('extract fail'); } }),
      toFile: async () => Promise.resolve(),
    }));

    const res = await OCR.extractTextFromImage('input.jpg', true);
    expect(res.text).toContain('FULL');
    expect(res.digitSequences).toEqual([]);
  });

  test('worker recognition failure returns empty object', async () => {
    jest.spyOn(OCR, 'initialize').mockImplementation(async () => { OCR.worker = { recognize: async () => { throw new Error('ocr fail'); } }; });
    jest.spyOn(OCR, 'preprocessImage').mockResolvedValue('file_ocr_enhanced.jpg');
    sharp.mockImplementation(() => ({ metadata: async () => ({ width: 500, height: 400 }), toFile: async () => Promise.resolve() }));

    const res = await OCR.extractTextFromImage('x.jpg', false);
    expect(res.text).toBe('');
    expect(res.confidence).toBe(0);
  });
});
