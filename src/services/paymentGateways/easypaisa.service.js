import crypto from 'crypto';
import axios from 'axios';
import { createAppError } from '../../core/errors/index.js';
import paymentModeService from './paymentMode.service.js';
import mockPaymentService from './mockPayment.service.js';
import { getEnv } from '../../core/utils/envLoader.js';

/**
 * Easypaisa Payment Gateway Service
 * Handles Easypaisa payment initialization, verification, and withdrawal processing
 */
class EasypaisaService {
  constructor() {
    this.mockService = mockPaymentService;
  }

  /**
   * Get credentials dynamically (reads from DB cache)
   */
  getCredentials() {
    return {
      merchantId: getEnv('EASYPAISA_MERCHANT_ID'),
      storeId: getEnv('EASYPAISA_STORE_ID'),
      hashKey: getEnv('EASYPAISA_HASH_KEY'),
      returnUrl: getEnv('EASYPAISA_RETURN_URL') || `${getEnv('CLIENT_URL')}/payment/callback/easypaisa`,
      sandbox: getEnv('EASYPAISA_SANDBOX') === 'true',
    };
  }

  /**
   * Get base URL based on sandbox mode
   */
  getBaseUrl() {
    const { sandbox } = this.getCredentials();
    return sandbox
      ? 'https://easypaystg.easypaisa.com.pk'
      : 'https://easypay.easypaisa.com.pk';
  }

  /**
   * Generate secure hash for Easypaisa payment
   */
  generateHash(data, hashKey) {
    const string = Object.keys(data)
      .sort()
      .map((key) => `${key}=${data[key]}`)
      .join('&');
    return crypto
      .createHash('sha256')
      .update(string + hashKey)
      .digest('hex')
      .toUpperCase();
  }

