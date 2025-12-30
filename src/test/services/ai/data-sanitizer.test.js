import { describe, it, expect } from '@jest/globals';
import {
  sanitizeUser,
  sanitizeJob,
  sanitizeProposal,
  removeSensitiveFields,
  validateSanitizedData,
} from '../../../services/ai/data-sanitizer.js';

describe('AI Data Sanitizer', () => {
  it('sanitizeUser returns only safe fields and removes sensitive data', () => {
    const user = {
      name: 'Jane',
      role: 'freelancer',
      email: 'jane@example.com',
      password: 'secret',
      portfolio: [{ title: 'Proj', description: 'desc', url: 'http://example.com' }],
      skills: ['node', 'react'],
      hourlyRate: 20,
    };

    const s = sanitizeUser(user);
    expect(s.email).toBeUndefined();
    expect(s.password).toBeUndefined();
    expect(s.skills).toBeDefined();
    expect(s.portfolio[0].title).toBe('Proj');
    expect(s.portfolio[0].description).toBe('desc');
    expect(s.portfolio[0].url).toBeUndefined();
  });

  it('sanitizeJob keeps safe job fields and populates client summary when provided', () => {
    const job = {
      title: 'Build API',
      description: 'Detailed description',
      category: 'web-development',
      client: { name: 'Acme', companyName: 'Acme Inc', email: 'a@acme.com' },
    };

    const s = sanitizeJob(job);
    expect(s.title).toBe('Build API');
    expect(s.client).toBeDefined();
    expect(s.client.name).toBe('Acme');
    expect(s.client.companyName).toBe('Acme Inc');
    expect(s.client.email).toBeUndefined();
  });

  it('sanitizeProposal returns minimal fields', () => {
    const p = { coverLetter: 'Hello', bidAmount: 1000, deliveryTime: 5, freelancerId: 'x' };
    const s = sanitizeProposal(p);
    expect(s.coverLetter).toBe('Hello');
    expect(s.freelancerId).toBeUndefined();
  });

  it('removeSensitiveFields removes CNIC and email patterns recursively', () => {
    const obj = { name: 'A', cnic: '12345-1234567-1', nested: { email: 'x@x.com' } };
    const cleaned = removeSensitiveFields(obj);
    expect(cleaned.cnic).toBeUndefined();
    expect(cleaned.nested.email).toBeUndefined();
  });

  it('validateSanitizedData returns false if CNIC or email present', () => {
    const bad = { text: 'User CNIC 12345-1234567-1' };
    expect(validateSanitizedData(bad)).toBe(false);

    const good = { text: 'Just normal text' };
    expect(validateSanitizedData(good)).toBe(true);
  });
});