import Template from '../../services/ocr.service.template.js';
import fs from 'fs/promises';

jest.mock('sharp');

describe('CNICTemplateOCR - extractCNICData flows', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('back side template success sets method and boosts confidence', async () => {
    jest.spyOn(Template, 'extractCNICNumberFromRegion').mockResolvedValueOnce({ text: '12345-1234567-1', confidence: 90 });
    // ensure name extraction is called but optional
    jest.spyOn(Template, 'extractName').mockResolvedValue('Alice Bob');
    jest.spyOn(fs, 'unlink').mockImplementation(() => Promise.resolve());

    const res = await Template.extractCNICData('front.jpg', 'back.jpg');
    expect(res.success).toBe(true);
    expect(res.extractedCnicNumber).toBe('12345-1234567-1');
    expect(res.extractionMethod).toBe('back_side_template');
    expect(res.extractedName).toBe('Alice Bob');
    expect(res.confidence).toBeGreaterThan(0);
  });

  test('front side fallback works when back missing', async () => {
    jest.spyOn(Template, 'extractCNICNumberFromRegion').mockResolvedValueOnce({ text: '', confidence: 0 })
      .mockResolvedValueOnce({ text: '12345-1234567-1', confidence: 88 });
    jest.spyOn(fs, 'unlink').mockImplementation(() => Promise.resolve());

    const res = await Template.extractCNICData('front.jpg', 'back.jpg');
    expect(res.success).toBe(true);
    expect(res.extractionMethod).toBe('front_side_template');
  });

  test('fallback full back and full front strategies', async () => {
    // back empty, front empty, full back returns
    jest.spyOn(Template, 'extractCNICNumberFromRegion')
      .mockResolvedValueOnce({ text: '', confidence: 0 }) // back
      .mockResolvedValueOnce({ text: '', confidence: 0 }) // front
      .mockResolvedValueOnce({ text: '12345-1234567-1', confidence: 70 }); // full back

    jest.spyOn(fs, 'unlink').mockImplementation(() => Promise.resolve());

    const res = await Template.extractCNICData('front.jpg', 'back.jpg');
    expect(res.success).toBe(true);
    expect(res.extractionMethod).toBe('full_back_image');
  });

  test('returns failure object when all strategies fail', async () => {
    jest.spyOn(Template, 'extractCNICNumberFromRegion').mockResolvedValue({ text: '', confidence: 0 });

    const res = await Template.extractCNICData('front.jpg', 'back.jpg');
    expect(res.success).toBe(false);
  });
});