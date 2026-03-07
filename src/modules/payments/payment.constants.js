/**
 * Payment Module Constants
 * Centralized enums and business rules for payment management
 * 
 * NOTE: For full configuration, see config/payment.config.js
 */

// Payment method enumeration
export const PAYMENT_METHOD = {
  JAZZCASH: 'JAZZCASH',
  EASYPAISA: 'EASYPAISA',
  BANK_TRANSFER: 'BANK_TRANSFER',
  WALLET: 'WALLET',
  SYSTEM: 'SYSTEM',
  SAFEPAY: 'SAFEPAY',
};

// Transaction type enumeration
export const TRANSACTION_TYPE = {
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  ESCROW_FUND: 'ESCROW_FUND',
  ESCROW_RELEASE: 'ESCROW_RELEASE',
  ESCROW_REFUND: 'ESCROW_REFUND',
  PLATFORM_FEE: 'PLATFORM_FEE',
  REFUND: 'REFUND',
  FEE: 'FEE',
  ADJUSTMENT: 'ADJUSTMENT',
  BONUS: 'BONUS',
};

// Transaction direction
export const TRANSACTION_DIRECTION = {
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
};

// Escrow status enumeration
export const ESCROW_STATUS = {
  CREATED: 'CREATED',
  FUNDED: 'FUNDED',
  LOCKED: 'LOCKED',
  RELEASED: 'RELEASED',
  REFUNDED: 'REFUNDED',
  DISPUTED: 'DISPUTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
};

// Transaction status enumeration
export const TRANSACTION_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REVERSED: 'REVERSED',
};

// Withdrawal status enumeration
export const WITHDRAWAL_STATUS = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
};

// Payment amount limits (in PKR) - Updated as per requirements
export const PAYMENT_LIMITS = {
  MIN_DEPOSIT: Number(process.env.MIN_DEPOSIT_AMOUNT) || 500,        // PKR 500
  MAX_DEPOSIT: Number(process.env.MAX_DEPOSIT_AMOUNT) || 500000,     // PKR 5 lakh
  MIN_WITHDRAWAL: Number(process.env.MIN_WITHDRAWAL_AMOUNT) || 1000, // PKR 1000
  MAX_WITHDRAWAL: Number(process.env.MAX_WITHDRAWAL_AMOUNT) || 500000, // PKR 5 lakh
  MAX_DAILY_WITHDRAWAL: Number(process.env.MAX_DAILY_WITHDRAWAL_AMOUNT) || 500000,
  MIN_CONTRACT_VALUE: 0, // No minimum
  MAX_CONTRACT_VALUE: 10000000, // PKR 1 crore
  AUTO_APPROVAL_LIMIT: 1000000, // Auto-approve withdrawals up to PKR 10 lakh
};

// Platform fee percentage (5% as per requirements)
export const PLATFORM_FEE_PERCENTAGE = Number(process.env.PLATFORM_FEE_PERCENTAGE) || 5;

// Currency
export const CURRENCY = {
  PKR: 'PKR',
};

// Helper function to calculate platform fee
export const calculatePlatformFee = (amount) => {
  return Math.round((amount * PLATFORM_FEE_PERCENTAGE) / 100);
};

// Helper function to calculate amount after fee
export const calculateAmountAfterFee = (amount) => {
  return amount - calculatePlatformFee(amount);
};

// Helper function to validate deposit amount
export const isValidDepositAmount = (amount) => {
  return amount >= PAYMENT_LIMITS.MIN_DEPOSIT && amount <= PAYMENT_LIMITS.MAX_DEPOSIT;
};

// Helper function to validate withdrawal amount
export const isValidWithdrawalAmount = (amount) => {
  return amount >= PAYMENT_LIMITS.MIN_WITHDRAWAL && amount <= PAYMENT_LIMITS.MAX_WITHDRAWAL;
};

// Helper to check if withdrawal should be auto-approved
export const shouldAutoApproveWithdrawal = (amount) => {
  return amount <= PAYMENT_LIMITS.AUTO_APPROVAL_LIMIT;
};

// Helper function to check if escrow can be released
export const canReleaseEscrow = (escrowStatus) => {
  return ['LOCKED', 'FUNDED'].includes(escrowStatus);
};

// Helper function to check if escrow can be refunded
export const canRefundEscrow = (escrowStatus) => {
  return ['FUNDED', 'LOCKED', 'DISPUTED'].includes(escrowStatus);
};

// Helper function to check if escrow can be frozen
export const canFreezeEscrow = (escrowStatus) => {
  return ['FUNDED', 'LOCKED'].includes(escrowStatus);
};