  /**
   * Initialize payment with Easypaisa
   * @param {Object} paymentData - Payment details
   * @returns {Promise<Object>} Payment initialization response with redirect URL
   */
  async initializePayment(paymentData) {
    // Check payment mode dynamically (in case it changed)
    const isTesting = paymentModeService.isTestingModeSync();
    
    // If in testing mode, use mock service
    if (isTesting) {
      return this.mockService.initializePayment(paymentData);
    }

    // PRODUCTION MODE - Use real Easypaisa API
    const { amount, orderId, customerEmail, customerName, customerPhone } = paymentData;
    const creds = this.getCredentials();

    if (!creds.merchantId || !creds.storeId || !creds.hashKey) {
      throw createAppError('Easypaisa credentials not configured. Please configure in Admin Settings.', 500);
    }

    const amountStr = amount.toString();
    const orderDateTime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
    const transactionRefNumber = `TXN${Date.now()}`;

    const payload = {
      storeId: creds.storeId,
      merchantId: creds.merchantId,
      orderRefNum: orderId,
      orderDateTime: orderDateTime,
      orderAmount: amountStr,
      postBackURL: creds.returnUrl,
      transactionRefNumber: transactionRefNumber,
      merchantName: 'SkillUp',
      merchantEmail: 'support@skillup.pk',
      merchantContact: customerPhone || '',
      customerEmail: customerEmail || '',
      customerName: customerName || '',
      customerMobile: customerPhone || '',
    };

    // Generate secure hash
    payload.hashRequest = this.generateHash(payload, creds.hashKey);
    const baseUrl = this.getBaseUrl();

    try {
      if (creds.sandbox) {
        // Sandbox mode - return mock payment URL
        return {
          success: true,
          paymentUrl: `${baseUrl}/payment?orderRef=${orderId}&txnRef=${transactionRefNumber}`,
          transactionRef: transactionRefNumber,
          orderId: orderId,
        };
      }

      // Production mode - make actual API call
      const response = await axios.post(
        `${baseUrl}/api/payment/initiate`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      if (!response.data || response.status !== 200) {
        throw createAppError('Invalid response from Easypaisa API', 500);
      }

      return {
        success: true,
        paymentUrl: response.data.paymentUrl || `${baseUrl}/payment?orderRef=${orderId}`,
        transactionRef: transactionRefNumber,
        orderId: orderId,
      };
    } catch (error) {
      if (error.response) {
        throw createAppError(
          `Easypaisa payment initialization failed: ${error.response.data?.message || error.response.statusText}`,
          500
        );
      } else if (error.request) {
        throw createAppError(
          'Easypaisa payment gateway is not responding. Please try again later.',
          503
        );
      } else {
        throw createAppError(
          `Easypaisa payment initialization failed: ${error.message}`,
          500
        );
      }
    }
  }

  /**
   * Verify payment callback from Easypaisa
   * @param {Object} callbackData - Callback data from Easypaisa
   * @returns {Promise<Object>} Verification result
   */
  async verifyPayment(callbackData) {
    // Check payment mode dynamically (in case it changed)
    const isTesting = paymentModeService.isTestingModeSync();
    
    // If in testing mode, use mock service
    if (isTesting) {
      return this.mockService.verifyPayment(callbackData);
    }

    // PRODUCTION MODE
    const creds = this.getCredentials();

    const {
      orderRefNum,
      orderStatus,
      orderAmount,
      transactionRefNumber,
      hashResponse,
    } = callbackData;

    // Verify secure hash
    const calculatedHash = this.generateHash(callbackData, creds.hashKey);
    if (calculatedHash !== hashResponse) {
      throw createAppError('Invalid payment hash', 400);
    }

    // Check order status (Success means success)
    const isSuccess = orderStatus === 'Success';

    return {
      success: isSuccess,
      transactionRef: transactionRefNumber,
      orderId: orderRefNum,
      amount: parseFloat(orderAmount),
      responseCode: isSuccess ? '000' : '001',
      responseMessage: orderStatus,
      gatewayTransactionId: transactionRefNumber,
    };
  }

  /**
   * Process withdrawal to Easypaisa account
   * @param {Object} withdrawalData - Withdrawal details
   * @returns {Promise<Object>} Withdrawal processing result
   */
  async processWithdrawal(withdrawalData) {
    // Check payment mode dynamically (in case it changed)
    const isTesting = paymentModeService.isTestingModeSync();
    
    // If in testing mode, use mock service
    if (isTesting) {
      return this.mockService.processWithdrawal(withdrawalData);
    }

    // PRODUCTION MODE
    const creds = this.getCredentials();
    const { amount, accountNumber, phoneNumber, cnic } = withdrawalData;

    if (!creds.merchantId || !creds.storeId || !creds.hashKey) {
      throw createAppError('Easypaisa credentials not configured. Please configure in Admin Settings.', 500);
    }

    const amountStr = amount.toString();
    const transactionRefNumber = `WD${Date.now()}`;
    const orderDateTime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];

    const payload = {
      storeId: creds.storeId,
      merchantId: creds.merchantId,
      transactionRefNumber: transactionRefNumber,
      orderDateTime: orderDateTime,
      orderAmount: amountStr,
      accountNumber: accountNumber,
      phoneNumber: phoneNumber,
      cnic: cnic,
    };

    // Generate hash
    payload.hashRequest = this.generateHash(payload, creds.hashKey);
    const baseUrl = this.getBaseUrl();

    try {
      if (creds.sandbox) {
        // Sandbox mode - return mock success
        return {
          success: true,
          transactionId: transactionRefNumber,
          gatewayTransactionId: `EP${Date.now()}`,
          amount: amount,
          status: 'SUCCESS',
        };
      }

      // Production mode - make actual API call
      const response = await axios.post(
        `${baseUrl}/api/withdrawal`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      if (!response.data || response.status !== 200) {
        throw createAppError('Invalid response from Easypaisa API', 500);
      }

      return {
        success: response.data.success || false,
        transactionId: transactionRefNumber,
        gatewayTransactionId: response.data.gatewayTransactionId || transactionRefNumber,
        amount: amount,
        status: response.data.success ? 'SUCCESS' : 'FAILED',
        message: response.data.message || '',
      };
    } catch (error) {
      if (error.response) {
        throw createAppError(
          `Easypaisa withdrawal failed: ${error.response.data?.message || error.response.statusText}`,
          500
        );
      } else if (error.request) {
        throw createAppError(
          'Easypaisa payment gateway is not responding. Please try again later.',
          503
        );
      } else {
        throw createAppError(
          `Easypaisa withdrawal failed: ${error.message}`,
          500
        );
      }
    }
  }
}

export default new EasypaisaService();

