import {
  validateRegister,
  validateLogin,
  validateFreelancerProfile,
  validateClientProfile,
  validateRoleSelection,
  validateChangePassword,
  validateEmail,
  validateRequestPasswordReset,
  validateVerifyOTP,
  validateResetPassword,
  validateSubmitCNIC,
  validateVerifyCNIC,
} from '../../../modules/auth/auth.validation.js';

describe('Auth validation middlewares', () => {
  const next = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('validateRegister rejects invalid payload and attaches validated data for valid', () => {
    const mw = validateRegister;
    const req1 = { body: { name: 'a', email: 'x', password: '123' } };
    const res1 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next1 = jest.fn();
    mw(req1, res1, next1);
    expect(res1.status).toHaveBeenCalledWith(400);
    expect(res1.json).toHaveBeenCalled();

    const req2 = { body: { name: 'User', email: 'u@test.com', password: 'Password1!', confirmPassword: 'Password1!' } };
    const res2 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next2 = jest.fn();
    mw(req2, res2, next2);
    expect(next2).toHaveBeenCalledWith();
    expect(req2.validatedData.email).toBe('u@test.com');
  });

  test('validateLogin rejects invalid and accepts valid', () => {
    const mw = validateLogin;
    const req1 = { body: { email: 'not', password: '' } };
    const res1 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const n1 = jest.fn();
    mw(req1, res1, n1);
    expect(res1.status).toHaveBeenCalledWith(400);
    expect(res1.json).toHaveBeenCalled();

    const req2 = { body: { email: 'u@t.com', password: 'p' } };
    const res2 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const n2 = jest.fn();
    mw(req2, res2, n2);
    expect(n2).toHaveBeenCalledWith();
  });

  test('validateFreelancerProfile and validateClientProfile validate roles', () => {
    const mwF = validateFreelancerProfile;
    const resF = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const n1 = jest.fn();
    mwF({ body: { skills: [], hourlyRate: 1, experience: '' } }, resF, n1);
    expect(resF.status).toHaveBeenCalledWith(400);

    const mwC = validateClientProfile;
    const resC = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const n2 = jest.fn();
    mwC({ body: { companyName: 'ACME', companySize: '11-50', industry: 'Tech' } }, resC, n2);
    expect(n2).toHaveBeenCalledWith();
  });

  test('role, change password, email and OTP/reset validators behave', () => {
    const n = jest.fn();
    // Use res mocks for validators that return responses on errors
    const resErr = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    validateRoleSelection({ body: {} }, resErr, n);
    expect(resErr.status).toHaveBeenCalledWith(400);

    validateChangePassword({ body: { currentPassword: 'a', newPassword: 'weak', confirmNewPassword: 'weak' } }, resErr, n);
    expect(resErr.status).toHaveBeenCalledWith(400);

    validateEmail({ body: { email: 'x' } }, resErr, n);
    expect(resErr.status).toHaveBeenCalledWith(400);

    validateRequestPasswordReset({ body: { email: 'bad' } }, resErr, n);
    expect(resErr.status).toHaveBeenCalledWith(400);

    const resOk = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    validateVerifyOTP({ body: { email: 'a@test.com', otp: '123456' } }, resOk, n);
    expect(n).toHaveBeenCalledWith();

    validateResetPassword({ body: { email: 'a@test.com', otp: '123456', newPassword: 'NewPass1!' } }, resOk, n);
    expect(n).toHaveBeenCalledWith();

    validateSubmitCNIC({ body: { frontImage: 'f', backImage: 'b' } }, resOk, n);
    expect(n).toHaveBeenCalledWith();

    // CNIC submit invalid
    const resC1 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    validateSubmitCNIC({ body: { cnicNumber: 'invalid' } }, resC1, n);
    expect(resC1.status).toHaveBeenCalledWith(400);

    // verify CNIC admin schema
    validateVerifyCNIC({ body: { status: 'verified' } }, resOk, n);
    expect(n).toHaveBeenCalledWith();

    const resC2 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    validateVerifyCNIC({ body: { status: 'rejected' } }, resC2, n);
    expect(resC2.status).toHaveBeenCalledWith(400);
  });
});