import EnhancedOCR from '../../services/ocr.service.enhanced.js';

describe('EnhancedOCR - parsing helpers', () => {
  test('parseCNICNumber finds formatted result from multi-pass outputs', () => {
    const res = [
      { type: 'numbers', text: 'random 12345-1234567-1 text', confidence: 80 },
      { type: 'text', text: 'Name: A B', confidence: 80 }
    ];
    const found = EnhancedOCR.parseCNICNumber(res);
    expect(found).toBe('12345-1234567-1');
  });

  test('parseCNICNumber finds 13 consecutive digits', () => {
    const res = [{ text: 'blah 6123451234567 blah' }];
    const found = EnhancedOCR.parseCNICNumber(res);
    expect(found).toBe('61234-5123456-7');
  });

  test('parseCNICNumber returns null if none', () => {
    const res = [{ text: 'no digits here' }];
    const found = EnhancedOCR.parseCNICNumber(res);
    expect(found).toBeNull();
  });

  test('extractName extracts capitalized name lines (keyword on same line)', () => {
    const text = 'Some header\nName: John Doe\nOther';
    const name = EnhancedOCR.extractName(text, 'Name');
    // function preserves the keyword if present on same line
    expect(name).toBe('Name John Doe');
  });

  test('extractName finds name on next line after keyword', () => {
    const text = 'Header\nName\nJane Smith\nOther';
    const name = EnhancedOCR.extractName(text, 'Name');
    expect(name).toBe('Jane Smith');
  });

  test('extractDateOfBirth parses DD-MM-YYYY', () => {
    const text = 'DOB: 01-12-1995';
    const d = EnhancedOCR.extractDateOfBirth(text);
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(1995);
  });
});
