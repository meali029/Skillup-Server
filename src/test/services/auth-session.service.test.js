import jwt from 'jsonwebtoken';
import UserSession from '../../models/UserSession.js';
import {
  createSessionBackedToken,
  hashToken,
  parseDevice,
  resolveLocation,
  validateSession,
} from '../../modules/auth/auth-session.service.js';

jest.mock('../../models/UserSession.js', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  },
}));

jest.mock('../../models/User.js', () => ({
  __esModule: true,
  default: {},
}));

describe('auth-session.service', () => {
  const previousJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.JWT_SECRET = 'abcdefghijklmnopqrstuvwxyz1234567890';
    process.env.JWT_EXPIRES_IN = '7d';
  });

  afterAll(() => {
    process.env.JWT_SECRET = previousJwtSecret;
  });

  test('creates a session-backed token and stores only the token hash', async () => {
    UserSession.create.mockImplementation(async (payload) => payload);

    const req = {
      ip: '127.0.0.1',
      headers: {},
      get: jest.fn().mockReturnValue(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36'
      ),
    };
    const user = {
      _id: '64f000000000000000000001',
      email: 'admin@example.com',
      role: 'admin',
      adminRole: 'super_admin',
    };

    const { token, session } = await createSessionBackedToken(user, req);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    expect(decoded.sid).toBeTruthy();
    expect(session.sessionId).toBe(decoded.sid);
    expect(session.tokenHash).toHaveLength(64);
    expect(session.tokenHash).toBe(hashToken(token));
    expect(session.tokenHash).not.toBe(token);
    expect(session.device.displayName).toContain('Chrome');
    expect(session.location.source).toBe('local');
  });

  test('parses readable device and local-network location labels', () => {
    const device = parseDevice(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/122.0.0.0'
    );
    const location = resolveLocation('192.168.1.10');

    expect(device.displayName).toBeTruthy();
    expect(device.type).toBe('desktop');
    expect(location.city).toBe('Local network');
    expect(location.source).toBe('local');
  });

  test('rejects expired active sessions and marks them expired', async () => {
    const expiredSession = {
      _id: 'session-db-id',
      expiresAt: new Date(Date.now() - 1000),
    };
    UserSession.findOne.mockResolvedValue(expiredSession);
    UserSession.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const session = await validateSession({
      userId: '64f000000000000000000001',
      sessionId: 'sid-1',
      token: 'token-value',
    });

    expect(session).toBeNull();
    expect(UserSession.updateOne).toHaveBeenCalledWith(
      { _id: expiredSession._id, status: 'active' },
      { $set: { status: 'expired' } }
    );
  });
});
