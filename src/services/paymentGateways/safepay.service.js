import crypto from 'crypto';
import axios from 'axios';
import { createAppError } from '../../core/errors/index.js';
import mockPaymentService from './mockPayment.service.js';
import { getEnv } from '../../core/utils/envLoader.js';
import { SAFEPAY_CONFIG } from '../../config/payment.config.js';

/**
 * Safepay Payment Gateway Service
 * Uses V1 init API (compatible with API key) + /embedded/ checkout (supports redirect).
 *
 * Flow:
 * 1. POST /order/v1/init → creates session, returns tracker token
 * 2. Redirect user to /embedded/?tracker=...&environment=...&redirect_url=...
 * 3. User completes payment on Safepay checkout
 * 4. Safepay redirects user back to redirect_url with tracker in query
 * 5. Callback handler verifies payment state and credits wallet
 */
class SafepayService {
  constructor() {
    this.mockService = mockPaymentService;
  }

  getCredentials() {
    return {
      apiKey: getEnv('SAFEPAY_API_KEY'),
      secretKey: getEnv('SAFEPAY_SECRET_KEY'),
      webhookSecret: getEnv('SAFEPAY_WEBHOOK_SECRET'),
      sandbox: getEnv('SAFEPAY_SANDBOX') !== 'false',
    };
  }

  getBaseUrl() {
    const { sandbox } = this.getCredentials();
    return sandbox ? SAFEPAY_CONFIG.sandbox.baseUrl : SAFEPAY_CONFIG.production.baseUrl;
  }

  getCheckoutUrl() {
    const { sandbox } = this.getCredentials();
    return sandbox ? SAFEPAY_CONFIG.sandbox.checkoutUrl : SAFEPAY_CONFIG.production.checkoutUrl;
  }

  /**
   * Initialize payment via V1 init + embedded checkout
   */
  async initializePayment(paymentData) {
    const { amount, orderId } = paymentData;
    const creds = this.getCredentials();

    if (!creds.apiKey) {
      throw createAppError('Safepay credentials not configured. Please configure in Admin Settings.', 500);
    }

    const baseUrl = this.getBaseUrl();
    const callbackUrl = getEnv('SAFEPAY_CALLBACK_URL') ||
      `${getEnv('SERVER_URL') || getEnv('API_URL') || 'http://localhost:5000'}/api/payments/callback/safepay`;
    const cancelUrl = `${getEnv('CLIENT_URL') || 'http://localhost:5173'}/wallet?payment=cancelled`;
    const environment = creds.sandbox ? 'sandbox' : 'production';

    try {
      // Step 1: Create session via V1 init (uses API key as "client")
      const initResponse = await axios.post(
        `${baseUrl}/order/v1/init`,
        {
          client: creds.apiKey,
          amount: Math.round(amount), // V1 API expects amount in PKR
          currency: 'PKR',
          environment,
          order_id: orderId,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        }
      );

      const tracker = initResponse.data?.data?.token;

      if (!tracker) {
        console.error('Safepay: No tracker in V1 init response:', initResponse.data);
        throw createAppError('Failed to create Safepay payment session', 500);
      }

      console.log('Safepay: V1 session created, tracker:', tracker);

      // Step 2: Build checkout URL
      // Use /checkout with beacon param (compatible with V1 init tokens)
      const checkoutBase = this.getCheckoutUrl();
      const checkoutParams = new URLSearchParams({
        beacon: tracker,
        entry: 'plain',
        env: environment,
        source: 'custom',
        redirect_url: callbackUrl,
        cancel_url: cancelUrl,
      });
      const paymentUrl = `${checkoutBase}?${checkoutParams.toString()}`;

      console.log('Safepay: Checkout URL built');

      return {
        success: true,
        paymentUrl,
        transactionRef: tracker,
        orderId,
      };
    } catch (error) {
      if (error.statusCode) throw error;
      console.error('Safepay initialization error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw createAppError(
        `Safepay payment initialization failed: ${error.response?.data?.message || error.message}`,
        500
      );
    }
  }

  verifyWebhookSignature(rawBody, signature) {
    const { webhookSecret } = this.getCredentials();
    if (!webhookSecret || !signature) return false;

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
      .digest('hex');

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    // timingSafeEqual throws if lengths differ
    if (sigBuffer.length !== expectedBuffer.length) return false;

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  }

  /**
   * Verify payment from webhook or callback data
   */
  async verifyPayment(callbackData) {
    const {
      tracker,
      order_id: orderId,
      type: eventType,
      data: eventData,
    } = callbackData;

    // Webhook POST — use event data directly
    if (eventData) {
      const isSuccess = eventType === 'payment:completed'
        || eventData.state === 'PAID'
        || eventData.state === 'TRACKER_ENDED';
      return {
        success: isSuccess,
        transactionRef: eventData.tracker || tracker,
        orderId: eventData.order_id || eventData.metadata?.order_id || orderId,
        amount: eventData.net_amount != null ? eventData.net_amount : (eventData.amount != null ? eventData.amount : 0),
        responseCode: isSuccess ? '000' : '001',
        responseMessage: isSuccess ? 'Payment successful via Safepay' : 'Payment failed',
        gatewayTransactionId: eventData.reference_code || eventData.tracker || tracker,
      };
    }

    // Callback redirect — verify via API
    if (tracker) {
      return this.verifyPaymentByTracker(tracker, orderId);
    }

    return { success: false, responseMessage: 'No tracker or event data provided' };
  }

  /**
   * Verify payment status by checking tracker state
   */
  async verifyPaymentByTracker(tracker, orderId) {
    const baseUrl = this.getBaseUrl();
    const creds = this.getCredentials();

    try {
      // V1 tracker status endpoint
      const response = await axios.get(
        `${baseUrl}/order/v1/${tracker}`,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        }
      );

      const data = response.data?.data || response.data;
      const state = data?.state;
      const isPaid = state === 'TRACKER_ENDED' || state === 'PAID';

      console.log('Safepay verifyByTracker:', {
        state,
        isPaid,
        tracker,
      });

      return {
        success: isPaid,
        transactionRef: tracker,
        orderId: data?.order_id || orderId,
        amount: data?.amount != null ? data.amount : 0, // V1 returns amount in PKR
        responseCode: isPaid ? '000' : '001',
        responseMessage: isPaid ? 'Payment verified via Safepay' : `Payment status: ${state || 'unknown'}`,
        gatewayTransactionId: data?.reference_code || tracker,
      };
    } catch (error) {
      console.error('Safepay verification error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      return {
        success: false,
        transactionRef: tracker,
        orderId,
        responseMessage: `Verification failed: ${error.message}`,
      };
    }
  }

  async processWithdrawal(withdrawalData) {
    return this.mockService.processWithdrawal(withdrawalData);
  }
}

export default new SafepayService();
