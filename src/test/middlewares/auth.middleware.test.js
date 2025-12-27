import jwt from 'jsonwebtoken';
import * as auth from '../../core/middlewares/auth.middleware.js';
import User from '../../models/User.js';

describe('auth middleware', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('authenticate sets req.user when token valid and user found', async () => {
    const user = { _id: 'id1', email: 'u@example.com', role: 'client', isBanned: false, isActive: true, adminRole: null, name: 'User' };
    jest.spyOn(User, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue(user) }));
    const token = jwt.sign({ id: 'id1', email: 'u@example.com', role: 'client' }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` }, cookies: {} };
    const next = jest.fn();

    await auth.authenticate(req, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();
    expect(req.user.role).toBe('client');
  });

  it('authenticate fallback uses decoded token when DB closed', async () => {
    const token = jwt.sign({ id: 'id2', email: 'b@example.com', role: 'freelancer' }, process.env.JWT_SECRET);
    jest.spyOn(User, 'findById').mockImplementation(() => { throw new Error('closed connection pool'); });
    const req = { headers: { authorization: `Bearer ${token}` }, cookies: {} };
    const next = jest.fn();

    await auth.authenticate(req, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();
    expect(req.user.role).toBe('freelancer');
  });

  it('authorize denies access when role mismatch', () => {
    const mw = auth.authorize('client');
    const req = { user: { role: 'freelancer' } };
    const next = jest.fn();
    mw(req, {}, next);
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.message).toMatch(/Access denied/);
  });

  it('authorize allows access when role matches', () => {
    const mw = auth.authorize('freelancer');
    const req = { user: { role: 'freelancer' } };
    const next = jest.fn();
    mw(req, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('authenticate throws when no token provided', async () => {
    const req = { headers: {}, cookies: {} };
    const next = jest.fn();

    await auth.authenticate(req, {}, next);
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.message).toMatch(/Authentication required/);
    expect(err.statusCode).toBe(401);
  });

  it('authenticate handles invalid token error', async () => {
    jest.spyOn(jwt, 'verify').mockImplementation(() => { const e = new Error('invalid'); e.name = 'JsonWebTokenError'; throw e; });
    const req = { headers: { authorization: 'Bearer badtoken' }, cookies: {} };
    const next = jest.fn();

    await auth.authenticate(req, {}, next);
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.message).toMatch(/Invalid token/);
    expect(err.statusCode).toBe(401);
  });

  it('authenticate handles expired token error', async () => {
    jest.spyOn(jwt, 'verify').mockImplementation(() => { const e = new Error('expired'); e.name = 'TokenExpiredError'; throw e; });
    const req = { headers: { authorization: 'Bearer expired' }, cookies: {} };
    const next = jest.fn();

    await auth.authenticate(req, {}, next);
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.message).toMatch(/expired/);
    expect(err.statusCode).toBe(401);
  });

  it('authenticate throws when user not found', async () => {
    jest.spyOn(User, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue(null) }));
    const token = jwt.sign({ id: 'id3', email: 'no@example.com', role: 'client' }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` }, cookies: {} };
    const next = jest.fn();

    await auth.authenticate(req, {}, next);
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.message).toMatch(/User no longer exists/);
    expect(err.statusCode).toBe(401);
  });

  it('authenticate rejects banned or suspended users', async () => {
    const bannedUser = { _id: 'b', email: 'b@x.com', role: 'client', isBanned: true, isActive: true, adminRole: null, name: 'B' };
    jest.spyOn(User, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue(bannedUser) }));
    const t1 = jwt.sign({ id: 'b', email: 'b@x.com', role: 'client' }, process.env.JWT_SECRET);
    const req1 = { headers: { authorization: `Bearer ${t1}` }, cookies: {} };
    const next1 = jest.fn();
    await auth.authenticate(req1, {}, next1);
    const e1 = next1.mock.calls[0][0];
    expect(e1.message).toMatch(/banned/);
    expect(e1.statusCode).toBe(403);

    const suspendedUser = { _id: 's', email: 's@x.com', role: 'client', isBanned: false, isActive: false, adminRole: null, name: 'S' };
    jest.spyOn(User, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue(suspendedUser) }));
    const t2 = jwt.sign({ id: 's', email: 's@x.com', role: 'client' }, process.env.JWT_SECRET);
    const req2 = { headers: { authorization: `Bearer ${t2}` }, cookies: {} };
    const next2 = jest.fn();
    await auth.authenticate(req2, {}, next2);
    const e2 = next2.mock.calls[0][0];
    expect(e2.message).toMatch(/suspended/);
    expect(e2.statusCode).toBe(403);
  });

  it('authorizeAdmin enforces admin role and adminRole presence', () => {
    const reqNoUser = {};
    const next1 = jest.fn();
    auth.authorizeAdmin(reqNoUser, {}, next1);
    const err1 = next1.mock.calls[0][0];
    expect(err1.message).toMatch(/Authentication required/);
    expect(err1.statusCode).toBe(401);

    const reqNotAdmin = { user: { role: 'client' } };
    const next2 = jest.fn();
    auth.authorizeAdmin(reqNotAdmin, {}, next2);
    const err2 = next2.mock.calls[0][0];
    expect(err2.message).toMatch(/Admin access required/);
    expect(err2.statusCode).toBe(403);

    const reqAdminNoRole = { user: { role: 'admin', adminRole: null } };
    const next3 = jest.fn();
    auth.authorizeAdmin(reqAdminNoRole, {}, next3);
    const err3 = next3.mock.calls[0][0];
    expect(err3.message).toMatch(/Admin access required/);
    expect(err3.statusCode).toBe(403);

    const reqGood = { user: { role: 'admin', adminRole: 'admin' } };
    const next4 = jest.fn();
    auth.authorizeAdmin(reqGood, {}, next4);
    expect(next4).toHaveBeenCalledWith();
  });
});