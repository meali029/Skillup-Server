import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import geoip from 'geoip-lite';
import { UAParser } from 'ua-parser-js';
import User from '../../models/User.js';
import UserSession from '../../models/UserSession.js';
import { TokenService } from '../shared/services/index.js';

const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

const getUserId = (user) => user?._id || user?.id;

export const extractTokenFromRequest = (req) => {
  const header = req.headers?.authorization;
  return req.cookies?.token || (header?.startsWith('Bearer ') ? header.slice(7) : null);
};

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const getTokenExpiry = (token) => {
  const decoded = jwt.decode(token);
  if (decoded?.exp) {
    return new Date(decoded.exp * 1000);
  }
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
};

const normalizeIp = (ip) => {
  if (!ip) return null;
  const firstIp = String(ip).split(',')[0].trim();
  if (firstIp.startsWith('::ffff:')) return firstIp.slice(7);
  if (firstIp === '::1') return '127.0.0.1';
  return firstIp;
};

const isPrivateIp = (ip) => {
  if (!ip) return true;
  return (
    ip === '127.0.0.1' ||
    ip === 'localhost' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip.startsWith('100.64.') ||
    ip.startsWith('169.254.') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  );
};

export const getRequestIp = (req) => {
  return normalizeIp(
    req.ip ||
      req.headers?.['x-forwarded-for'] ||
      req.headers?.['x-real-ip'] ||
      req.connection?.remoteAddress
  );
};

export const parseDevice = (userAgent = '') => {
  const parser = new UAParser(userAgent || '');
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();

  const browserName = browser.name || 'Unknown browser';
  const osName = os.name || 'Unknown OS';
  const type = device.type || 'desktop';

  return {
    browser: browser.version ? `${browserName} ${browser.version.split('.')[0]}` : browserName,
    os: os.version ? `${osName} ${os.version.split('.')[0]}` : osName,
    type,
    displayName: `${browserName} (${osName})`,
  };
};

export const resolveLocation = (ipAddress) => {
  if (!ipAddress || isPrivateIp(ipAddress)) {
    return {
      city: 'Local network',
      region: null,
      country: null,
      source: 'local',
    };
  }

  const geo = geoip.lookup(ipAddress);
  if (!geo) {
    return {
      city: 'Unknown',
      region: null,
      country: null,
      source: 'unknown',
    };
  }

  return {
    city: geo.city || null,
    region: Array.isArray(geo.region) ? geo.region.join(', ') : geo.region || null,
    country: geo.country || null,
    source: 'geoip-lite',
  };
};

export const createSessionBackedToken = async (user, req) => {
  const sessionId = crypto.randomUUID();
  const token = TokenService.generateToken(user, { sessionId });
  const ipAddress = getRequestIp(req);
  const userAgent = req.get?.('user-agent') || req.headers?.['user-agent'] || '';

  const session = await UserSession.create({
    userId: getUserId(user),
    sessionId,
    tokenHash: hashToken(token),
    role: user.role || null,
    adminRole: user.adminRole || null,
    device: parseDevice(userAgent),
    ipAddress,
    location: resolveLocation(ipAddress),
    userAgent,
    status: 'active',
    lastSeenAt: new Date(),
    expiresAt: getTokenExpiry(token),
  });

  return { token, session };
};

export const refreshSessionToken = async ({ sessionId, user, token, req }) => {
  if (!sessionId || !token) return null;

  const update = {
    tokenHash: hashToken(token),
    role: user.role || null,
    adminRole: user.adminRole || null,
    expiresAt: getTokenExpiry(token),
    lastSeenAt: new Date(),
  };

  if (req) {
    const ipAddress = getRequestIp(req);
    const userAgent = req.get?.('user-agent') || req.headers?.['user-agent'] || '';
    update.ipAddress = ipAddress;
    update.location = resolveLocation(ipAddress);
    update.userAgent = userAgent;
    update.device = parseDevice(userAgent);
  }

  return UserSession.findOneAndUpdate(
    { sessionId, userId: getUserId(user), status: 'active' },
    { $set: update },
    { new: true }
  );
};

export const validateSession = async ({ userId, sessionId, token }) => {
  if (!sessionId) return null;

  const session = await UserSession.findOne({
    userId,
    sessionId,
    status: 'active',
    tokenHash: hashToken(token),
  });

  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await UserSession.updateOne(
      { _id: session._id, status: 'active' },
      { $set: { status: 'expired' } }
    );
    return null;
  }

  return session;
};

