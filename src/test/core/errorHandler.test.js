import errorHandler from '../../core/errors/errorHandler.js';
import createAppError from '../../core/errors/AppError.js';

describe('errorHandler', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  it('handles CastError', () => {
    const err = { name: 'CastError', message: 'Cast' };
    const res = mockRes();
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('handles duplicate key error', () => {
    const err = { code: 11000, keyValue: { email: 'x' } };
    const res = mockRes();
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'email already exists' }));
  });

  it('handles ValidationError', () => {
    const err = { name: 'ValidationError', errors: { a: { message: 'errA' }, b: { message: 'errB' } } };
    const res = mockRes();
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('errA') }));
  });

  it('handles JsonWebTokenError and TokenExpiredError', () => {
    const jwtErr = { name: 'JsonWebTokenError', message: 'jwt' };
    const res1 = mockRes();
    errorHandler(jwtErr, {}, res1, jest.fn());
    expect(res1.status).toHaveBeenCalledWith(401);

    const tokenErr = { name: 'TokenExpiredError', message: 'tok' };
    const res2 = mockRes();
    errorHandler(tokenErr, {}, res2, jest.fn());
    expect(res2.status).toHaveBeenCalledWith(401);
  });

  it('defaults to 500 for unknown errors', () => {
    const err = new Error('boom');
    const res = mockRes();
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});