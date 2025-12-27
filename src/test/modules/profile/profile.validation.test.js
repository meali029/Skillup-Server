import { validateProfileUpdate, validatePortfolioItem, updateProfileSchema, portfolioItemSchema } from '../../../modules/profile/profile.validation.js';

describe('Profile validation', () => {
  test('validateProfileUpdate passes valid data and sets req.validatedData', () => {
    const req = { body: { name: 'John Doe', hourlyRate: 20, skills: ['js'] } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    validateProfileUpdate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedData).toHaveProperty('name', 'John Doe');
  });

  test('validateProfileUpdate returns errors for invalid data', () => {
    const req = { body: { name: 'J', hourlyRate: 1, skills: [] } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    validateProfileUpdate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: 'Validation failed' }));
  });

  test('validatePortfolioItem passes valid data', () => {
    const req = { body: { title: 'Portfolio Item', url: 'https://example.com' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    validatePortfolioItem(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedData).toHaveProperty('title', 'Portfolio Item');
  });

  test('validatePortfolioItem returns errors for missing title', () => {
    const req = { body: { url: 'not-a-url' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    validatePortfolioItem(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
