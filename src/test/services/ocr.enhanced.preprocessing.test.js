import Enhanced from '../../services/ocr.service.enhanced.js';
import sharp from 'sharp';

jest.mock('sharp');

function fluentMock(meta = { width: 2000, height: 1500 }) {
  const obj = {
    metadata: async () => meta,
    resize: () => obj,
    greyscale: () => obj,
    normalise: () => obj,
    normalize: () => obj,
    clahe: () => obj,
    linear: () => obj,
    sharpen: () => obj,
    gamma: () => obj,
    threshold: () => obj,
    negate: () => obj,
    blur: () => obj,
    modulate: () => obj,
    toFile: async () => Promise.resolve(),
    extract: () => ({ toFile: async () => Promise.resolve() })
  };
  return obj;
}

describe('EnhancedOCR - preprocessing helpers', () => {
  beforeEach(() => jest.resetAllMocks());

  test('preprocessForNumbers returns output path', async () => {
    sharp.mockImplementation(() => fluentMock({ width: 2000, height: 1000 }));
    const out = await Enhanced.preprocessForNumbers('in.jpg');
    expect(out).toMatch(/_numbers\.jpg$/);
  });

  test('preprocessForText returns output path', async () => {
    sharp.mockImplementation(() => fluentMock({ width: 2000, height: 1000 }));
    const out = await Enhanced.preprocessForText('in.jpg');
    expect(out).toMatch(/_text\.jpg$/);
  });

  test('preprocessAdaptive returns output path and handles metadata', async () => {
    sharp.mockImplementation(() => fluentMock({ width: 1500, height: 1000 }));
    const out = await Enhanced.preprocessAdaptive('in.jpg');
    expect(out).toMatch(/_adaptive\.jpg$/);
  });

  test('extractCNICNumberRegion returns _cnic_region path', async () => {
    sharp.mockImplementation(() => fluentMock({ width: 1200, height: 800 }));
    const out = await Enhanced.extractCNICNumberRegion('in.jpg', false);
    expect(out).toMatch(/_cnic_region\.jpg$/);
  });

  test('performMultiPassOCR handles worker errors gracefully', async () => {
    jest.spyOn(Enhanced, 'preprocessForNumbers').mockResolvedValue('n.jpg');
    jest.spyOn(Enhanced, 'preprocessForText').mockResolvedValue('t.jpg');
    jest.spyOn(Enhanced, 'preprocessAdaptive').mockResolvedValue('a.jpg');

    const badWorker = { setParameters: async () => {}, recognize: async () => { throw new Error('fail') } };
    jest.spyOn(Enhanced, 'getWorker').mockResolvedValue(badWorker);

    const res = await Enhanced.performMultiPassOCR('in.jpg');
    expect(Array.isArray(res)).toBe(true);
  });
});