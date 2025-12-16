import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      index: true,
    },
    proposal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Proposal',
      index: true,
    },
    contract: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contract',
      index: true,
    },
    type: {
      type: String,
      enum: ['proposal', 'contract', 'general'],
      default: 'general',
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: new Map(),
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    archivedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    metadata: {
      jobTitle: String,
      proposalAmount: Number,
      contractStatus: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
conversationSchema.index({ participants: 1, lastMessageAt: -1 });
conversationSchema.index({ participants: 1, isActive: 1, lastMessageAt: -1 });
conversationSchema.index({ job: 1, participants: 1 });
conversationSchema.index({ contract: 1 }, { unique: true, sparse: true });

// Methods
conversationSchema.methods.isParticipant = function (userId) {
  if (!this.participants || !Array.isArray(this.participants)) {
    return false;
  }
  
  return this.participants.some((p) => {
    if (!p) {
      return false;
    }
    // Handle both populated (object with _id) and unpopulated (ObjectId) cases
    const participantId = p._id ? p._id.toString() : p.toString();
    return participantId === userId?.toString();
  });
};

conversationSchema.methods.getUnreadCount = function (userId) {
  return this.unreadCount.get(userId.toString()) || 0;
};

conversationSchema.methods.incrementUnread = function (userId) {
  const currentCount = this.getUnreadCount(userId);
  this.unreadCount.set(userId.toString(), currentCount + 1);
};

conversationSchema.methods.resetUnread = function (userId) {
  this.unreadCount.set(userId.toString(), 0);
};

conversationSchema.methods.getOtherParticipant = function (userId) {
  return this.participants.find((p) => {
    // Handle both populated (object with _id) and unpopulated (ObjectId) cases
    const participantId = p._id ? p._id.toString() : p.toString();
    return participantId !== userId.toString();
  });
};

conversationSchema.methods.isArchivedBy = function (userId) {
  return this.archivedBy.some(
    (id) => id.toString() === userId.toString()
  );
};

// Statics
conversationSchema.statics.findByUser = function (userId, options = {}) {
  const query = {
    participants: userId,
    isActive: true,
  };
  
  if (!options.includeArchived) {
    query.archivedBy = { $ne: userId };
  }
  
  return this.find(query)
    .populate('participants', 'name avatar email role')
    .populate('lastMessage')
    .populate('job', 'title description budget')
    .populate({
      path: 'proposal',
      select: 'status bidAmount coverLetter freelancerId jobId',
      populate: [
        { path: 'freelancerId', select: 'name avatar email' },
        { path: 'jobId', select: 'title description budget' }
      ]
    })
    .populate('contract', 'status title totalAmount')
    .sort({ lastMessageAt: -1 });
};

conversationSchema.statics.findBetweenUsers = function (user1Id, user2Id, context = {}) {
  const query = {
    participants: { $all: [user1Id, user2Id] },
    isActive: true,
  };
  
  if (context.job) query.job = context.job;
  if (context.contract) query.contract = context.contract;
  
  return this.findOne(query);
};

conversationSchema.statics.findOrCreate = async function (participants, context = {}) {
  let conversation = await this.findBetweenUsers(
    participants[0],
    participants[1],
    context
  );
  
  if (!conversation) {
    const data = {
      participants,
      ...context,
    };
    conversation = await this.create(data);
    await conversation.populate('participants', 'name avatar email role');
  }
  
  return conversation;
};

// Pre-save hook
conversationSchema.pre('save', function (next) {
  if (this.isNew && this.participants.length === 2) {
    // Initialize unread counts for both participants
    this.participants.forEach((participantId) => {
      if (!this.unreadCount.has(participantId.toString())) {
        this.unreadCount.set(participantId.toString(), 0);
      }
    });
  }
  next();
});

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
