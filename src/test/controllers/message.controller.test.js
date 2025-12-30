import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as MessageController from '../../modules/messages/message.controller.js';
import User from '../../models/User.js';

// Mock message service
jest.mock('../../modules/messages/message.service.js', () => ({
  createConversation: jest.fn(),
  getConversations: jest.fn(),
  getConversationById: jest.fn(),
  sendMessage: jest.fn(),
  getMessages: jest.fn(),
  markAsRead: jest.fn(),
  editMessage: jest.fn(),
  deleteMessage: jest.fn(),
  archiveConversation: jest.fn(),
  unarchiveConversation: jest.fn(),
  searchMessages: jest.fn(),
  getUnreadCount: jest.fn(),
}));

import * as messageService from '../../modules/messages/message.service.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((payload) => { res.payload = payload; return res; });
  return res;
};

describe('Message Controller', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    jest.clearAllMocks();
  });

  it('createConversation calls service and returns 201', async () => {
    const user = await User.create({ name: 'M1', email: 'm1@example.com' });
    messageService.createConversation.mockResolvedValue({ _id: 'conv1' });

    const req = { body: { participants: [] }, user: { id: user._id } };
    const res = buildRes();

    await MessageController.createConversation(req, res);
    expect(messageService.createConversation).toHaveBeenCalledWith(user._id, req.body);
    expect(res.statusCode).toBe(201);
  });

  it('sendMessage parses embeds string and passes files', async () => {
    const user = await User.create({ name: 'M2', email: 'm2@example.com' });
    const messageObj = { _id: 'm1', content: 'hi' };
    messageService.sendMessage.mockResolvedValue(messageObj);

    const req = { params: { conversationId: 'conv1' }, user: { id: user._id }, body: { content: 'hi', embeds: JSON.stringify([{ url: 'x' }]) }, files: [{ path: '/tmp/file' }] };
    const res = buildRes();

    await MessageController.sendMessage(req, res);
    expect(messageService.sendMessage).toHaveBeenCalledWith('conv1', user._id, expect.objectContaining({ content: 'hi', embeds: expect.any(Array) }), req.files);
    expect(res.statusCode).toBe(201);
  });

  it('sendMessage handles invalid embeds JSON gracefully', async () => {
    const user = await User.create({ name: 'M3', email: 'm3@example.com' });
    messageService.sendMessage.mockResolvedValue({ _id: 'm2' });

    const req = { params: { conversationId: 'conv2' }, user: { id: user._id }, body: { content: 'hi', embeds: 'not-a-json' }, files: [] };
    const res = buildRes();

    await MessageController.sendMessage(req, res);
    expect(messageService.sendMessage).toHaveBeenCalledWith('conv2', user._id, expect.objectContaining({ embeds: [] }), []);
  });

  it('getMessages handles paginated response', async () => {
    messageService.getMessages.mockResolvedValue({ messages: [{ _id: 'm1' }], pagination: { page:1, limit:10, total:1 } });
    const req = { params: { conversationId: 'conv1' }, user: { id: 'u1' }, query: {} };
    const res = buildRes();

    await MessageController.getMessages(req, res);
    expect(res.payload.pagination).toBeDefined();
  });

  it('markAsRead calls service', async () => {
    messageService.markAsRead.mockResolvedValue({ ok: true });
    const req = { params: { conversationId: 'conv1' }, user: { id: 'u1' } };
    const res = buildRes();

    await MessageController.markAsRead(req, res);
    expect(messageService.markAsRead).toHaveBeenCalledWith('conv1', 'u1');
    expect(res.payload.data).toEqual({ ok: true });
  });

  it('editMessage, deleteMessage, archive/unarchive, search and unread count work', async () => {
    const user = await User.create({ name: 'M4', email: 'm4@example.com' });
    messageService.editMessage.mockResolvedValue({ _id: 'm3', content: 'edited' });
    messageService.deleteMessage.mockResolvedValue({ _id: 'm3' });
    messageService.archiveConversation.mockResolvedValue({ _id: 'conv1' });
    messageService.unarchiveConversation.mockResolvedValue({ _id: 'conv1' });
    messageService.searchMessages.mockResolvedValue([{ _id: 'm1' }]);
    messageService.getUnreadCount.mockResolvedValue(5);

    const editReq = { params: { conversationId: 'conv1', messageId: 'm3' }, user: { id: user._id }, body: { content: 'edited' } };
    const resEdit = buildRes();
    await MessageController.editMessage(editReq, resEdit);
    expect(messageService.editMessage).toHaveBeenCalledWith('conv1', 'm3', user._id, 'edited');

    const delReq = { params: { conversationId: 'conv1', messageId: 'm3' }, user: { id: user._id } };
    const resDel = buildRes();
    await MessageController.deleteMessage(delReq, resDel);
    expect(messageService.deleteMessage).toHaveBeenCalledWith('conv1', 'm3', user._id);

    const arcReq = { params: { id: 'conv1' }, user: { id: user._id } };
    const resArc = buildRes();
    await MessageController.archiveConversation(arcReq, resArc);
    await MessageController.unarchiveConversation(arcReq, resArc);

    const searchReq = { params: { conversationId: 'conv1' }, user: { id: user._id }, query: { query: 'hello' } };
    const resSearch = buildRes();
    await MessageController.searchMessages(searchReq, resSearch);
    expect(messageService.searchMessages).toHaveBeenCalledWith('conv1', user._id, 'hello');

    const unreadReq = { user: { id: user._id } };
    const resUnread = buildRes();
    await MessageController.getUnreadCount(unreadReq, resUnread);
    expect(messageService.getUnreadCount).toHaveBeenCalledWith(user._id);
  });
});