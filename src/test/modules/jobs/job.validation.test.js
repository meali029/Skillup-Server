import { validateCreateJob, validateUpdateJob, validateJobQuery } from '../../../modules/jobs/job.validation.js';

describe('Job validation', () => {
  test('validateCreateJob passes with valid payload', () => {
    const req = {
      body: {
        title: 'Build a website',
        description: 'A'.repeat(60),
        category: 'web-development',
        budgetType: 'fixed',
        budgetAmount: 500,
      }
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    validateCreateJob(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedData.title).toBe('Build a website');
  });

  test('validateCreateJob returns errors for missing required', () => {
    const req = { body: { title: 'Short', description: 'Too short' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    validateCreateJob(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  test('validateUpdateJob requires at least one field', () => {
    const req = { body: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    validateUpdateJob(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('validateJobQuery normalizes and accepts query params', () => {
    const req = { query: { page: '2', limit: '5', minBudget: '100', maxBudget: '200' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    validateJobQuery(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedQuery.page).toBe(2);
    expect(req.validatedQuery.limit).toBe(5);
  });

  test('validateJobQuery returns error when maxBudget < minBudget', () => {
    const req = { query: { minBudget: '500', maxBudget: '100' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    validateJobQuery(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});