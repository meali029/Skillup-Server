import mongoose from 'mongoose';
import EmailCampaign from '../../../models/EmailCampaign.js';
import EmailDeliveryLog from '../../../models/EmailDeliveryLog.js';
import User from '../../../models/User.js';
import AppError from '../../../core/errors/AppError.js';
import { sendEmailMessage } from '../../../core/utils/emailService.js';
import { renderCampaignEmail } from '../../../core/utils/emailTemplates.js';
import { addJob, getEmailQueue } from '../../../config/queues.js';
import { JOB_NAMES, JOB_OPTIONS } from '../../../workers/jobSchedules.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const sanitizeCustomEmails = (emails = []) => {
  const list = Array.isArray(emails) ? emails : String(emails).split(/[\n,]/);
  return [...new Set(list.map(normalizeEmail).filter((email) => EMAIL_REGEX.test(email)))];
};

const audienceQuery = (audienceType) => {
  const base = { email: { $exists: true, $ne: '' } };
  switch (audienceType) {
    case 'clients':
      return { ...base, role: 'client' };
    case 'freelancers':
      return { ...base, role: 'freelancer' };
    case 'verified':
      return { ...base, isEmailVerified: true };
    case 'unverified':
      return { ...base, isEmailVerified: { $ne: true } };
    case 'incomplete_profile':
      return {
        ...base,
        $or: [
          { isProfileComplete: { $ne: true } },
          { role: { $exists: false } },
          { role: null },
        ],
      };
    case 'all':
    default:
      return base;
  }
};

export const resolveRecipients = async (campaign, { limit } = {}) => {
  if (campaign.audienceType === 'custom') {
    return sanitizeCustomEmails(campaign.customEmails).slice(0, limit || undefined).map((email) => ({ email }));
  }

  return User.find(audienceQuery(campaign.audienceType))
    .select('_id name email role isProfileComplete isEmailVerified')
    .sort({ createdAt: -1 })
    .limit(limit || 0)
    .lean();
};

