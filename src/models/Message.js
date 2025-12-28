import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true,
  },
  fileUrl: {
    type: String,
    required: true,
  },
  fileType: {
    type: String,
    required: true,
  },
  fileSize: {
    type: Number,
    required: true,
  },
  mimeType: {
    type: String,
  },
});

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['text', 'file', 'system'],
      default: 'text',
    },
    attachments: [attachmentSchema],
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    embeds: [{
      type: {
        type: String,
        required: true,
      },
      url: {
        type: String,
        required: true,
      },
      title: {
        type: String,
      },
    }],
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, sender: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });

// Text index for search
messageSchema.index({ content: 'text' });

// Methods
messageSchema.methods.markAsRead = function (userId) {
  const alreadyRead = this.readBy.some(
    (r) => r.user.toString() === userId.toString()
  );
  
  if (!alreadyRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date(),
    });
  }
  
  return this.save();
};

messageSchema.methods.isReadBy = function (userId) {
  return this.readBy.some(
    (r) => r.user.toString() === userId.toString()
  );
};

messageSchema.methods.canBeModifiedBy = function (userId) {
  return this.sender.toString() === userId.toString();
};

messageSchema.methods.edit = function (newContent) {
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

messageSchema.methods.softDelete = function (userId) {
  // If sender deletes their own message, hide from everyone
  if (this.sender.toString() === userId.toString()) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.content = 'This message has been deleted';
  } else {
    // If other user deletes message, only hide from their side
    // Don't set isDeleted=true, just add to deletedBy array
    if (!this.deletedBy.includes(userId)) {
      this.deletedBy.push(userId);
    }
  }
  return this.save();
};

// Statics
messageSchema.statics.findByConversation = function (
  conversationId,
  options = {}
) {
  const userId = options.userId;
  
  // Base query: not globally deleted (isDeleted=false)
  const query = {
    conversation: conversationId,
    isDeleted: false,
  };
  
  // If userId provided, also exclude messages deleted by this user
  if (userId) {
    query.deletedBy = { $nin: [userId] };
  }
  
  let queryBuilder = this.find(query)
    .populate('sender', 'name avatar email')
    .populate('replyTo', 'content sender')
    .sort({ createdAt: options.order === 'asc' ? 1 : -1 });
  
  if (options.limit) {
    queryBuilder = queryBuilder.limit(options.limit);
  }
  
  if (options.skip) {
    queryBuilder = queryBuilder.skip(options.skip);
  }
  
  return queryBuilder;
};

messageSchema.statics.countUnread = function (conversationId, userId) {
  return this.countDocuments({
    conversation: conversationId,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId },
    isDeleted: false,
    deletedBy: { $nin: [userId] },
  });
};

messageSchema.statics.markAllAsRead = async function (conversationId, userId) {
  const unreadMessages = await this.find({
    conversation: conversationId,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId },
    isDeleted: false,
    deletedBy: { $nin: [userId] },
  });
  
  const promises = unreadMessages.map((msg) => msg.markAsRead(userId));
  return Promise.all(promises);
};

messageSchema.statics.searchInConversation = function (
  conversationId,
  searchTerm,
  userId = null
) {
  const query = {
    conversation: conversationId,
    $text: { $search: searchTerm },
    isDeleted: false,
  };
  
  if (userId) {
    query.deletedBy = { $nin: [userId] };
  }
  
  return this.find(query)
    .populate('sender', 'name avatar')
    .sort({ score: { $meta: 'textScore' } });
};

// Pre-save hook to update conversation's lastMessage
messageSchema.post('save', async function (doc) {
  if (!doc.isDeleted) {
    const Conversation = mongoose.model('Conversation');
    await Conversation.findByIdAndUpdate(doc.conversation, {
      lastMessage: doc._id,
      lastMessageAt: doc.createdAt,
    });
  }
});

const Message = mongoose.model('Message', messageSchema);

export default Message;
