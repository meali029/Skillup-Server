import { describe, it, expect, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import Message from '../../models/Message.js';
import Conversation from '../../models/Conversation.js';

describe('Message Model', () => {
  beforeEach(async () => {
    await Message.deleteMany({});
    await Conversation.deleteMany({});
  });

  it('markAsRead / isReadBy should work', async () => {
    const conv = await Conversation.create({ participants: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()] });

    const msg = await Message.create({ conversation: conv._id, sender: conv.participants[0], content: 'Hello' });

    expect(msg.isReadBy(conv.participants[0])).toBe(false);
    await msg.markAsRead(conv.participants[0]);
    expect(msg.isReadBy(conv.participants[0])).toBe(true);
  });

  it('edit and softDelete update flags and content', async () => {
    const conv = await Conversation.create({ participants: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()] });
    const sender = conv.participants[0];

    const msg = await Message.create({ conversation: conv._id, sender, content: 'Original' });
    await msg.edit('New content');
    expect(msg.isEdited).toBe(true);
    expect(msg.content).toBe('New content');

    await msg.softDelete();
    expect(msg.isDeleted).toBe(true);
    expect(msg.content).toBe('This message has been deleted');
  });

  it('countUnread and markAllAsRead work', async () => {
    const a = new mongoose.Types.ObjectId();
    const b = new mongoose.Types.ObjectId();
    const conv = await Conversation.create({ participants: [a, b] });

    await Message.create({ conversation: conv._id, sender: a, content: '1' });
    await Message.create({ conversation: conv._id, sender: a, content: '2' });

    const cnt = await Message.countUnread(conv._id, b);
    expect(cnt).toBe(2);

    await Message.markAllAsRead(conv._id, b);
    const cnt2 = await Message.countUnread(conv._id, b);
    expect(cnt2).toBe(0);
  });

  it('post-save updates conversation lastMessage', async () => {
    const a = new mongoose.Types.ObjectId();
    const b = new mongoose.Types.ObjectId();
    const conv = await Conversation.create({ participants: [a, b] });

    const msg = await Message.create({ conversation: conv._id, sender: a, content: 'latest' });

    const updated = await Conversation.findById(conv._id);
    expect(updated.lastMessage.toString()).toBe(msg._id.toString());
  });
});