export const previewAudience = async ({ audienceType = 'all', customEmails = [] }) => {
  if (audienceType === 'custom') {
    const emails = sanitizeCustomEmails(customEmails);
    return { count: emails.length, sample: emails.slice(0, 10).map((email) => ({ email })) };
  }

  const query = audienceQuery(audienceType);
  const [count, sample] = await Promise.all([
    User.countDocuments(query),
    User.find(query).select('_id name email role isProfileComplete isEmailVerified').sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  return { count, sample };
};

const validateCampaignPayload = (payload) => {
  if (!payload.title?.trim()) throw AppError('Campaign title is required', 400);
  if (!payload.subject?.trim()) throw AppError('Email subject is required', 400);
  if (!payload.content?.heading?.trim()) throw AppError('Email heading is required', 400);
  if (!payload.content?.body?.trim()) throw AppError('Email body is required', 400);
  if (!payload.audienceType) throw AppError('Audience is required', 400);
  if (payload.audienceType === 'custom' && sanitizeCustomEmails(payload.customEmails).length === 0) {
    throw AppError('At least one valid custom recipient is required', 400);
  }
};

const campaignFields = (payload) => ({
  title: payload.title,
  subject: payload.subject,
  templateKey: payload.templateKey || 'admin_announcement',
  audienceType: payload.audienceType,
  customEmails: sanitizeCustomEmails(payload.customEmails),
  content: {
    heading: payload.content?.heading,
    body: payload.content?.body,
    ctaLabel: payload.content?.ctaLabel || '',
    ctaUrl: payload.content?.ctaUrl || '',
  },
});

export const listCampaigns = async ({ page = 1, limit = 20, status }) => {
  const query = status ? { status } : {};
  const skip = (Number(page) - 1) * Number(limit);
  const [campaigns, total] = await Promise.all([
    EmailCampaign.find(query)
      .populate('createdBy', 'name email')
      .populate('sentBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    EmailCampaign.countDocuments(query),
  ]);
  return { campaigns, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

export const getCampaign = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw AppError('Invalid campaign id', 400);
  const campaign = await EmailCampaign.findById(id).populate('createdBy', 'name email').populate('sentBy', 'name email').lean();
  if (!campaign) throw AppError('Campaign not found', 404);
  return campaign;
};

export const createCampaign = async (payload, adminId) => {
  validateCampaignPayload(payload);
  const fields = campaignFields(payload);
  const preview = await previewAudience(fields);
  return EmailCampaign.create({ ...fields, recipientCount: preview.count, createdBy: adminId });
};

export const updateCampaign = async (id, payload) => {
  const campaign = await EmailCampaign.findById(id);
  if (!campaign) throw AppError('Campaign not found', 404);
  if (campaign.status !== 'draft') throw AppError('Only draft campaigns can be edited', 400);

  validateCampaignPayload(payload);
  Object.assign(campaign, campaignFields(payload));
  const preview = await previewAudience(campaign);
  campaign.recipientCount = preview.count;
  await campaign.save();
  return campaign;
};

export const sendCampaignTest = async (id, email) => {
  if (!EMAIL_REGEX.test(normalizeEmail(email))) throw AppError('A valid test email is required', 400);
  const campaign = await EmailCampaign.findById(id);
  if (!campaign) throw AppError('Campaign not found', 404);

  const rendered = renderCampaignEmail(campaign);
  const result = await sendEmailMessage({ to: normalizeEmail(email), ...rendered, category: 'campaign-test' });
  campaign.testSentAt = new Date();
  await campaign.save();
  return result;
};

export const sendCampaign = async (id, adminId) => {
  const campaign = await EmailCampaign.findById(id);
  if (!campaign) throw AppError('Campaign not found', 404);
  if (campaign.status !== 'draft') throw AppError('Only draft campaigns can be sent', 400);
  if (!campaign.testSentAt) throw AppError('Send a test email before sending this campaign', 400);

  const recipients = await resolveRecipients(campaign);
  if (recipients.length === 0) throw AppError('Campaign audience has no recipients', 400);

  campaign.status = 'sending';
  campaign.sentBy = adminId;
  campaign.sentAt = new Date();
  campaign.recipientCount = recipients.length;
  campaign.stats = { sent: 0, failed: 0, skipped: 0 };
  await campaign.save();

  await EmailDeliveryLog.deleteMany({ campaignId: campaign._id });
  await EmailDeliveryLog.insertMany(recipients.map((recipient) => ({
    campaignId: campaign._id,
    userId: recipient._id,
    email: normalizeEmail(recipient.email),
    status: 'queued',
  })));

  const queue = getEmailQueue();
  const job = await addJob(queue, JOB_NAMES.emailCampaign, {
    type: JOB_NAMES.emailCampaign,
    campaignId: String(campaign._id),
  }, JOB_OPTIONS.emailRetry);

  if (!job) {
    await processCampaign(campaign._id);
  }

  return EmailCampaign.findById(campaign._id).lean();
};

export const cancelCampaign = async (id) => {
  const campaign = await EmailCampaign.findById(id);
  if (!campaign) throw AppError('Campaign not found', 404);
  if (!['draft', 'sending'].includes(campaign.status)) throw AppError('Campaign cannot be cancelled', 400);
  campaign.status = 'cancelled';
  campaign.cancelledAt = new Date();
  await campaign.save();
  return campaign;
};

export const listDeliveryLogs = async ({ campaignId, page = 1, limit = 25, status }) => {
  const query = { campaignId };
  if (status) query.status = status;
  const skip = (Number(page) - 1) * Number(limit);
  const [logs, total] = await Promise.all([
    EmailDeliveryLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    EmailDeliveryLog.countDocuments(query),
  ]);
  return { logs, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

export const processCampaign = async (campaignId) => {
  const campaign = await EmailCampaign.findById(campaignId);
  if (!campaign || campaign.status === 'cancelled') return null;

  const rendered = renderCampaignEmail(campaign);
  let hasMore = true;

  while (hasMore) {
    const logs = await EmailDeliveryLog.find({ campaignId, status: 'queued' }).limit(100);
    hasMore = logs.length > 0;

    for (const log of logs) {
      const latestCampaign = await EmailCampaign.findById(campaignId).select('status');
      if (!latestCampaign || latestCampaign.status === 'cancelled') {
        hasMore = false;
        break;
      }

      try {
        const result = await sendEmailMessage({ to: log.email, ...rendered, category: 'admin-campaign' });
        log.status = 'sent';
        log.provider = result.provider;
        log.messageId = result.messageId;
        log.sentAt = new Date();
      } catch (error) {
        log.status = 'failed';
        log.error = error?.message || 'Email failed';
      }
      await log.save();
    }
  }

  const [sent, failed, queued] = await Promise.all([
    EmailDeliveryLog.countDocuments({ campaignId, status: 'sent' }),
    EmailDeliveryLog.countDocuments({ campaignId, status: 'failed' }),
    EmailDeliveryLog.countDocuments({ campaignId, status: 'queued' }),
  ]);

  campaign.stats = { sent, failed, skipped: 0 };
  if (queued === 0) campaign.status = failed > 0 && sent === 0 ? 'failed' : 'sent';
  await campaign.save();
  return campaign;
};
