import MessageService from '../../../modules/messages/message.service.js';
import Message from '../../../models/Message.js';
import Conversation from '../../../models/Conversation.js';
import User from '../../../models/User.js';
import { emitMessage, emitMessageEdited, emitMessageDeleted } from '../../../sockets/index.js';
import { notifyUser } from '../../../modules/notifications/notification.service.js';

jest.mock('../../../models/Message.js');
jest.mock('../../../models/Conversation.js');
jest.mock('../../../models/User.js');
jest.mock('../../../sockets/index.js');
jest.mock('../../../modules/notifications/notification.service.js');

describe('Message Service', () => {
  beforeEach(() => jest.restoreAllMocks());

  describe('createConversation', () => {
    test('throws when participant not found', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue(null);
      await expect(MessageService.createConversation('u1', { participantId: 'p1' })).rejects.toThrow();
    });

    test('throws when participant is self', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'u1' });
      await expect(MessageService.createConversation('u1', { participantId: 'u1' })).rejects.toThrow();
    });

    test('creates or finds conversation', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'p1' });
      const conv = { _id: 'c1' };
      jest.spyOn(Conversation, 'findOrCreate').mockResolvedValue(conv);

      const out = await MessageService.createConversation('u1', { participantId: 'p1' });
      expect(out).toBe(conv);
    });
  });

  describe('getConversations', () => {
    test('returns mapped conversations with unreadCount', async () => {
      const conv = { toObject: () => ({ id: 'c1' }), getUnreadCount: jest.fn().mockReturnValue(2) };
      jest.spyOn(Conversation, 'findByUser').mockResolvedValue([conv]);

      const list = await MessageService.getConversations('u1');
      expect(list[0]).toHaveProperty('unreadCount', 2);
    });
  });

  describe('getConversationById', () => {
    test('throws when not found', async () => {
      jest.spyOn(Conversation, 'findById').mockResolvedValue(null);
      await expect(MessageService.getConversationById('c1', 'u1')).rejects.toThrow();
    });

    test('throws when not participant', async () => {
      // build a chainable populate object that resolves to a populated conversation
      const chain = {
        populate: jest.fn().mockReturnThis(),
        then: (cb) => cb({ isParticipant: () => false, toObject: () => ({}) })
      };
      jest.spyOn(Conversation, 'findById').mockImplementation(() => chain);
      await expect(MessageService.getConversationById('c1', 'u1')).rejects.toThrow();
    });

    test('returns conversation with unreadCount', async () => {
      const convPopulated = { toObject: () => ({ id: 'c1' }), getUnreadCount: () => 1, isParticipant: () => true };
      const chain = {
        populate: jest.fn().mockReturnThis(),
        then: (cb) => cb(convPopulated)
      };
      jest.spyOn(Conversation, 'findById').mockImplementation(() => chain);

      const out = await MessageService.getConversationById('c1', 'u1');
      expect(out).toHaveProperty('unreadCount', 1);
    });
  });

  describe('sendMessage', () => {
    test('throws when conversation not found', async () => {
      jest.spyOn(Conversation, 'findById').mockResolvedValue(null);
      await expect(MessageService.sendMessage('c1', 'u1', { content: 'hi' }, [])).rejects.toThrow();
    });

    test('throws when sender not participant', async () => {
      const conv = { isParticipant: () => false };
      jest.spyOn(Conversation, 'findById').mockResolvedValue(conv);
      await expect(MessageService.sendMessage('c1', 'u1', { content: 'x' }, [])).rejects.toThrow();
    });

    test('sends message, emits and notifies others, handles notify errors', async () => {
      const participants = [{ toString: () => 'u1' }, { toString: () => 'u2' }];
      const conv = {
        participants,
        isParticipant: () => true,
        incrementUnread: jest.fn(),
        save: jest.fn(),
        lastMessageAt: null
      };
      jest.spyOn(Conversation, 'findById').mockResolvedValue(conv);

      const msgInstance = {
        _id: 'm1',
        createdAt: new Date(),
        sender: { name: 'S' },
        content: 'hello',
        replyTo: null,
        populate: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
        markAsRead: jest.fn().mockResolvedValue(true),
        toObject: () => ({ _id: 'm1', content: 'hello', sender: { name: 'S' } })
      };
      Message.mockImplementation(() => msgInstance);

      // make notifyUser throw for one participant to exercise catch
      // Make notifyUser throw synchronously so try/catch inside sendMessage catches it
      jest.spyOn(global.console, 'error').mockImplementation(() => {});
      jest.spyOn(require('../../../modules/notifications/notification.service.js'), 'notifyUser').mockImplementation(() => { throw new Error('boom'); });

      const out = await MessageService.sendMessage('c1', 'u1', { content: 'hello' }, []);
      expect(out).toBe(msgInstance);
      expect(emitMessage).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
      console.error.mockRestore();
    });

    test('handles files and embeds', async () => {
      const participants = [{ toString: () => 'u1' }, { toString: () => 'u2' }];
      const conv = {
        participants,
        isParticipant: () => true,
        incrementUnread: jest.fn(),
        save: jest.fn()
      };
      jest.spyOn(Conversation, 'findById').mockResolvedValue(conv);

      const msgInstance = {
        _id: 'm2', createdAt: new Date(), sender: { name: 'S' }, content: '', replyTo: null,
        populate: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
        markAsRead: jest.fn().mockResolvedValue(true),
        toObject: () => ({ _id: 'm2' })
      };
      Message.mockImplementation(() => msgInstance);

      const files = [{ originalname: 'f.png', path: '/uploads/f.png', mimetype: 'image/png', size: 100 }];

      const out = await MessageService.sendMessage('c1', 'u1', { embeds: [{ type: 'video', url: 't' }] }, files);
      expect(out).toBe(msgInstance);
      expect(emitMessage).toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    test('throws when conversation not found', async () => {
      jest.spyOn(Conversation, 'findById').mockResolvedValue(null);
      await expect(MessageService.getMessages('c1', 'u1')).rejects.toThrow();
    });

    test('throws when not participant', async () => {
      const conv = { isParticipant: () => false };
      jest.spyOn(Conversation, 'findById').mockResolvedValue(conv);
      await expect(MessageService.getMessages('c1', 'u1')).rejects.toThrow();
    });

    test('returns messages with pagination', async () => {
      const conv = { isParticipant: () => true };
      jest.spyOn(Conversation, 'findById').mockResolvedValue(conv);

      const msgs = [{ _id: 'm1' }];
      jest.spyOn(Message, 'findByConversation').mockResolvedValue(msgs);
      jest.spyOn(Message, 'countDocuments').mockResolvedValue(1);

      const out = await MessageService.getMessages('c1', 'u1', { page: 1, limit: 10 });
      expect(out.messages).toEqual(msgs);
      expect(out.pagination.total).toBe(1);
    });
  });

  describe('markAsRead', () => {
    test('throws when conversation not found', async () => {
      jest.spyOn(Conversation, 'findById').mockResolvedValue(null);
      await expect(MessageService.markAsRead('c1', 'u1')).rejects.toThrow();
    });

    test('throws when not participant', async () => {
      const conv = { isParticipant: () => false };
      jest.spyOn(Conversation, 'findById').mockResolvedValue(conv);
      await expect(MessageService.markAsRead('c1', 'u1')).rejects.toThrow();
    });

    test('marks as read and resets unread', async () => {
      const conv = { isParticipant: () => true, resetUnread: jest.fn(), save: jest.fn() };
      jest.spyOn(Conversation, 'findById').mockResolvedValue(conv);
      jest.spyOn(Message, 'markAllAsRead').mockResolvedValue([]);

      const out = await MessageService.markAsRead('c1', 'u1');
      expect(out).toEqual({ success: true });
      expect(conv.resetUnread).toHaveBeenCalled();
    });
  });

  describe('editMessage', () => {
    test('throws when message not found', async () => {
      jest.spyOn(Message, 'findOne').mockResolvedValue(null);
      await expect(MessageService.editMessage('c1', 'm1', 'u1', 'x')).rejects.toThrow();
    });

    test('throws when not owner', async () => {
      const m = { canBeModifiedBy: () => false };
      jest.spyOn(Message, 'findOne').mockResolvedValue(m);
      await expect(MessageService.editMessage('c1', 'm1', 'u1', 'x')).rejects.toThrow();
    });

    test('throws when deleted', async () => {
      const m = { canBeModifiedBy: () => true, isDeleted: true };
      jest.spyOn(Message, 'findOne').mockResolvedValue(m);
      await expect(MessageService.editMessage('c1', 'm1', 'u1', 'x')).rejects.toThrow();
    });

    test('edits message and emits', async () => {
      const m = { canBeModifiedBy: () => true, isDeleted: false, edit: jest.fn().mockResolvedValue(true), toObject: () => ({}) };
      jest.spyOn(Message, 'findOne').mockResolvedValue(m);

      const out = await MessageService.editMessage('c1', 'm1', 'u1', 'new');
      expect(m.edit).toHaveBeenCalledWith('new');
      expect(emitMessageEdited).toHaveBeenCalled();
      expect(out).toBe(m);
    });
  });

  describe('deleteMessage', () => {
    test('throws when not found', async () => {
      jest.spyOn(Message, 'findOne').mockResolvedValue(null);
      await expect(MessageService.deleteMessage('c1', 'm1', 'u1')).rejects.toThrow();
    });

    test('throws when not owner', async () => {
      const m = { canBeModifiedBy: () => false };
      jest.spyOn(Message, 'findOne').mockResolvedValue(m);
      await expect(MessageService.deleteMessage('c1', 'm1', 'u1')).rejects.toThrow();
    });

    test('throws when already deleted', async () => {
      const m = { canBeModifiedBy: () => true, isDeleted: true };
      jest.spyOn(Message, 'findOne').mockResolvedValue(m);
      await expect(MessageService.deleteMessage('c1', 'm1', 'u1')).rejects.toThrow();
    });

    test('soft deletes and emits', async () => {
      const m = { canBeModifiedBy: () => true, isDeleted: false, softDelete: jest.fn().mockResolvedValue(true) };
      jest.spyOn(Message, 'findOne').mockResolvedValue(m);

      const out = await MessageService.deleteMessage('c1', 'm1', 'u1');
      expect(m.softDelete).toHaveBeenCalled();
      expect(emitMessageDeleted).toHaveBeenCalled();
      expect(out).toBe(m);
    });
  });

  describe('archive and unarchive conversation', () => {
    test('archive throws when not found or not participant', async () => {
      jest.spyOn(Conversation, 'findById').mockResolvedValue(null);
      await expect(MessageService.archiveConversation('c1', 'u1')).rejects.toThrow();

      jest.spyOn(Conversation, 'findById').mockResolvedValue({ isParticipant: () => false });
      await expect(MessageService.archiveConversation('c1', 'u1')).rejects.toThrow();
    });

    test('archives when not already archived', async () => {
      const conv = { isParticipant: () => true, archivedBy: [], save: jest.fn() };
      jest.spyOn(Conversation, 'findById').mockResolvedValue(conv);
      const out = await MessageService.archiveConversation('c1', 'u1');
      expect(out.archivedBy).toContain('u1');
    });

    test('unarchive throws when not found or not participant', async () => {
      jest.spyOn(Conversation, 'findById').mockResolvedValue(null);
      await expect(MessageService.unarchiveConversation('c1', 'u1')).rejects.toThrow();

      jest.spyOn(Conversation, 'findById').mockResolvedValue({ isParticipant: () => false });
      await expect(MessageService.unarchiveConversation('c1', 'u1')).rejects.toThrow();
    });

    test('unarchives successfully', async () => {
      const conv = { isParticipant: () => true, archivedBy: ['u1'], save: jest.fn() };
      jest.spyOn(Conversation, 'findById').mockResolvedValue(conv);
      const out = await MessageService.unarchiveConversation('c1', 'u1');
      expect(out.archivedBy).not.toContain('u1');
    });
  });

  describe('searchMessages', () => {
    test('throws when conv not found or not participant', async () => {
      jest.spyOn(Conversation, 'findById').mockResolvedValue(null);
      await expect(MessageService.searchMessages('c1', 'u1', 'x')).rejects.toThrow();

      jest.spyOn(Conversation, 'findById').mockResolvedValue({ isParticipant: () => false });
      await expect(MessageService.searchMessages('c1', 'u1', 'x')).rejects.toThrow();
    });

    test('returns search results', async () => {
      const conv = { isParticipant: () => true };
      jest.spyOn(Conversation, 'findById').mockResolvedValue(conv);
      jest.spyOn(Message, 'searchInConversation').mockResolvedValue([{ _id: 'm1' }]);

      const out = await MessageService.searchMessages('c1', 'u1', 'term');
      expect(out).toEqual([{ _id: 'm1' }]);
    });
  });

  describe('getUnreadCount', () => {
    test('sums unread counts', async () => {
      const convs = [{ getUnreadCount: () => 2 }, { getUnreadCount: () => 3 }];
      jest.spyOn(Conversation, 'find').mockResolvedValue(convs);

      const out = await MessageService.getUnreadCount('u1');
      expect(out).toBe(5);
    });
  });
});
