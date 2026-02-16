import crypto from 'crypto';
import axios from 'axios';
import { createAppError } from '../../core/errors/index.js';
import paymentModeService from './paymentMode.service.js';
import mockPaymentService from './mockPayment.service.js';
import { getEnv } from '../../core/utils/envLoader.js';

/**
 * JazzCash Payment Gateway Service
 * Handles JazzCash payment initialization, verification, and withdrawal processing
 */
class JazzCashService {
  constructor() {
    this.mockService = mockPaymentService;
    console.log('[JazzCashService] Initialized - mode will be checked dynamically on each request');
  }

  /**
   * Get credentials dynamically (reads from DB cache)
   */
  getCredentials() {
    return {
      merchantId: getEnv('JAZZCASH_MERCHANT_ID'),
      password: getEnv('JAZZCASH_PASSWORD'),
      integrationKey: getEnv('JAZZCASH_INTEGRATION_KEY'),
      returnUrl: getEnv('JAZZCASH_RETURN_URL') || `${getEnv('CLIENT_URL')}/payment/callback/jazzcash`,
      sandbox: getEnv('JAZZCASH_SANDBOX') === 'true',
    };
  }

  /**
   * Get base URL based on sandbox mode
   */
  getBaseUrl() {
    const { sandbox } = this.getCredentials();
    return sandbox
      ? 'https://sandbox.jazzcash.com.pk'
      : 'https://jazzcash.com.pk';
  }

  /**
   * Generate secure hash for JazzCash payment
   */
  generateHash(data, integrationKey) {
    const string = Object.keys(data)
      .sort()
      .map((key) => `${key}=${data[key]}`)
      .join('&');
    return crypto
      .createHash('sha256')
      .update(string)
      .digest('hex')
      .toUpperCase();
  }

  /**
   * Initialize payment with JazzCash
   * @param {Object} paymentData - Payment details
   * @returns {Promise<Object>} Payment initialization response with redirect URL
   */
  async initializePayment(paymentData) {
    // Check payment mode dynamically (in case it changed)
    const isTesting = paymentModeService.isTestingModeSync();
    
    // If in testing mode, use mock service
    if (isTesting) {
      console.log('[JazzCashService] TESTING MODE - Using mock service for payment initialization');
      return this.mockService.initializePayment(paymentData);
    }

    // PRODUCTION MODE - Use real JazzCash API
    console.log('[JazzCashService] PRODUCTION MODE - Using real JazzCash API');
    
    const { amount, orderId, customerEmail, customerName, customerPhone } = paymentData;
    const creds = this.getCredentials();

    if (!creds.merchantId || !creds.password || !creds.integrationKey) {
      throw createAppError('JazzCash credentials not configured. Please configure in Admin Settings.', 500);
    }

    const ppAmount = Math.round(amount * 100); // Convert to paisa
    const ppBillReference = orderId;
    const ppDescription = `Payment for order ${orderId}`;
    const ppTxnDateTime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];

    const payload = {
      pp_Version: '1.1',
      pp_TxnType: 'MWALLET',
      pp_Language: 'EN',
      pp_MerchantID: creds.merchantId,
      pp_SubMerchantID: '',
      pp_Password: creds.password,
      pp_BankID: '',
      pp_ProductID: '',
      pp_TxnRefNo: `TXN${Date.now()}`,
      pp_Amount: ppAmount.toString(),
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: ppTxnDateTime,
      pp_BillReference: ppBillReference,
      pp_Description: ppDescription,
      pp_TxnExpiryDateTime: '',
      pp_ReturnURL: creds.returnUrl,
      pp_SecureHash: '',
      ppmpf_1: customerEmail || '',
      ppmpf_2: customerName || '',
      ppmpf_3: customerPhone || '',
      ppmpf_4: '',
      ppmpf_5: '',
    };

    // Generate secure hash
    payload.pp_SecureHash = this.generateHash(payload, creds.integrationKey);
    const baseUrl = this.getBaseUrl();

    try {
      // In sandbox mode, return mock payment URL for JazzCash testing
      if (creds.sandbox) {
        console.log('[JazzCashService] PRODUCTION (Sandbox) - Using JazzCash sandbox');
        return {
          success: true,
          paymentUrl: `${baseUrl}/payment?txnRef=${payload.pp_TxnRefNo}`,
          transactionRef: payload.pp_TxnRefNo,
          orderId: ppBillReference,
        };
      }

      // Production mode - make actual API call to JazzCash
      console.log('[JazzCashService] PRODUCTION (Live) - Making real API call to JazzCash');
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
        throw createAppError('Invalid response from JazzCash API', 500);
      }

