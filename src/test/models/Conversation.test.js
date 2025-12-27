import { describe, it, expect } from '@jest/globals';
import Conversation from '../../models/Conversation.js';
import User from '../../models/User.js';

describe('Conversation Model', () => {
  it('handles participants, unread counts and archive flags', async () => {
    const u1 = await User.create({ name: 'U1', email: 'u1@example.com' });
    const u2 = await User.create({ name: 'U2', email: 'u2@example.com' });

    const convo = await Conversation.create({ participants: [u1._id, u2._id] });

    expect(convo.isParticipant(u1._id)).toBe(true);
    expect(convo.isParticipant(u2._id)).toBe(true);

    // other participant
    expect(convo.getOtherParticipant(u1._id).toString()).toBe(u2._id.toString());

    // unread counts
    expect(convo.getUnreadCount(u1._id)).toBe(0);
    convo.incrementUnread(u1._id);
    expect(convo.getUnreadCount(u1._id)).toBe(1);
    convo.resetUnread(u1._id);
    expect(convo.getUnreadCount(u1._id)).toBe(0);

    // archive
    expect(convo.isArchivedBy(u1._id)).toBe(false);
    convo.archivedBy.push(u1._id);
    await convo.save();
    const fresh = await Conversation.findById(convo._id);
    expect(fresh.isArchivedBy(u1._id)).toBe(true);
  });
});