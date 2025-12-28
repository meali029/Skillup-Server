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
    pinnedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    mutedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    deletedBy: [
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

conversationSchema.methods.isPinnedBy = function (userId) {
  return this.pinnedBy.some(
    (id) => id.toString() === userId.toString()
  );
};

conversationSchema.methods.isMutedBy = function (userId) {
  return this.mutedBy.some(
    (id) => id.toString() === userId.toString()
  );
};

conversationSchema.methods.isDeletedBy = function (userId) {
  return this.deletedBy.some(
    (id) => id.toString() === userId.toString()
  );
};

// Statics
conversationSchema.statics.findByUser = async function (userId, options = {}) {
  const query = {
    participants: userId,
    isActive: true,
  };
  
  if (options.includeArchived) {
    // When includeArchived is true, only return conversations archived by this user
    // archivedBy is an array, so we check if userId is in the array
    query.archivedBy = { $in: [userId] };
  } else {
    // When includeArchived is false, exclude conversations archived by this user
    query.archivedBy = { $nin: [userId] };
  }
  
  // Exclude conversations deleted by this user
  query.deletedBy = { $nin: [userId] };
  
  const conversations = await this.find(query)
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
  
  // Sort conversations: pinned first, then by lastMessageAt
  return conversations.sort((a, b) => {
    const aPinned = a.isPinnedBy(userId);
    const bPinned = b.isPinnedBy(userId);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
  });
};

conversationSchema.statics.findBetweenUsers = function (user1Id, user2Id, context = {}) {
  const baseQuery = {
    participants: { $all: [user1Id, user2Id] },
    isActive: true,
  };

  // First try to find ANY existing conversation between these users (regardless of context)
  return this.findOne(baseQuery);
};

conversationSchema.statics.findOrCreate = async function (participants, context = {}) {
  // First check for ANY conversation between these users (ignore context to avoid duplicates)
  let conversation = await this.findBetweenUsers(
    participants[0],
    participants[1],
    {} // empty context on purpose
  );

  if (!conversation) {
    // Create new conversation with provided context
    const data = {
      participants,
      ...context,
    };
    conversation = await this.create(data);
    await conversation.populate('participants', 'name avatar email role');
  } else {
    // Update existing conversation with missing context fields so it reflects latest linkage
    let shouldSave = false;
    if (context.job && !conversation.job) { conversation.job = context.job; shouldSave = true; }
    if (context.proposal && !conversation.proposal) { conversation.proposal = context.proposal; shouldSave = true; }
    if (context.contract && !conversation.contract) { conversation.contract = context.contract; shouldSave = true; }
    if (context.metadata) { conversation.metadata = { ...conversation.metadata, ...context.metadata }; shouldSave = true; }
    if (context.type && conversation.type !== context.type) { conversation.type = context.type; shouldSave = true; }

    if (shouldSave) {
      await conversation.save();
    }
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
