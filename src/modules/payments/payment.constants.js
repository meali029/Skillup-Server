/**
 * Payment Module Constants
 * Centralized enums and business rules for payment management
 */

// Payment method enumeration
export const PAYMENT_METHOD = {
  JAZZCASH: 'JAZZCASH',
  EASYPAISA: 'EASYPAISA',
  BANK_TRANSFER: 'BANK_TRANSFER',
  STRIPE: 'STRIPE',
};

// Transaction type enumeration
export const TRANSACTION_TYPE = {
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  ESCROW_FUND: 'ESCROW_FUND',
  ESCROW_RELEASE: 'ESCROW_RELEASE',
  REFUND: 'REFUND',
  FEE: 'FEE',
};

// Escrow status enumeration
export const ESCROW_STATUS = {
  CREATED: 'CREATED',
  FUNDED: 'FUNDED',
  LOCKED: 'LOCKED',
  RELEASED: 'RELEASED',
  REFUNDED: 'REFUNDED',
  DISPUTED: 'DISPUTED',
};

// Transaction status enumeration
export const TRANSACTION_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

// Withdrawal status enumeration
export const WITHDRAWAL_STATUS = {
  REQUESTED: 'REQUESTED',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

// Payment amount limits (in PKR)
export const PAYMENT_LIMITS = {
  MIN_DEPOSIT: Number(process.env.MIN_DEPOSIT_AMOUNT) || 100,
  MAX_DEPOSIT: Number(process.env.MAX_DEPOSIT_AMOUNT) || 500000,
  MIN_WITHDRAWAL: Number(process.env.MIN_WITHDRAWAL_AMOUNT) || 1000,
  MAX_WITHDRAWAL: Number(process.env.MAX_WITHDRAWAL_AMOUNT) || 100000,
  MAX_DAILY_WITHDRAWAL: Number(process.env.MAX_DAILY_WITHDRAWAL_AMOUNT) || 500000,
};

// Platform fee percentage
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

