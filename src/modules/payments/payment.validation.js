import Joi from 'joi';

/**
 * Payment validation schemas
 */

// Deposit initialization validation
export const initializeDeposit = Joi.object({
  amount: Joi.number().positive().required().messages({
    'number.positive': 'Amount must be greater than zero',
    'any.required': 'Amount is required',
  }),
  paymentMethod: Joi.string()
    .valid('JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER')
    .required()
    .messages({
      'any.only': 'Invalid payment method',
      'any.required': 'Payment method is required',
    }),
  customerData: Joi.object({
    email: Joi.string().email().allow('', null).optional(),
    name: Joi.string().allow('', null).optional(),
    phone: Joi.string().allow('', null).optional(),
  }).optional().allow(null).default({}),
});

// Deposit verification validation
export const verifyDeposit = Joi.object({
  transactionId: Joi.string().required().messages({
    'any.required': 'Transaction ID is required',
  }),
  callbackData: Joi.object().required().messages({
    'any.required': 'Callback data is required',
  }),
  paymentMethod: Joi.string()
    .valid('JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER')
    .required()
    .messages({
      'any.only': 'Invalid payment method',
      'any.required': 'Payment method is required',
    }),
});

// Transaction history query validation
export const getTransactions = Joi.object({
  type: Joi.string()
    .valid('DEPOSIT', 'WITHDRAWAL', 'ESCROW_FUND', 'ESCROW_RELEASE', 'REFUND', 'FEE')
    .empty('')
    .optional(),
  status: Joi.string()
    .valid('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED')
    .empty('')
    .optional(),
  paymentMethod: Joi.string()
    .valid('JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER', 'STRIPE')
    .empty('')
    .optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(20),
});

// Withdrawal request validation
export const createWithdrawal = Joi.object({
  amount: Joi.number().positive().required().messages({
    'number.positive': 'Amount must be greater than zero',
    'any.required': 'Amount is required',
  }),
  paymentMethod: Joi.string()
    .valid('JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER')
    .required()
    .messages({
      'any.only': 'Invalid payment method',
      'any.required': 'Payment method is required',
    }),
  accountDetails: Joi.object({
    // For JazzCash/Easypaisa: phoneNumber is required, accountNumber is optional (can be phone number)
    // For Bank Transfer: accountNumber, accountName, bankName are required
    accountNumber: Joi.string().optional().allow('', null),
    accountName: Joi.string().optional().allow('', null),
    phoneNumber: Joi.string().optional().allow('', null),
    cnic: Joi.string().optional().allow('', null),
    bankName: Joi.string().optional().allow('', null),
    branchName: Joi.string().optional().allow('', null),
    iban: Joi.string().optional().allow('', null),
    swiftCode: Joi.string().optional().allow('', null),
  })
    .required()
    .messages({
      'any.required': 'Account details are required',
    }),
});

// Fund milestone escrow validation
export const fundMilestoneEscrow = Joi.object({
  paymentMethod: Joi.string()
    .valid('JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER')
    .required()
    .messages({
      'any.only': 'Invalid payment method',
      'any.required': 'Payment method is required',
    }),
  customerData: Joi.object({
    email: Joi.string().email().optional(),
    name: Joi.string().optional(),
    phone: Joi.string().optional(),
  }).optional(),
});

// Approve milestone validation
export const approveMilestone = Joi.object({
  // No body required, just contract and milestone IDs in params
});

// Escrow release validation (admin)
export const adminReleaseEscrow = Joi.object({
  partialAmount: Joi.number().positive().optional(),
  toUserId: Joi.string().optional(),
});

// Escrow refund validation (admin)
export const adminRefundEscrow = Joi.object({
  reason: Joi.string().required().messages({
    'any.required': 'Refund reason is required',
  }),
});

// Process withdrawal validation (admin)
export const processWithdrawal = Joi.object({
  // No body required, just withdrawal ID in params
});

// Reject withdrawal validation (admin)
export const rejectWithdrawal = Joi.object({
  reason: Joi.string().required().messages({
    'any.required': 'Rejection reason is required',
  }),
});

