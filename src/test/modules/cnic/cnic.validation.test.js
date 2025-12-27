import { validateApproveCNIC, validateReason } from '../../../modules/cnic/cnic.validation.js';

const makeReq = (body) => ({ body });
const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('CNIC validation middlewares', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('validateApproveCNIC returns errors for invalid body', () => {
    const req = makeReq({ number: 'bad', fullName: 'a', dateOfBirth: '3000-01-01' });
    const res = makeRes();
    const next = jest.fn();

    validateApproveCNIC(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, errors: expect.any(Array) }));
    expect(next).not.toHaveBeenCalled();
  });

  test('validateApproveCNIC passes on valid body', () => {
    const req = makeReq({ number: '12345-1234567-1', fullName: 'Valid Name', dateOfBirth: '1990-01-01', issueDate: '2020-01-01', expiryDate: '2099-01-01' });
    const res = makeRes();
    const next = jest.fn();

    validateApproveCNIC(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedData).toBeDefined();
  });

  test('validateReason rejects short reason and accepts valid', () => {
    const reqBad = makeReq({ reason: 'short' });
    const resBad = makeRes();
    const next = jest.fn();

    validateReason(reqBad, resBad, next);
    expect(resBad.status).toHaveBeenCalledWith(400);

    const reqOk = makeReq({ reason: 'This is a valid explanatory reason' });
    const resOk = makeRes();
    const nextOk = jest.fn();
    validateReason(reqOk, resOk, nextOk);
    expect(nextOk).toHaveBeenCalled();
    expect(reqOk.validatedData).toBeDefined();
  });
});