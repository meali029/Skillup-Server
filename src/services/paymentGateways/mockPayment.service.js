import { createAppError } from '../../core/errors/index.js';

/**
 * Mock Payment Service
 * Simulates all payment operations for testing mode
 * Provides E2E testing without real merchant accounts
 */
class MockPaymentService {
  /**
   * Initialize mock payment
   * @param {Object} paymentData - Payment details
   * @returns {Promise<Object>} Mock payment initialization response
   */
  async initializePayment(paymentData) {
    const { amount, orderId } = paymentData;
    
    // Generate mock transaction reference
    const mockTransactionId = `MOCK${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Return mock payment URL that will trigger callback to backend API
    // The backend will handle the callback and redirect to frontend
    // Use SERVER_URL or construct from CLIENT_URL, or default to localhost
    let apiUrl = process.env.SERVER_URL || process.env.API_URL;
    if (!apiUrl) {
      // Try to construct from CLIENT_URL (remove /api if present)
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      // Extract base URL (remove port if it's the frontend port)
      const url = new URL(clientUrl);
      apiUrl = `${url.protocol}//${url.hostname}:5000`; // Default backend port
    }
    
    const paymentUrl = `${apiUrl}/api/payments/callback/mock?txnRef=${mockTransactionId}&orderId=${orderId}&amount=${amount}&status=success`;
    
    console.log('[MockPaymentService] Generated payment URL:', paymentUrl);
    
    return {
      success: true,
      paymentUrl: paymentUrl,
      transactionRef: mockTransactionId,
      orderId: orderId,
    };
  }

  /**
   * Verify mock payment callback
   * @param {Object} callbackData - Callback data
   * @returns {Promise<Object>} Verification result
   */
  async verifyPayment(callbackData) {
    const {
      txnRef,
      orderId,
      amount,
      status = 'success',
    } = callbackData;

    // In testing mode, we simulate successful payment
    const isSuccess = status === 'success' || status === 'Success' || !status;

    return {
      success: isSuccess,
      transactionRef: txnRef || `MOCK${Date.now()}`,
      orderId: orderId || callbackData.orderRefNum || callbackData.orderRef,
      amount: parseFloat(amount) || 0,
      responseCode: isSuccess ? '000' : '001',
      responseMessage: isSuccess ? 'Payment successful (TEST MODE)' : 'Payment failed (TEST MODE)',
      gatewayTransactionId: txnRef || `MOCK${Date.now()}`,
    };
  }

  /**
   * Process mock withdrawal
   * @param {Object} withdrawalData - Withdrawal details
   * @returns {Promise<Object>} Withdrawal processing result
   */
  async processWithdrawal(withdrawalData) {
    const { amount } = withdrawalData;
    
    // Simulate withdrawal processing delay (optional)
    // await new Promise(resolve => setTimeout(resolve, 1000));
    
    const mockTransactionId = `WD${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const mockGatewayId = `MOCK${Date.now()}`;

    return {
      success: true,
      transactionId: mockTransactionId,
      gatewayTransactionId: mockGatewayId,
      amount: amount,
      status: 'SUCCESS',
      message: 'Withdrawal processed successfully (TEST MODE)',
    };
  }

  /**
   * Generate hash for mock payment (for compatibility)
   * @param {Object} data - Data to hash
   * @returns {string} Mock hash
   */
  generateHash(data) {
    // Return a mock hash for testing
    return `MOCK_HASH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default new MockPaymentService();

