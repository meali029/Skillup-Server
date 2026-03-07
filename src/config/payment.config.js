/**
 * Payment Configuration
 * Centralized payment system configuration for test and production environments
 * 
 * Platform: SkillUp Pakistan
 * Currency: PKR (Pakistani Rupee)
 * Payment Methods: JazzCash, Easypaisa, Bank Transfer
 */

// Environment detection
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const IS_TEST_MODE = process.env.PAYMENT_MODE !== 'production';

// Currency Configuration
export const CURRENCY = {
  code: 'PKR',
  symbol: 'Rs.',
  name: 'Pakistani Rupee',
  decimalPlaces: 2,
  smallestUnit: 'paisa',
  conversionFactor: 100, // 1 PKR = 100 paisa
};

// Platform Fee Configuration (5% as requested)
export const PLATFORM_FEE = {
  percentage: 5,
  minimumFee: 50, // PKR 50 minimum fee
  maximumFee: 100000, // PKR 100,000 maximum fee
};

// Payment Limits (in PKR)
export const PAYMENT_LIMITS = {
  // Deposits
  minDeposit: 500, // PKR 500
  maxDeposit: 500000, // PKR 500,000
  
  // Withdrawals
  minWithdrawal: 1000, // PKR 1,000
  maxWithdrawal: 500000, // PKR 500,000
  dailyWithdrawalLimit: 500000, // PKR 500,000 per day
  
  // Auto-approval threshold (auto-approve withdrawals below this)
  autoApprovalLimit: 1000000, // PKR 10 lakh (auto-approve all as requested)
  
  // Contract (no minimum as requested)
  minContractValue: 0, // No minimum
  maxContractValue: 10000000, // PKR 1 crore
};

// Payment Timeouts (in milliseconds)
export const PAYMENT_TIMEOUTS = {
  paymentSession: 30 * 60 * 1000, // 30 minutes
  webhookRetry: 5 * 60 * 1000, // 5 minutes
  transactionExpiry: 24 * 60 * 60 * 1000, // 24 hours
};

// Escrow Configuration
export const ESCROW_CONFIG = {
  expiryDaysUnfunded: 7, // Expire unfunded escrow after 7 days
  expiryDaysDisputed: 30, // Hold disputed escrow for 30 days
  autoReleaseAfterDays: 14, // Auto-release after 14 days if no dispute
};

// JazzCash Configuration
export const JAZZCASH_CONFIG = {
  sandbox: {
    apiUrl: 'https://sandbox.jazzcash.com.pk/ApplicationAPI/API',
    paymentUrl: 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform',
  },
  production: {
    apiUrl: 'https://jazzcash.com.pk/ApplicationAPI/API',
    paymentUrl: 'https://jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform',
  },
  version: '1.1',
  language: 'EN',
  currency: 'PKR',
};

// Easypaisa Configuration
export const EASYPAISA_CONFIG = {
  sandbox: {
    apiUrl: 'https://easypaytestbed.easypaisa.com.pk/easypay-service',
  },
  production: {
    apiUrl: 'https://easypay.easypaisa.com.pk/easypay-service',
  },
};

// Safepay Configuration
export const SAFEPAY_CONFIG = {
  sandbox: {
    baseUrl: 'https://sandbox.api.getsafepay.com',
    checkoutUrl: 'https://sandbox.api.getsafepay.com/checkout',
  },
  production: {
    baseUrl: 'https://api.getsafepay.com',
    checkoutUrl: 'https://api.getsafepay.com/checkout',
  },
  currency: 'PKR',
};

// Test Mode Configuration
export const TEST_MODE_CONFIG = {
  enabled: IS_TEST_MODE,
  autoApproveDeposits: true,
  autoApproveWithdrawals: true,
  skipGatewayVerification: true,
  mockPaymentDelay: 1000, // 1 second fake processing
  testWalletInitialBalance: 0, // No free credit
};

// Payment Methods
export const PAYMENT_METHODS = {
  JAZZCASH: {
    code: 'JAZZCASH',
    name: 'JazzCash',
    icon: 'jazzcash',
    enabled: true,
    depositEnabled: true,
    withdrawalEnabled: true,
    minAmount: 10,
    maxAmount: 500000,
  },
  EASYPAISA: {
    code: 'EASYPAISA',
    name: 'Easypaisa',
    icon: 'easypaisa',
    enabled: true,
    depositEnabled: true,
    withdrawalEnabled: true,
    minAmount: 10,
    maxAmount: 500000,
  },
  BANK_TRANSFER: {
    code: 'BANK_TRANSFER',
    name: 'Bank Transfer',
    icon: 'bank',
    enabled: true,
    depositEnabled: true,
    withdrawalEnabled: true,
    minAmount: 1000,
    maxAmount: 10000000,
    processingDays: '2-3 business days',
  },
  SAFEPAY: {
    code: 'SAFEPAY',
    name: 'Safepay',
    icon: 'safepay',
    enabled: true,
    depositEnabled: true,
    withdrawalEnabled: false,
    minAmount: 10,
    maxAmount: 500000,
  },
};

// Calculate platform fee
export function calculatePlatformFee(amount) {
  let fee = Math.round((amount * PLATFORM_FEE.percentage) / 100);
  
  // Apply minimum and maximum
  fee = Math.max(fee, PLATFORM_FEE.minimumFee);
  fee = Math.min(fee, PLATFORM_FEE.maximumFee);
  
  return fee;
}

// Calculate freelancer amount after fee
export function calculateFreelancerAmount(totalAmount) {
  const platformFee = calculatePlatformFee(totalAmount);
  return totalAmount - platformFee;
}

// Validate deposit amount
export function isValidDepositAmount(amount) {
  return amount >= PAYMENT_LIMITS.minDeposit && amount <= PAYMENT_LIMITS.maxDeposit;
}

// Validate withdrawal amount
export function isValidWithdrawalAmount(amount) {
  return amount >= PAYMENT_LIMITS.minWithdrawal && amount <= PAYMENT_LIMITS.maxWithdrawal;
}

// Check if withdrawal should be auto-approved
export function shouldAutoApproveWithdrawal(amount) {
  return amount <= PAYMENT_LIMITS.autoApprovalLimit;
}

// Get current payment mode
export function getPaymentMode() {
  return IS_TEST_MODE ? 'testing' : 'production';
}

// Format currency for display
export function formatCurrency(amount, includeSymbol = true) {
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  
  return includeSymbol ? `${CURRENCY.symbol} ${formatted}` : formatted;
}

// Generate unique idempotency key
export function generateIdempotencyKey(prefix = 'TXN') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `${prefix}_${timestamp}_${random}`.toUpperCase();
}

export default {
  IS_PRODUCTION,
  IS_TEST_MODE,
  CURRENCY,
  PLATFORM_FEE,
  PAYMENT_LIMITS,
  PAYMENT_TIMEOUTS,
  ESCROW_CONFIG,
  JAZZCASH_CONFIG,
  EASYPAISA_CONFIG,
  SAFEPAY_CONFIG,
  TEST_MODE_CONFIG,
  PAYMENT_METHODS,
  calculatePlatformFee,
  calculateFreelancerAmount,
  isValidDepositAmount,
  isValidWithdrawalAmount,
  shouldAutoApproveWithdrawal,
  getPaymentMode,
  formatCurrency,
  generateIdempotencyKey,
};
