import mongoose from 'mongoose';

const emailCampaignSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160,
  },
  templateKey: {
    type: String,
    enum: ['admin_announcement', 'account_cleanup_notice'],
    default: 'admin_announcement',
  },
  status: {
    type: String,
    enum: ['draft', 'sending', 'sent', 'failed', 'cancelled'],
    default: 'draft',
    index: true,
  },
  audienceType: {
    type: String,
    enum: [
      'all',
      'clients',
      'freelancers',
      'verified',
      'unverified',
      'incomplete_profile',
      'custom',
    ],
    required: true,
  },
  customEmails: [{ type: String, trim: true, lowercase: true }],
  content: {
    heading: { type: String, required: true, trim: true, maxlength: 140 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    ctaLabel: { type: String, trim: true, maxlength: 60 },
    ctaUrl: { type: String, trim: true, maxlength: 500 },
  },
  testSentAt: Date,
  recipientCount: { type: Number, default: 0 },
  stats: {
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sentAt: Date,
  cancelledAt: Date,
  error: String,
}, {
  timestamps: true,
});

emailCampaignSchema.index({ createdAt: -1 });
emailCampaignSchema.index({ status: 1, createdAt: -1 });

const EmailCampaign = mongoose.model('EmailCampaign', emailCampaignSchema);

export default EmailCampaign;
