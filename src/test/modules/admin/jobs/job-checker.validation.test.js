import * as v from '../../../../modules/admin/jobs/job-checker.validation.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('job-checker.validation', () => {
  test('getJobs passes with defaults', () => {
    const req = { query: {} };
    const res = mockRes();
    const next = jest.fn();

    v.getJobs(req, res, next);
    expect(req.validatedData.page).toBe(1);
    expect(next).toHaveBeenCalled();
  });

  test('getJobs fails with invalid sortOrder', () => {
    const req = { query: { sortOrder: 'bad' } };
    const res = mockRes();
    const next = jest.fn();

    v.getJobs(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  test('getJobById validates id format', () => {
    const req = { params: { id: '123' } };
    const res = mockRes();
    const next = jest.fn();

    v.getJobById(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('jobAction validates id and calls next when ok', () => {
    const req = { params: { id: '0123456789abcdef01234567' } };
    const res = mockRes();
    const next = jest.fn();

    v.jobAction(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.validatedData.id).toBe('0123456789abcdef01234567');
  });

  test('rejectJob validates params and body', () => {
    const req1 = { params: { id: '123' }, body: { reason: 'short' } };
    const res1 = mockRes();
    const next1 = jest.fn();
    v.rejectJob(req1, res1, next1);
    expect(res1.status).toHaveBeenCalledWith(400);

    const req2 = { params: { id: '0123456789abcdef01234567' }, body: { reason: 'This is a sufficiently long reason' } };
    const res2 = mockRes();
    const next2 = jest.fn();
    v.rejectJob(req2, res2, next2);
    expect(next2).toHaveBeenCalled();
  });

  test('flagJob validates params and body', () => {
    const req1 = { params: { id: 'x' }, body: { reason: 'short', flagType: 'spam' } };
    const res1 = mockRes();
    const next1 = jest.fn();
    v.flagJob(req1, res1, next1);
    expect(res1.status).toHaveBeenCalledWith(400);

    const req2 = { params: { id: '0123456789abcdef01234567' }, body: { reason: 'Long enough reason', flagType: 'spam' } };
    const res2 = mockRes();
    const next2 = jest.fn();
    v.flagJob(req2, res2, next2);
    expect(next2).toHaveBeenCalled();
  });
});