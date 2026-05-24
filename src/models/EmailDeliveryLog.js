import mongoose from 'mongoose';

const emailDeliveryLogSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmailCampaign',
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['queued', 'sent', 'failed', 'skipped'],
    default: 'queued',
    index: true,
  },
  provider: String,
  messageId: String,
  error: String,
  sentAt: Date,
}, {
  timestamps: true,
});

emailDeliveryLogSchema.index({ campaignId: 1, status: 1 });

const EmailDeliveryLog = mongoose.model('EmailDeliveryLog', emailDeliveryLogSchema);

export default EmailDeliveryLog;
