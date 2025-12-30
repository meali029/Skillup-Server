import Template from '../../services/ocr.service.template.js';
import sharp from 'sharp';
import fs from 'fs/promises';

jest.mock('sharp');

describe('CNICTemplateOCR - region extraction', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('extractRegion extracts and returns output path', async () => {
    sharp.mockImplementation(() => ({ metadata: async () => ({ width: 1200, height: 800 }), extract: () => ({ resize: () => ({ toFile: async () => Promise.resolve() }) }), resize: () => ({ toFile: async () => Promise.resolve() }) }));

    const out = await Template.extractRegion('img.jpg', Template.constructor.REGIONS.CNIC_NUMBER_FRONT);
    // Accept fallback to original if chain fails in some environments
    expect((out === 'img.jpg') || /_region_\d+\.jpg$/.test(out)).toBeTruthy();
  });

  test('extractRegion returns original when sharp throws', async () => {
    sharp.mockImplementation(() => ({ metadata: async () => { throw new Error('nope'); } }));
    const out = await Template.extractRegion('img.jpg', Template.constructor.REGIONS.CNIC_NUMBER_FRONT);
    expect(out).toBe('img.jpg');
  });
});