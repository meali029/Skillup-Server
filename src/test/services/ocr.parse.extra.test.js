import OCR from '../../services/ocr.service.js';

describe('OCRService - parseCNICNumber extra cases', () => {
  test('method2b: combine adjacent long sequences to find CNIC', () => {
    const text = 'no direct cnic here';
    const seqs = ['1234512345', '1234567'];
    const found = OCR.parseCNICNumber(text, seqs);
    expect(found).toMatch(/^12345-\d{7}-\d$/);
  });

  test('method4: finds CNIC near keyword patterns', () => {
    const text = 'Identity No: 51234 5123456 1 something';
    const found = OCR.parseCNICNumber(text);
    expect(found).toBeTruthy();
    expect(found).toMatch(/\d{5}-\d{7}-\d/);
  });
});