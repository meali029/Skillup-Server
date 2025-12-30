import { getEnv, getEnvWithRefresh } from '../../core/utils/envLoader.js';

/**
 * Payment Mode Service
 * Manages payment system mode (testing or production)
 */
class PaymentModeService {
  /**
   * Get current payment mode
   * @returns {Promise<string>} 'testing' or 'production'
   */
  async getMode() {
    const mode = await getEnvWithRefresh('PAYMENT_MODE', 'testing');
    return mode === 'production' ? 'production' : 'testing';
  }

  /**
   * Check if system is in testing mode
   * @returns {Promise<boolean>} True if in testing mode
   */
  async isTestingMode() {
    const mode = await this.getMode();
    return mode === 'testing';
  }

  /**
   * Check if system is in production mode
   * @returns {Promise<boolean>} True if in production mode
   */
  async isProductionMode() {
    const mode = await this.getMode();
    return mode === 'production';
  }

  /**
   * Get mode synchronously (uses cache)
   * @returns {string} 'testing' or 'production'
   */
  getModeSync() {
    const mode = getEnv('PAYMENT_MODE', 'testing');
    return mode === 'production' ? 'production' : 'testing';
  }

  /**
   * Check if in testing mode synchronously (uses cache)
   * @returns {boolean} True if in testing mode
   */
  isTestingModeSync() {
    return this.getModeSync() === 'testing';
  }
}

export default new PaymentModeService();

