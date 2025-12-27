import Template from '../../services/ocr.service.template.js';
import sharp from 'sharp';

jest.mock('sharp');

function fluent(meta = { width: 200, height: 200 }) {
  const obj = {
    metadata: async () => meta,
    resize: () => obj,
    greyscale: () => obj,
    normalize: () => obj,
    linear: () => obj,
    threshold: () => obj,
    negate: () => obj,
    sharpen: () => obj,
    toFile: async () => Promise.resolve(),
    extract: () => ({ toFile: async () => Promise.resolve() })
  };
  return obj;
}

describe('CNICTemplateOCR - extra flows', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('preprocessForCNICNumber strategies return different suffixes', async () => {
    sharp.mockImplementation(() => fluent({ width: 200, height: 200 }));

    const r1 = await Template.preprocessForCNICNumber('img.jpg', 'high_contrast');
    expect(r1).toMatch(/_high_contrast\.jpg$/);

    const r2 = await Template.preprocessForCNICNumber('img.jpg', 'clean');
    expect(r2).toMatch(/_clean\.jpg$/);
  });

  test('extractCNICNumberFromRegion returns fallback object on all recognize errors', async () => {
    const badWorker = { setParameters: async () => {}, recognize: async () => { throw new Error('fail') } };
    jest.spyOn(Template, 'getWorker').mockResolvedValue(badWorker);
    sharp.mockImplementation(() => fluent({ width: 200, height: 200 }));

    const res = await Template.extractCNICNumberFromRegion('region.jpg');
    expect(res).toMatchObject({ text: '', confidence: 0 });
  });

  test('extractName returns null on worker errors', async () => {
    jest.spyOn(Template, 'extractRegion').mockResolvedValue('r.jpg');
    const badWorker = { setParameters: async () => {}, recognize: async () => { throw new Error('fail') } };
    jest.spyOn(Template, 'getWorker').mockResolvedValue(badWorker);

    const name = await Template.extractName('a.jpg', Template.constructor.REGIONS.NAME);
    expect(name).toBeNull();
  });
});