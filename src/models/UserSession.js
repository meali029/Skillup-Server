import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    browser: { type: String, default: 'Unknown browser' },
    os: { type: String, default: 'Unknown OS' },
    type: { type: String, default: 'desktop' },
    displayName: { type: String, default: 'Unknown device' },
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    city: { type: String, default: null },
    region: { type: String, default: null },
    country: { type: String, default: null },
    source: {
      type: String,
      enum: ['geoip-lite', 'local', 'unknown'],
      default: 'unknown',
    },
  },
  { _id: false }
);

const userSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['freelancer', 'client', 'admin', 'super_admin', null],
      default: null,
    },
    adminRole: {
      type: String,
      enum: ['super_admin', 'admin', 'moderator', null],
      default: null,
    },
    device: {
      type: deviceSchema,
      default: () => ({}),
    },
    ipAddress: {
      type: String,
      default: null,
    },
    location: {
      type: locationSchema,
      default: () => ({}),
    },
    userAgent: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'revoked', 'expired'],
      default: 'active',
      index: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userSessionSchema.index({ userId: 1, status: 1, lastSeenAt: -1 });
userSessionSchema.index({ status: 1, expiresAt: 1 });
userSessionSchema.index({ role: 1, adminRole: 1, status: 1, lastSeenAt: -1 });

const UserSession = mongoose.model('UserSession', userSessionSchema);

export default UserSession;
