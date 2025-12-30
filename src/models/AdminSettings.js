import mongoose from 'mongoose';

/**
 * AdminSettings Model
 * Stores admin-configurable settings including AI feature flags
 */
const adminSettingsSchema = new mongoose.Schema(
  {
    // Global AI toggle
    aiEnabled: {
      type: Boolean,
      default: false,
    },

    // Feature-specific AI toggles
    aiJobRecommendations: {
      type: Boolean,
      default: false,
    },

    aiFreelancerRecommendations: {
      type: Boolean,
      default: false,
    },

    aiProposalGeneration: {
      type: Boolean,
      default: false,
    },

    aiMatchScoreEnhancement: {
      type: Boolean,
      default: false,
    },

    // AI Provider selection
    aiProvider: {
      type: String,
      enum: ['gemini', 'openai'],
      default: 'gemini',
    },

    // Additional settings
    settings: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only one settings document exists
adminSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

// Update settings
adminSettingsSchema.statics.updateSettings = async function(updates) {
  const settings = await this.getSettings();
  Object.keys(updates).forEach(key => {
    if (settings.schema.paths[key]) {
      settings[key] = updates[key];
    } else {
      settings.settings.set(key, updates[key]);
    }
  });
  await settings.save();
  return settings;
};

const AdminSettings = mongoose.models.AdminSettings || mongoose.model('AdminSettings', adminSettingsSchema);

export default AdminSettings;