      return {
        success: true,
        paymentUrl: response.data.paymentUrl || `${baseUrl}/payment?txnRef=${payload.pp_TxnRefNo}`,
        transactionRef: payload.pp_TxnRefNo,
        orderId: ppBillReference,
      };
    } catch (error) {
      if (error.response) {
        // API responded with error status
        throw createAppError(
          `JazzCash payment initialization failed: ${error.response.data?.message || error.response.statusText}`,
          500
        );
      } else if (error.request) {
        // Request made but no response
        throw createAppError(
          'JazzCash payment gateway is not responding. Please try again later.',
          503
        );
      } else {
        // Error in request setup
        throw createAppError(
          `JazzCash payment initialization failed: ${error.message}`,
          500
        );
      }
    }
  }

  /**
   * Verify payment callback from JazzCash
   * @param {Object} callbackData - Callback data from JazzCash
   * @returns {Promise<Object>} Verification result
   */
  async verifyPayment(callbackData) {
    // Check payment mode dynamically (in case it changed)
    const isTesting = paymentModeService.isTestingModeSync();
    
    // If in testing mode, use mock service
    if (isTesting) {
      console.log('[JazzCashService] TESTING MODE - Using mock service for payment verification');
      return this.mockService.verifyPayment(callbackData);
    }

    // PRODUCTION MODE
    console.log('[JazzCashService] PRODUCTION MODE - Verifying real JazzCash payment');
    const creds = this.getCredentials();

    const {
      pp_TxnRefNo,
      pp_ResponseCode,
      pp_ResponseMessage,
      pp_SecureHash,
      pp_Amount,
      pp_BillReference,
    } = callbackData;

    // Verify secure hash
    const calculatedHash = this.generateHash(callbackData, creds.integrationKey);
    if (calculatedHash !== pp_SecureHash) {
      throw createAppError('Invalid payment hash', 400);
    }

    // Check response code (000 means success)
    const isSuccess = pp_ResponseCode === '000';

    return {
      success: isSuccess,
      transactionRef: pp_TxnRefNo,
      orderId: pp_BillReference,
      amount: parseFloat(pp_Amount) / 100, // Convert from paisa to PKR
      responseCode: pp_ResponseCode,
      responseMessage: pp_ResponseMessage,
      gatewayTransactionId: pp_TxnRefNo,
    };
  }

  /**
   * Process withdrawal to JazzCash account
   * @param {Object} withdrawalData - Withdrawal details
   * @returns {Promise<Object>} Withdrawal processing result
   */
  async processWithdrawal(withdrawalData) {
    // Check payment mode dynamically (in case it changed)
    const isTesting = paymentModeService.isTestingModeSync();
    
    // If in testing mode, use mock service
    if (isTesting) {
      console.log('[JazzCashService] TESTING MODE - Using mock service for withdrawal');
      return this.mockService.processWithdrawal(withdrawalData);
    }

    // PRODUCTION MODE
    console.log('[JazzCashService] PRODUCTION MODE - Processing real JazzCash withdrawal');
    const creds = this.getCredentials();
    const { amount, accountNumber, phoneNumber, cnic } = withdrawalData;

    if (!creds.merchantId || !creds.password) {
      throw createAppError('JazzCash credentials not configured. Please configure in Admin Settings.', 500);
    }

    const ppAmount = Math.round(amount * 100); // Convert to paisa
    const ppTxnRefNo = `WD${Date.now()}`;
    const ppTxnDateTime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];

    const payload = {
      pp_Version: '1.1',
      pp_TxnType: 'MWALLET',
      pp_MerchantID: creds.merchantId,
      pp_Password: creds.password,
      pp_TxnRefNo: ppTxnRefNo,
      pp_Amount: ppAmount.toString(),
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: ppTxnDateTime,
      pp_AccountNumber: accountNumber,
      pp_PhoneNumber: phoneNumber,
      pp_CNIC: cnic,
    };

    const baseUrl = this.getBaseUrl();

    try {
      if (creds.sandbox) {
        // Sandbox mode - return mock success
        console.log('[JazzCashService] PRODUCTION (Sandbox) - Using JazzCash sandbox for withdrawal');
        return {
          success: true,
          transactionId: ppTxnRefNo,
          gatewayTransactionId: `JZ${Date.now()}`,
          amount: amount,
          status: 'SUCCESS',
        };
      }

      // Production mode - make actual API call
      console.log('[JazzCashService] PRODUCTION (Live) - Making real API call for withdrawal');
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
        throw createAppError('Invalid response from JazzCash API', 500);
      }

      return {
        success: response.data.success || false,
        transactionId: ppTxnRefNo,
        gatewayTransactionId: response.data.gatewayTransactionId || ppTxnRefNo,
        amount: amount,
        status: response.data.success ? 'SUCCESS' : 'FAILED',
        message: response.data.message || '',
      };
    } catch (error) {
      if (error.response) {
        throw createAppError(
          `JazzCash withdrawal failed: ${error.response.data?.message || error.response.statusText}`,
          500
        );
      } else if (error.request) {
        throw createAppError(
          'JazzCash payment gateway is not responding. Please try again later.',
          503
        );
      } else {
        throw createAppError(
          `JazzCash withdrawal failed: ${error.message}`,
          500
        );
      }
    }
  }
}

export default new JazzCashService();

