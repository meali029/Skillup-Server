import { asyncHandler, successResponse } from '../../../core/utils/index.js';
import { createAppError } from '../../../core/errors/index.js';
import { createAuditLog } from '../../../core/utils/auditLogger.js';
import {
  listAdminSessions,
  revokeSession,
  serializeSession,
} from '../../auth/auth-session.service.js';

export const getAdminSessions = asyncHandler(async (req, res) => {
  const result = await listAdminSessions({
    status: req.query.status || 'active',
    page: req.query.page || 1,
    limit: req.query.limit || 20,
    search: req.query.search || '',
    currentSessionId: req.authSessionId,
  });

  successResponse(res, result, 'Admin sessions retrieved successfully');
});

export const revokeAdminSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  if (req.authSessionId && sessionId === req.authSessionId) {
    throw createAppError('Use logout to revoke your current session', 400);
  }

  const session = await revokeSession({
    sessionId,
    revokedBy: req.user.id,
  });

  if (!session) {
    throw createAppError('Session not found or already inactive', 404);
  }

  const targetUser = session.userId;
  await createAuditLog({
    adminId: req.user.id,
    action: 'SESSION_REVOKED',
    targetType: 'User',
    targetId: targetUser?._id || targetUser,
    targetName: targetUser?.email || null,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    details: {
      revokedSessionId: sessionId,
      targetUserId: targetUser?._id?.toString() || targetUser?.toString(),
      targetUserEmail: targetUser?.email,
      device: session.device,
      sessionIpAddress: session.ipAddress,
      requestIp: req.ip,
      requestUserAgent: req.get('user-agent'),
    },
  });

  successResponse(
    res,
    { session: serializeSession(session, req.authSessionId) },
    'Admin session revoked successfully'
  );
});
