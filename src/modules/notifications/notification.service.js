import Notification from '../../models/Notification.js';
import User from '../../models/User.js';
import { emitUserNotification, emitToRoom } from '../../sockets/index.js';

export const notifyUser = async (userId, payload) => {
  try {
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
  notifyAdmins,
  listMyNotifications,
  markRead,
  markAllRead,
  getUnreadCount,
  deleteNotification,
  deleteAllNotifications,
};
