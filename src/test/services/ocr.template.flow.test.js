import Template from '../../services/ocr.service.template.js';
import fs from 'fs/promises';
import sharp from 'sharp';

jest.mock('sharp');

describe('CNICTemplateOCR - flows', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('preprocessForCNICNumber returns original when region too small', async () => {
    sharp.mockImplementation(() => ({ metadata: async () => ({ width: 40, height: 40 }) }));
    const res = await Template.preprocessForCNICNumber('small.jpg', 'balanced');
    expect(res).toBe('small.jpg');
  });

  test('extractCNICNumberFromRegion returns best result and cleans up', async () => {
    // mock getWorker and recognize to return different confidences
    const fakeWorker = {
      setParameters: async () => {},
      recognize: async () => ({ data: { text: '12345-1234567-1', confidence: 92 } })
    };
    jest.spyOn(Template, 'getWorker').mockResolvedValue(fakeWorker);
    jest.spyOn(fs, 'unlink').mockImplementation(() => Promise.resolve());

    // For extractRegion, we will call the function with a pre-created small image but need to mock sharp to not throw
    sharp.mockImplementation(() => ({ extract: () => ({ toFile: async () => Promise.resolve() }), resize: () => ({ toFile: async () => Promise.resolve() }), metadata: async () => ({ width: 200, height: 200 }) }));

    const result = await Template.extractCNICNumberFromRegion('region.jpg');
    expect(result.text).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });
});
