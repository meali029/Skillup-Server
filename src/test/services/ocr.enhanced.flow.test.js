import Enhanced from '../../services/ocr.service.enhanced.js';
import fs from 'fs/promises';

describe('EnhancedOCR - flows', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('performMultiPassOCR returns three pass results', async () => {
    jest.spyOn(Enhanced, 'preprocessForNumbers').mockResolvedValue('num.jpg');
    jest.spyOn(Enhanced, 'preprocessForText').mockResolvedValue('text.jpg');
    jest.spyOn(Enhanced, 'preprocessAdaptive').mockResolvedValue('adaptive.jpg');

    const fakeWorker = {
      setParameters: async () => {},
      recognize: async (p) => ({ data: { text: `TEXT:${p}`, confidence: 90 } })
    };

    jest.spyOn(Enhanced, 'getWorker').mockResolvedValue(fakeWorker);
    jest.spyOn(fs, 'unlink').mockImplementation(() => Promise.resolve());

    const res = await Enhanced.performMultiPassOCR('input.jpg', 'numbers');
    expect(res.length).toBe(3);
    expect(res[0].type).toBe('numbers');
    expect(res[1].type).toBe('text');
    expect(res[2].type).toBe('adaptive');
  });

  test('extractCNICData returns success when CNIC found in back results', async () => {
    jest.spyOn(Enhanced, 'extractCNICNumberRegion').mockResolvedValue('back_region.jpg');
    jest.spyOn(Enhanced, 'extractNameRegion').mockResolvedValue('name_region.jpg');
    jest.spyOn(Enhanced, 'performMultiPassOCR').mockImplementation(async (p, t) => {
      if (t === 'numbers') return [{ text: '12345-1234567-1', confidence: 90 }];
      return [{ text: 'Name: John Doe', confidence: 85 }];
    });
    jest.spyOn(Enhanced, 'extractName').mockResolvedValue('John Doe');
    jest.spyOn(Enhanced, 'extractDateOfBirth').mockReturnValue(new Date('1990-01-01'));
    jest.spyOn(fs, 'unlink').mockImplementation(() => Promise.resolve());

    const out = await Enhanced.extractCNICData('front.jpg', 'back.jpg');
    expect(out.success).toBe(true);
    expect(out.extractedCnicNumber).toBe('12345-1234567-1');
    expect(out.extractedName).toBe('John Doe');
  });
});
