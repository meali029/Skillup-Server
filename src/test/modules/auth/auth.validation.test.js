import { registerSchema, loginSchema, selectRoleSchema, changePasswordSchema, updateFreelancerProfileSchema, updateClientProfileSchema } from '../../../modules/auth/auth.validation.js';

describe('Auth validation schemas', () => {
  test('registerSchema rejects invalid name/email/password', () => {
    const { error } = registerSchema.validate({ name: 'a', email: 'bad', password: '123' }, { abortEarly: false });
    expect(error).toBeDefined();
    expect(error.details.length).toBeGreaterThanOrEqual(1);
  });

  test('registerSchema accepts valid payload and client fields', () => {
    const { error, value } = registerSchema.validate({ name: 'User', email: 'u@test.com', password: 'Password1!', confirmPassword: 'Password1!', role: 'client', companyName: 'Co', companySize: '1-10', industry: 'Tech' });
    expect(error).toBeUndefined();
    expect(value.email).toBe('u@test.com');
  });

  test('loginSchema validates', () => {
    const { error } = loginSchema.validate({ email: 'invalid', password: '' }, { abortEarly: false });
    expect(error).toBeDefined();
  });

  test('selectRoleSchema requires role', () => {
    const { error } = selectRoleSchema.validate({});
    expect(error).toBeDefined();
    const { error: ok } = selectRoleSchema.validate({ role: 'client' });
    expect(ok).toBeUndefined();
  });

  test('changePasswordSchema checks password complexity and confirmation', () => {
    const { error } = changePasswordSchema.validate({ currentPassword: '', newPassword: 'weak', confirmNewPassword: 'weak' }, { abortEarly: false });
    expect(error).toBeDefined();

    const good = { currentPassword: 'OldPass1!', newPassword: 'NewPass1!', confirmNewPassword: 'NewPass1!' };
    const { error: ok } = changePasswordSchema.validate(good);
    expect(ok).toBeUndefined();
  });

  test('updateFreelancerProfileSchema validates portfolio and skills and avatar', () => {
    const bad = { skills: [], portfolio: [{ title: '', url: 'not-a-url' }], avatar: 'not-a-url', hourlyRate: 1 };
    const { error } = updateFreelancerProfileSchema.validate(bad, { abortEarly: false });
    expect(error).toBeDefined();

    const good = {
      name: 'Freelancer',
      skills: ['JS'],
      portfolio: [{ title: 'Portfolio', description: 'D', url: 'http://example.com', image: 'http://img.com/image.jpg' }],
      avatar: 'http://avatar',
      hourlyRate: 10
    };
    const { error: ok } = updateFreelancerProfileSchema.validate(good);
    expect(ok).toBeUndefined();
  });

  test('updateClientProfileSchema validates client fields and avatar', () => {
    const bad = { companyName: 'a', companySize: 'unknown', industry: 'a', avatar: 'not' };
    const { error } = updateClientProfileSchema.validate(bad, { abortEarly: false });
    expect(error).toBeDefined();

    const good = { companyName: 'ACME', companySize: '11-50', industry: 'Tech', avatar: 'http://avatar' };
    const { error: ok } = updateClientProfileSchema.validate(good);
    expect(ok).toBeUndefined();
  });
});