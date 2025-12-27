import { describe, it, expect } from '@jest/globals';
import OCR from '../../services/ocr.service.js';

describe('OCR Service (unit)', () => {
  it('parseCNICNumber should find formatted CNIC in free text', () => {
    const text = 'Some text before 1234512345671 some text after';
    const found = OCR.parseCNICNumber(text);
    expect(found).toBe('12345-1234567-1');
  });

  it('parseCNICNumber should return null when no valid CNIC', () => {
    const text = 'no digits here or just short 1234';
    const found = OCR.parseCNICNumber(text);
    expect(found).toBeNull();
  });

  it('parseCNICNumber should use digitSequences fallback', () => {
    const text = 'random numbers';
    const seqs = ['11111', '2345671'];
    const result = OCR.parseCNICNumber(text, ['1234512345671']);
    expect(result).toBe('12345-1234567-1');
  });

  it('parseDateOfBirth finds DD/MM/YYYY formats and validates year bounds', () => {
    const t1 = 'DOB: 15/08/1990';
    const d1 = OCR.parseDateOfBirth(t1);
    expect(d1).toBeInstanceOf(Date);
    expect(d1.getFullYear()).toBe(1990);

    const t2 = 'Some date 01-01-1940';
    const d2 = OCR.parseDateOfBirth(t2);
    expect(d2).toBeNull();
  });

  it('extractName picks up name after keyword or on next line', () => {
    const t1 = 'Name: John Doe\nFather Name: Random';
    expect(OCR.extractName(t1, 'Name')).toMatch(/^John Doe/);

    const t2 = 'Name\nJane Smith\nOther';
    expect(OCR.extractName(t2, 'Name')).toMatch(/^Jane Smith/);
  });

  it('cleanNameText removes unwanted tokens and characters', () => {
    const raw = "Name: Muhammad Ali 123";
    expect(OCR.cleanNameText(raw)).toBe('');

    const raw2 = ' John   Doe! ';
    expect(OCR.cleanNameText(raw2)).toBe('John Doe');
  });

  it('getEmptyResult returns structured empty object with error', () => {
    const empty = OCR.getEmptyResult('test error');
    expect(empty).toMatchObject({ cnicNumber: null, name: null, fatherName: null, confidence: 0 });
    expect(empty.error).toBe('test error');
  });
});