import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'ADMIN_LOGIN',
        'ADMIN_LOGOUT',
        'USER_SUSPENDED',
        'USER_UNSUSPENDED',
        'USER_BANNED',
        'USER_UNBANNED',
        'CNIC_APPROVED',
        'CNIC_REJECTED',
        'SYSTEM_SETTING_CHANGED',
        'INTEGRATION_CONFIG_CHANGED',
        'JOB_FLAGGED',
        'JOB_APPROVED',
        'JOB_REJECTED',
        'JOB_DELETED',
        'JOB_FEATURED',
        'JOB_UNFEATURED',
        'KEYWORD_ADDED',
        'KEYWORD_EDITED',
        'KEYWORD_DELETED',
        'USER_DELETED',
        'ROLE_CHANGED',
        'PAYMENT_DEPOSIT_INITIALIZED',
        'WITHDRAWAL_REQUESTED',
        'WITHDRAWAL_PROCESSED',
        'WITHDRAWAL_REJECTED',
        'ESCROW_CREATED',
        'ESCROW_FUNDED',
        'ESCROW_RELEASED',
        'ESCROW_REFUNDED',
        'ESCROW_FROZEN',
        'PAYMENT_MODE_UPDATED',
      ],
      index: true,
    },
    targetType: {
      type: String,
      enum: ['User', 'Job', 'System', 'Integration', 'Keyword', 'Transaction', 'WithdrawalRequest', 'Escrow', null],
      default: null,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    targetName: {
      type: String, // Store the name/title for display even if target is deleted
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed, // Flexible field for action-specific data
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    metadata: {
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      reason: String,
      notes: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
auditLogSchema.index({ createdAt: -1 }); // For sorting by date
auditLogSchema.index({ action: 1, createdAt: -1 }); // Filter by action and date
auditLogSchema.index({ adminId: 1, createdAt: -1 }); // Filter by admin

// Virtual for admin details
auditLogSchema.virtual('admin', {
  ref: 'User',
  localField: 'adminId',
  foreignField: '_id',
  justOne: true,
});

// TTL index for automatic deletion after 1 year (365 days)
// Note: This is set to 1 year but can be adjusted
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 }); // 365 days * 24 hours * 60 min * 60 sec

// Prevent deletion by making delete operations no-op
auditLogSchema.pre('remove', function (next) {
  const err = new Error('Audit logs cannot be deleted');
  next(err);
});

auditLogSchema.pre('deleteOne', function (next) {
  const err = new Error('Audit logs cannot be deleted');
  next(err);
});

auditLogSchema.pre('deleteMany', function (next) {
  const err = new Error('Audit logs cannot be deleted');
  next(err);
});

auditLogSchema.pre('findOneAndDelete', function (next) {
  const err = new Error('Audit logs cannot be deleted');
  next(err);
});

auditLogSchema.pre('findOneAndRemove', function (next) {
  const err = new Error('Audit logs cannot be deleted');
  next(err);
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
