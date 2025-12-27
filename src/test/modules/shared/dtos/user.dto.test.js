import formatUser, { formatUser as defaultFormatUser, formatUserMinimal } from '../../../../modules/shared/dtos/UserDTO.js';

describe('UserDTO', () => {
  test('returns null for empty input', () => {
    expect(defaultFormatUser(null)).toBeNull();
    expect(formatUserMinimal(null)).toBeNull();
  });

  test('formats admin with adminRole', () => {
    const user = { _id: 'u1', name: 'Admin', email: 'a@x', role: 'admin', avatar: 'av', adminRole: 'super', createdAt: 't' };
    const out = defaultFormatUser(user);
    expect(out.adminRole).toBe('super');
  });

  test('formats freelancer fields correctly and defaults arrays', () => {
    const user = {
      id: 'u2',
      name: 'Freelancer',
      email: 'f@x',
      role: 'freelancer',
      skills: ['js'],
      hourlyRate: 30,
      experience: '5y',
      portfolio: null,
      languages: null,
      availability: 'full',
      website: 'https://x',
      createdAt: 't'
    };

    const out = defaultFormatUser(user);
    expect(out.skills).toEqual(['js']);
    expect(out.portfolio).toEqual([]);
    expect(out.languages).toEqual([]);
    expect(out.website).toBe('https://x');
  });

  test('formats client fields correctly', () => {
    const user = { id: 'u3', name: 'Client', email: 'c@x', role: 'client', companyName: 'C', companySize: 50, industry: 'tech', createdAt: 't' };
    const out = defaultFormatUser(user);
    expect(out.companyName).toBe('C');
    expect(out.companySize).toBe(50);
    expect(out.industry).toBe('tech');
  });

  test('includes CNIC verification fields when present', () => {
    const user = { id: 'u4', name: 'K', email: 'k@x', role: 'freelancer', createdAt: 't', cnicVerificationStatus: 'pending', cnicVerifiedAt: 'v', cnicRejectionReason: 'no', cnicSubmittedAt: 's' };
    const out = defaultFormatUser(user);
    expect(out.cnicVerificationStatus).toBe('pending');
    expect(out.cnicVerifiedAt).toBe('v');
    expect(out.cnicRejectionReason).toBe('no');
    expect(out.cnicSubmittedAt).toBe('s');
  });

  test('formatUserMinimal returns small profile', () => {
    const user = { _id: 'um1', name: 'Mini', email: 'm@x', role: 'freelancer', avatar: 'av' };
    const out = formatUserMinimal(user);
    expect(out).toEqual({ id: 'um1', name: 'Mini', email: 'm@x', role: 'freelancer', avatar: 'av' });
  });
});
