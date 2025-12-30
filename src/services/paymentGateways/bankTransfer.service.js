import { createAppError } from '../../core/errors/index.js';
import paymentModeService from './paymentMode.service.js';
import mockPaymentService from './mockPayment.service.js';

/**
 * Bank Transfer Service
 * Handles bank transfer payment processing and withdrawal
 * Note: Bank transfers typically require manual processing
 */
class BankTransferService {
  constructor() {
    // Check payment mode (testing or production)
    this.isTesting = paymentModeService.isTestingModeSync();
    
    if (this.isTesting) {
      // In testing mode, use mock service
      this.mockService = mockPaymentService;
    } else {
      // In production mode
      this.sandbox = process.env.BANK_TRANSFER_SANDBOX === 'true';
    }
  }

  /**
   * Initialize bank transfer payment
   * For bank transfers, we provide bank details for manual transfer
   * @param {Object} paymentData - Payment details
   * @returns {Promise<Object>} Bank transfer instructions
   */
  async initializePayment(paymentData) {
    // Check payment mode dynamically (in case it changed)
    const isTesting = paymentModeService.isTestingModeSync();
    
    // If in testing mode, use mock service (but still return bank account details for testing)
    if (isTesting) {
      const mockResult = await this.mockService.initializePayment(paymentData);
      // For bank transfers in testing mode, still provide bank account details
      const bankAccount = {
        accountNumber: process.env.BANK_ACCOUNT_NUMBER || '1234567890',
        accountTitle: process.env.BANK_ACCOUNT_TITLE || 'SkillUp Platform (TEST)',
        bankName: process.env.BANK_NAME || 'Test Bank',
        branchName: process.env.BANK_BRANCH || 'Test Branch',
        iban: process.env.BANK_IBAN || 'PK00TEST0000000000000000',
        swiftCode: process.env.BANK_SWIFT || 'TESTCODE',
      };
      return {
        ...mockResult,
        paymentMethod: 'BANK_TRANSFER',
        bankAccount: bankAccount,
        referenceNumber: mockResult.transactionRef,
        instructions: `[TEST MODE] Please transfer PKR ${paymentData.amount} to the following account and use reference: ${mockResult.transactionRef}`,
        requiresManualVerification: false, // In testing mode, auto-verify
      };
    }

    const { amount, orderId, customerName } = paymentData;

    // Bank account details (should be in environment variables)
    const bankAccount = {
      accountNumber: process.env.BANK_ACCOUNT_NUMBER || '1234567890',
      accountTitle: process.env.BANK_ACCOUNT_TITLE || 'SkillUp Platform',
      bankName: process.env.BANK_NAME || 'Bank Name',
      branchName: process.env.BANK_BRANCH || 'Main Branch',
      iban: process.env.BANK_IBAN || 'PK00XXXX0000000000000000',
      swiftCode: process.env.BANK_SWIFT || 'SWIFTCODE',
    };

    // Generate reference number for tracking
    const referenceNumber = `BT${Date.now()}-${orderId}`;

    return {
      success: true,
      paymentMethod: 'BANK_TRANSFER',
      referenceNumber: referenceNumber,
      orderId: orderId,
      amount: amount,
      bankAccount: bankAccount,
      instructions: `Please transfer PKR ${amount} to the following account and use reference: ${referenceNumber}`,
      // For bank transfers, payment is not immediate
      requiresManualVerification: true,
    };
  }

  /**
   * Verify bank transfer payment
   * This must be called after admin verifies the bank transfer
   * @param {Object} verificationData - Verification data
   * @returns {Promise<Object>} Verification result
   */
  async verifyPayment(verificationData) {
    // Check payment mode dynamically (in case it changed)
    const isTesting = paymentModeService.isTestingModeSync();
    
    // If in testing mode, use mock service (auto-verify)
    if (isTesting) {
      return this.mockService.verifyPayment(verificationData);
    }

    const { referenceNumber, transactionId, amount, verifiedBy } = verificationData;

    // Bank transfers require admin verification
    if (!verifiedBy) {
      throw createAppError('Bank transfer verification requires admin approval', 400);
    }

    // In a real system, this would check against bank statements or admin verification
    // For now, we require verifiedBy to be present (admin must verify)

    return {
      success: true,
      transactionRef: referenceNumber,
      transactionId: transactionId,
      amount: amount,
      verifiedBy: verifiedBy,
      gatewayTransactionId: transactionId,
    };
  }

  /**
   * Process withdrawal via bank transfer
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

    const {
      amount,
      accountNumber,
      accountName,
      bankName,
      branchName,
      iban,
      swiftCode,
    } = withdrawalData;

    if (!accountNumber || !accountName || !bankName) {
      throw createAppError('Bank account details are required', 400);
    }

    // Generate transaction reference
    const transactionRef = `BTWD${Date.now()}`;

    // In a real system, this would initiate actual bank transfer
    // For now, return processing status
    // Bank transfers typically take 1-3 business days

    return {
      success: true,
      transactionId: transactionRef,
      gatewayTransactionId: transactionRef,
      amount: amount,
      status: 'PROCESSING', // Bank transfers are not instant
      estimatedCompletion: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
      message: 'Bank transfer initiated. Funds will be transferred within 1-3 business days.',
    };
  }

  /**
   * Get bank account details for deposits
   * @returns {Object} Bank account information
   */
  getBankAccountDetails() {
    return {
      accountNumber: process.env.BANK_ACCOUNT_NUMBER || '1234567890',
      accountTitle: process.env.BANK_ACCOUNT_TITLE || 'SkillUp Platform',
      bankName: process.env.BANK_NAME || 'Bank Name',
      branchName: process.env.BANK_BRANCH || 'Main Branch',
      iban: process.env.BANK_IBAN || 'PK00XXXX0000000000000000',
      swiftCode: process.env.BANK_SWIFT || 'SWIFTCODE',
    };
  }
}

export default new BankTransferService();

