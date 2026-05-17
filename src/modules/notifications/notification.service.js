import Notification from '../../models/Notification.js';
import User from '../../models/User.js';
import { emitUserNotification, emitToRoom } from '../../sockets/index.js';

const notificationDefaults = {
  pushNotifications: true,
  messageNotifications: true,
  proposalNotifications: true,
  contractNotifications: true,
  paymentNotifications: true,
  accountNotifications: true,
  jobRecommendations: true,
};

const getNotificationCategory = (type = '') => {
  const normalizedType = String(type).toLowerCase();

  if (normalizedType.includes('message')) return 'messageNotifications';
  if (normalizedType.includes('proposal')) return 'proposalNotifications';
  if (normalizedType.includes('job')) return 'jobRecommendations';
  if (normalizedType.includes('contract') || normalizedType.includes('milestone')) return 'contractNotifications';
  if (
    normalizedType.includes('payment') ||
    normalizedType.includes('deposit') ||
    normalizedType.includes('refund') ||
    normalizedType.includes('reversal') ||
    normalizedType.includes('subscription') ||
    normalizedType.includes('renewal') ||
    normalizedType.includes('usage') ||
    normalizedType.includes('grace')
  ) {
    return 'paymentNotifications';
  }

  return 'accountNotifications';
};

const shouldNotifyUser = async (userId, type) => {
  const user = await User.findById(userId).select('notificationSettings').lean();
  if (!user) return false;

  const settings = {
    ...notificationDefaults,
    ...(user.notificationSettings || {}),
  };

  if (settings.pushNotifications === false) return false;

  const category = getNotificationCategory(type);
  return settings[category] !== false;
};

export const notifyUser = async (userId, payload) => {
  try {
    const canNotify = await shouldNotifyUser(userId, payload?.type);
    if (!canNotify) {
      return null;
    }

    const doc = await Notification.create({ userId, ...payload });

    const payloadToEmit = {
      id: doc._id.toString(),
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link,
      data: payload.data || {},
      isRead: doc.isRead,
      createdAt: doc.createdAt,
    };

    emitUserNotification(userId.toString(), payloadToEmit);
    return doc;
  } catch (error) {
    console.error('[Notification] Failed to notify user', error);
    throw error;
  }
};

export const createNotification = async (payload = {}) => {
  const userId = payload.userId || payload.user;
  if (!userId) {
    throw new Error('Notification userId is required');
  }

  return notifyUser(userId, {
    type: payload.type,
    title: payload.title,
    message: payload.message,
    link: payload.link,
    data: {
      ...(payload.data || {}),
      ...(payload.relatedJob ? { jobId: payload.relatedJob } : {}),
      ...(payload.relatedProposal ? { proposalId: payload.relatedProposal } : {}),
    },
  });
};

export const notifyAdmins = async (payload) => {
  try {
    const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
    if (!admins || admins.length === 0) {
      // Still emit to admins room in case some admins are connected but not persisted
      emitToRoom('admins', 'notification', payload);
      return [];
    }

    const docs = admins.map((a) => ({ userId: a._id, ...payload }));
    await Notification.insertMany(docs);

    emitToRoom('admins', 'notification', payload);
    return admins.map(a => a._id.toString());
  } catch (error) {
    console.error('[Notification] Failed to notify admins', error);
    throw error;
  }
};

export const listMyNotifications = async (userId, { unreadOnly = false, limit = 50, page = 1 } = {}) => {
  const query = { userId };
  if (unreadOnly) query.isRead = false;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(query),
  ]);

  return { items, pagination: { page, limit, total } };
};

export const markRead = async (userId, notificationId) => {
  return Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  ).lean();
};

export const markAllRead = async (userId) => {
  await Notification.updateMany({ userId, isRead: false }, { $set: { isRead: true, readAt: new Date() } });
};

export const getUnreadCount = async (userId) => {
  return Notification.countDocuments({ userId, isRead: false });
};

export const deleteNotification = async (userId, notificationId) => {
  const result = await Notification.findOneAndDelete({ _id: notificationId, userId });
  return result;
};

export const deleteAllNotifications = async (userId) => {
  const result = await Notification.deleteMany({ userId });
  return result;
};

export default {
  notifyUser,
  createNotification,
  notifyAdmins,
  listMyNotifications,
  markRead,
  markAllRead,
  getUnreadCount,
  deleteNotification,
  deleteAllNotifications,
};
