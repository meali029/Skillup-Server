import AdminSettings from '../../models/AdminSettings.js';
import createAppError from '../../core/errors/AppError.js';

const AppError = createAppError;

/**
 * Admin Settings Service
 * Manages admin-configurable settings including AI feature flags
 */
class AdminSettingsService {
  /**
   * Get current admin settings
   */
  async getSettings() {
    try {
      const settings = await AdminSettings.getSettings();
      return settings;
    } catch (error) {
      throw AppError('Failed to retrieve admin settings', 500);
    }
  }

  /**
   * Update admin settings
   * @param {Object} updates - Settings to update
   * @param {string} adminId - Admin user ID making the change
   */
  async updateSettings(updates, adminId) {
    try {
      // Validate updates
      const allowedFields = [
        'aiEnabled',
        'aiJobRecommendations',
        'aiFreelancerRecommendations',
        'aiProposalGeneration',
        'aiMatchScoreEnhancement',
        'aiProvider',
      ];

      const validatedUpdates = {};
      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
          validatedUpdates[key] = updates[key];
        }
      });

      const settings = await AdminSettings.updateSettings(validatedUpdates);
      
      // Log the change (could add audit log here)
      console.log(`[Admin Settings] Updated by admin ${adminId}:`, validatedUpdates);

      return settings;
    } catch (error) {
      throw AppError('Failed to update admin settings', 500);
    }
  }

  /**
   * Check if AI is enabled globally
   */
  async isAIEnabled() {
    try {
      const settings = await this.getSettings();
      return settings.aiEnabled === true;
    } catch (error) {
      console.error('[Admin Settings] Error checking AI enabled:', error);
      return false; // Fail safe - default to disabled
    }
  }

  /**
   * Check if specific AI feature is enabled
   * @param {string} feature - Feature name
   */
  async isFeatureEnabled(feature) {
    try {
      const settings = await this.getSettings();
      
      // First check global AI toggle
      if (!settings.aiEnabled) {
        return false;
      }

      // Then check feature-specific toggle
      const featureMap = {
        jobRecommendations: 'aiJobRecommendations',
        freelancerRecommendations: 'aiFreelancerRecommendations',
        proposalGeneration: 'aiProposalGeneration',
        matchScoreEnhancement: 'aiMatchScoreEnhancement',
      };

      const featureKey = featureMap[feature];
      if (!featureKey) {
        return false;
      }

      return settings[featureKey] === true;
    } catch (error) {
      console.error(`[Admin Settings] Error checking feature ${feature}:`, error);
      return false; // Fail safe
    }
  }

  /**
   * Get AI provider setting
   */
  async getAIProvider() {
    try {
      const settings = await this.getSettings();
      return settings.aiProvider || 'gemini';
    } catch (error) {
      return 'gemini'; // Default
    }
  }
}

export default new AdminSettingsService();

