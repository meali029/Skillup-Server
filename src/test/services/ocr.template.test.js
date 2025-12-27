import TemplateOCR from '../../services/ocr.service.template.js';

describe('CNICTemplateOCR - parsers', () => {
  test('parseCNICNumber finds formatted', () => {
    const text = 'Some 12345-1234567-1 sample';
    expect(TemplateOCR.parseCNICNumber(text)).toBe('12345-1234567-1');
  });

  test('parseCNICNumber finds digits-only 13-length', () => {
    const text = 'abcdef 6123451234567 gh';
    expect(TemplateOCR.parseCNICNumber(text)).toBe('61234-5123456-7');
  });

  test('parseCNICNumber returns null when no candidate', () => {
    expect(TemplateOCR.parseCNICNumber('no digits')).toBeNull();
  });

  test('extractName cleans and returns multiword names from text', async () => {
    // extractName is async and uses extractRegion + worker; we can stub extractRegion and getWorker
    const stub = jest.spyOn(TemplateOCR, 'extractRegion').mockImplementation(async (p, r) => 'region.jpg');
    const fakeWorker = { setParameters: async () => {}, recognize: async () => ({ data: { text: 'John Doe' } }) };
    jest.spyOn(TemplateOCR, 'getWorker').mockImplementation(async () => fakeWorker);

    // REGIONS is a static property on the class; access via constructor
    const name = await TemplateOCR.extractName('dummy.jpg', TemplateOCR.constructor.REGIONS.NAME);
    expect(name).toBe('John Doe');

    stub.mockRestore();
  });
});
