import { successResponse, errorResponse, paginatedResponse } from '../../../core/utils/responseFormatter.js';

describe('Response formatter', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  test('successResponse sets status and payload', () => {
    const res = mockRes();
    successResponse(res, { a: 1 }, 'ok', 201);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { a: 1 }, message: 'ok' }));
  });

  test('errorResponse includes errors only when provided', () => {
    const res = mockRes();
    errorResponse(res, 'bad', 422, { field: 'x' });
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: 'bad', errors: { field: 'x' } }));

    const res2 = mockRes();
    errorResponse(res2);
    expect(res2.status).toHaveBeenCalledWith(400);
  });

  test('paginatedResponse returns pagination metadata', () => {
    const res = mockRes();
    paginatedResponse(res, [{}, {}], 2, 2, 5);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ pagination: expect.objectContaining({ page: 2, limit: 2, total: 5, totalPages: 3 }) }));
  });
});