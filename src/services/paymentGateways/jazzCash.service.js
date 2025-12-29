import crypto from 'crypto';
import axios from 'axios';
import { createAppError } from '../../core/errors/index.js';
import paymentModeService from './paymentMode.service.js';
import mockPaymentService from './mockPayment.service.js';

/**
 * JazzCash Payment Gateway Service
 * Handles JazzCash payment initialization, verification, and withdrawal processing
 */
class JazzCashService {
  constructor() {
    // Check payment mode (testing or production)
    this.isTesting = paymentModeService.isTestingModeSync();
    
    if (this.isTesting) {
      // In testing mode, use mock service
      this.mockService = mockPaymentService;
      console.log('[JazzCashService] Initialized in TESTING mode - using mock service');
    } else {
      // In production mode, load real credentials
      this.merchantId = process.env.JAZZCASH_MERCHANT_ID;
      this.password = process.env.JAZZCASH_PASSWORD;
      this.integrationKey = process.env.JAZZCASH_INTEGRATION_KEY;
      this.returnUrl = process.env.JAZZCASH_RETURN_URL || `${process.env.CLIENT_URL}/payment/callback/jazzcash`;
      this.sandbox = process.env.JAZZCASH_SANDBOX === 'true';
      this.baseUrl = this.sandbox
        ? 'https://sandbox.jazzcash.com.pk'
        : 'https://jazzcash.com.pk';
      console.log('[JazzCashService] Initialized in PRODUCTION mode');
    }
  }

  /**
   * Generate secure hash for JazzCash payment
   */
  generateHash(data) {
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
      if (!this.mockService) {
        console.error('[JazzCashService] Mock service not initialized!');
        this.mockService = mockPaymentService;
      }
      console.log('[JazzCashService] Using mock service for payment initialization');
      return this.mockService.initializePayment(paymentData);
    }

    const { amount, orderId, customerEmail, customerName, customerPhone } = paymentData;

    if (!this.merchantId || !this.password || !this.integrationKey) {
      throw createAppError('JazzCash credentials not configured', 500);
    }

    const ppAmount = Math.round(amount * 100); // Convert to paisa
    const ppBillReference = orderId;
    const ppDescription = `Payment for order ${orderId}`;
    const ppTxnDateTime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];

    const payload = {
      pp_Version: '1.1',
      pp_TxnType: 'MWALLET',
      pp_Language: 'EN',
      pp_MerchantID: this.merchantId,
      pp_SubMerchantID: '',
      pp_Password: this.password,
      pp_BankID: '',
      pp_ProductID: '',
      pp_TxnRefNo: `TXN${Date.now()}`,
      pp_Amount: ppAmount.toString(),
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: ppTxnDateTime,
      pp_BillReference: ppBillReference,
      pp_Description: ppDescription,
      pp_TxnExpiryDateTime: '',
      pp_ReturnURL: this.returnUrl,
      pp_SecureHash: '',
      ppmpf_1: customerEmail || '',
      ppmpf_2: customerName || '',
      ppmpf_3: customerPhone || '',
      ppmpf_4: '',
      ppmpf_5: '',
    };

    // Generate secure hash
    payload.pp_SecureHash = this.generateHash(payload);

    try {
      // In production, this would POST to JazzCash API
      // For now, return mock response structure
      if (this.sandbox) {
        // Sandbox mode - return mock payment URL
        return {
          success: true,
          paymentUrl: `${this.baseUrl}/payment?txnRef=${payload.pp_TxnRefNo}`,
          transactionRef: payload.pp_TxnRefNo,
          orderId: ppBillReference,
        };
      }

      // Production mode - make actual API call
      const response = await axios.post(
        `${this.baseUrl}/api/payment/initiate`,
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
        paymentUrl: response.data.paymentUrl || `${this.baseUrl}/payment?txnRef=${payload.pp_TxnRefNo}`,
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
      return this.mockService.verifyPayment(callbackData);
    }

    const {
      pp_TxnRefNo,
      pp_ResponseCode,
      pp_ResponseMessage,
      pp_SecureHash,
      pp_Amount,
      pp_BillReference,
    } = callbackData;

    // Verify secure hash
    const calculatedHash = this.generateHash(callbackData);
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
      return this.mockService.processWithdrawal(withdrawalData);
    }

    const { amount, accountNumber, phoneNumber, cnic } = withdrawalData;

    if (!this.merchantId || !this.password) {
      throw createAppError('JazzCash credentials not configured', 500);
    }

    const ppAmount = Math.round(amount * 100); // Convert to paisa
    const ppTxnRefNo = `WD${Date.now()}`;
    const ppTxnDateTime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];

    const payload = {
      pp_Version: '1.1',
      pp_TxnType: 'MWALLET',
      pp_MerchantID: this.merchantId,
      pp_Password: this.password,
      pp_TxnRefNo: ppTxnRefNo,
      pp_Amount: ppAmount.toString(),
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: ppTxnDateTime,
      pp_AccountNumber: accountNumber,
      pp_PhoneNumber: phoneNumber,
      pp_CNIC: cnic,
    };

    try {
      if (this.sandbox) {
        // Sandbox mode - return mock success
        return {
          success: true,
          transactionId: ppTxnRefNo,
          gatewayTransactionId: `JZ${Date.now()}`,
          amount: amount,
          status: 'SUCCESS',
        };
      }

      // Production mode - make actual API call
      const response = await axios.post(
        `${this.baseUrl}/api/withdrawal`,
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