export const touchSession = async (sessionId) => {
  if (!sessionId) return null;

  const cutoff = new Date(Date.now() - LAST_SEEN_THROTTLE_MS);
  return UserSession.updateOne(
    {
      sessionId,
      status: 'active',
      lastSeenAt: { $lte: cutoff },
    },
    { $set: { lastSeenAt: new Date() } }
  );
};

const formatLocation = (location = {}) => {
  const parts = [location.city, location.region, location.country].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Unknown';
};

export const serializeSession = (session, currentSessionId = null) => {
  const data = session.toObject ? session.toObject() : session;
  const user = data.userId && typeof data.userId === 'object' ? data.userId : null;
  const computedStatus =
    data.status === 'active' && data.expiresAt && new Date(data.expiresAt) <= new Date()
      ? 'expired'
      : data.status;

  return {
    id: data._id?.toString(),
    sessionId: data.sessionId,
    user: user
      ? {
          id: user._id?.toString() || user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          adminRole: user.adminRole,
          avatar: user.avatar,
        }
      : undefined,
    role: data.role,
    adminRole: data.adminRole,
    device: data.device || {},
    ipAddress: data.ipAddress,
    location: data.location || {},
    locationLabel: formatLocation(data.location),
    userAgent: data.userAgent,
    status: computedStatus,
    createdAt: data.createdAt,
    lastSeenAt: data.lastSeenAt,
    expiresAt: data.expiresAt,
    revokedAt: data.revokedAt,
    revokedBy: data.revokedBy,
    isCurrent: Boolean(currentSessionId && data.sessionId === currentSessionId),
  };
};

export const listUserSessions = async ({ userId, currentSessionId }) => {
  const sessions = await UserSession.find({ userId })
    .sort({ status: 1, lastSeenAt: -1, createdAt: -1 })
    .limit(50);

  return sessions.map((session) => serializeSession(session, currentSessionId));
};

export const revokeSession = async ({ sessionId, userId, revokedBy }) => {
  const query = { sessionId, status: 'active' };
  if (userId) query.userId = userId;

  return UserSession.findOneAndUpdate(
    query,
    {
      $set: {
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy: revokedBy || userId || null,
      },
    },
    { new: true }
  ).populate('userId', 'name email role adminRole avatar');
};

export const revokeOtherSessions = async ({ userId, currentSessionId, revokedBy }) => {
  const result = await UserSession.updateMany(
    {
      userId,
      status: 'active',
      ...(currentSessionId ? { sessionId: { $ne: currentSessionId } } : {}),
    },
    {
      $set: {
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy: revokedBy || userId,
      },
    }
  );

  return result.modifiedCount || 0;
};

export const listAdminSessions = async ({ status = 'active', page = 1, limit = 20, search = '', currentSessionId }) => {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const adminUserQuery = {
    $or: [{ role: 'admin' }, { role: 'super_admin' }],
  };

  if (search) {
    const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    adminUserQuery.$and = [
      {
        $or: [
          { name: regex },
          { email: regex },
          { adminRole: regex },
          { role: regex },
        ],
      },
    ];
  }

  const adminUsers = await User.find(adminUserQuery).select('_id').lean();
  const adminUserIds = adminUsers.map((user) => user._id);
  const query = { userId: { $in: adminUserIds } };
  const now = new Date();

  if (status === 'active') {
    query.status = 'active';
    query.expiresAt = { $gt: now };
  } else if (status === 'expired') {
    query.$or = [{ status: 'expired' }, { expiresAt: { $lte: now } }];
  } else if (['revoked', 'all'].includes(status)) {
    if (status !== 'all') query.status = status;
  } else {
    query.status = 'active';
    query.expiresAt = { $gt: now };
  }

  const skip = (safePage - 1) * safeLimit;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [sessions, total, activeCount, uniqueAdmins, updatedToday] = await Promise.all([
    UserSession.find(query)
      .populate('userId', 'name email role adminRole avatar')
      .sort({ lastSeenAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(safeLimit),
    UserSession.countDocuments(query),
    UserSession.countDocuments({
      userId: { $in: adminUserIds },
      status: 'active',
      expiresAt: { $gt: now },
    }),
    UserSession.distinct('userId', {
      userId: { $in: adminUserIds },
      status: 'active',
      expiresAt: { $gt: now },
    }),
    UserSession.countDocuments({
      userId: { $in: adminUserIds },
      lastSeenAt: { $gte: startOfToday },
    }),
  ]);

  return {
    sessions: sessions.map((session) => serializeSession(session, currentSessionId)),
    stats: {
      activeAdminSessions: activeCount,
      uniqueAdminsOnline: uniqueAdmins.length,
      sessionsUpdatedToday: updatedToday,
    },
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
      hasNext: safePage * safeLimit < total,
      hasPrev: safePage > 1,
    },
  };
};
