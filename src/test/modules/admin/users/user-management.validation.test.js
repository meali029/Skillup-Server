import { validateUserQuery, validateUserAction } from '../../../../modules/admin/users/user-management.validation.js';

describe('user-management.validation', () => {
  test('validateUserAction rejects short reason', () => {
    const mw = validateUserAction;
    const req = { body: { reason: 'short' } };
    const next = jest.fn();

    mw(req, {}, next);
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.message).toMatch(/Validation failed/);
    expect(err.statusCode).toBe(400);
  });

  test('validateUserAction accepts valid reason', () => {
    const mw = validateUserAction;
    const req = { body: { reason: 'This is a valid reason for suspension.' } };
    const next = jest.fn();

    mw(req, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body.reason).toBeDefined();
  });

  test('validateUserQuery strips invalid query params and validates dates and format', () => {
    const mw = validateUserQuery;
    const req = { query: { page: '2', limit: '5', format: 'csv', unknown: 'x', startDate: '2020-01-01', endDate: '2020-02-01' } };
    const next = jest.fn();

    mw(req, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.query.page).toBe(2);
    expect(req.query.format).toBe('csv');
    expect(req.query.unknown).toBeUndefined();
  });
});