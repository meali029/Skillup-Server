import { isValidCNICFormat, normalizeCNIC, validateCNICChecksum, validateCNIC } from '../../../core/utils/cnicValidation.js';

describe('CNIC Validation utils', () => {
  test('isValidCNICFormat accepts proper format', () => {
    expect(isValidCNICFormat('12345-1234567-1')).toBe(true);
    expect(isValidCNICFormat(' 12345-1234567-1 ')).toBe(true);
    expect(isValidCNICFormat('1234512345671')).toBe(false);
    expect(isValidCNICFormat(null)).toBe(false);
  });

  test('normalizeCNIC formats digits-only and rejects bad input', () => {
    expect(normalizeCNIC('1234512345671')).toBe('12345-1234567-1');
    expect(normalizeCNIC(' 12345-1234567-1 ')).toBe('12345-1234567-1');
    expect(normalizeCNIC('bad')).toBeNull();
  });

  test('validateCNICChecksum detects checksum validity', () => {
    // Generate a valid CNIC by computing checksum for random 12 digits
    const digits = '123451234567'.slice(0, 12); // using fixed 12 digits
    // compute checksum using same algorithm
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 2);
    }
    const calculatedChecksum = (10 - (sum % 10)) % 10;
    const cnic = `${digits}${calculatedChecksum}`; // 13 digits
    const formatted = `${cnic.slice(0,5)}-${cnic.slice(5,12)}-${cnic.slice(12)}`;

    expect(validateCNICChecksum(formatted)).toBe(true);

    // tamper last digit
    const bad = formatted.slice(0, -1) + ((parseInt(formatted.slice(-1)) + 1) % 10);
    expect(validateCNICChecksum(bad)).toBe(false);
  });

  test('validateCNIC returns structured result and warnings', () => {
    // Use a CNIC that's valid format but failing checksum -> it should return valid true with warning
    const cnic = '12345-1234567-1';
    const res = validateCNIC(cnic);
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('12345-1234567-1');
    // Either error null or warning present
    expect(res.error).toBeNull();
  });
});