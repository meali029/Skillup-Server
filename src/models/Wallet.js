import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    // Version field for optimistic locking - prevents race conditions
    version: {
      type: Number,
      default: 0,
      required: true,
    },
    availableBalance: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isFinite,
        message: 'Balance must be a valid number',
      },
    },
    lockedBalance: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isFinite,
        message: 'Balance must be a valid number',
      },
    },
    // Pending balance for in-progress transactions
    pendingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalWithdrawn: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Total platform fees paid by this user (for freelancers)
    totalFeesPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Total deposits made
    totalDeposited: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: 'PKR',
      enum: ['PKR'],
      immutable: true, // Currency cannot be changed
    },
    // Wallet status for suspension/freezing
    status: {
      type: String,
      enum: ['active', 'suspended', 'frozen'],
      default: 'active',
    },
    // Last transaction timestamp for activity tracking
    lastTransactionAt: {
      type: Date,
      default: null,
    },
    paymentMethods: [
      {
        type: {
          type: String,
          enum: ['JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER'],
        },
        accountNumber: {
          type: String,
          encrypted: true,
        },
        accountName: String,
        bankName: String, // For bank transfers
        branchName: String, // For bank transfers
        isDefault: {
          type: Boolean,
          default: false,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    bankAccount: {
      accountNumber: {
        type: String,
        encrypted: true,
      },
      accountTitle: String,
      bankName: String,
      branchName: String,
      iban: String,
      swiftCode: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for efficient querying
walletSchema.index({ userId: 1 }, { unique: true });
walletSchema.index({ createdAt: -1 });

// Virtual for total balance (available + locked)
walletSchema.virtual('totalBalance').get(function () {
  return this.availableBalance + this.lockedBalance;
});

// Instance method to check if user has sufficient available balance
walletSchema.methods.hasSufficientBalance = function (amount) {
  return this.availableBalance >= amount;
};

// Instance method to check if user has sufficient total balance (including locked)
walletSchema.methods.hasSufficientTotalBalance = function (amount) {
  return this.totalBalance >= amount;
};

// Static method to get or create wallet for user
walletSchema.statics.getOrCreateWallet = async function (userId, session = null) {
  const options = session ? { session } : {};
  let wallet = await this.findOne({ userId }, null, options);
  if (!wallet) {
    const [newWallet] = await this.create([{ userId }], options);
    wallet = newWallet;
  }
  return wallet;
};

/**
 * Atomic credit operation with optimistic locking
 * @param {ObjectId} userId - User ID
 * @param {Number} amount - Amount to credit
 * @param {Object} session - MongoDB session for transaction
 * @returns {Object} Updated wallet
 */
walletSchema.statics.atomicCredit = async function (userId, amount, session = null) {
  if (amount <= 0) {
    throw new Error('Credit amount must be positive');
  }

  const options = session ? { session, new: true } : { new: true };
  
  const wallet = await this.findOneAndUpdate(
    { userId, status: 'active' },
    {
      $inc: {
        availableBalance: amount,
        version: 1,
      },
      $set: { lastTransactionAt: new Date() },
    },
    options
  );

  if (!wallet) {
    throw new Error('Wallet not found or inactive');
  }

  return wallet;
};

/**
 * Atomic debit operation with optimistic locking
 * Checks available balance before deducting
 * @param {ObjectId} userId - User ID
 * @param {Number} amount - Amount to debit
 * @param {Object} session - MongoDB session for transaction
 * @returns {Object} Updated wallet
 */
walletSchema.statics.atomicDebit = async function (userId, amount, session = null) {
  if (amount <= 0) {
    throw new Error('Debit amount must be positive');
  }

  const options = session ? { session, new: true } : { new: true };
  
  // Use findOneAndUpdate with balance check in the query
  const wallet = await this.findOneAndUpdate(
    { 
      userId, 
      status: 'active',
      availableBalance: { $gte: amount } // Ensure sufficient balance
    },
    {
      $inc: {
        availableBalance: -amount,
        version: 1,
      },
      $set: { lastTransactionAt: new Date() },
    },
    options
  );

  if (!wallet) {
    // Check if wallet exists but has insufficient balance
    const existingWallet = await this.findOne({ userId });
    if (!existingWallet) {
      throw new Error('Wallet not found');
    }
    if (existingWallet.status !== 'active') {
      throw new Error('Wallet is not active');
    }
    throw new Error('Insufficient balance');
  }

  return wallet;
};

/**
 * Atomic lock funds operation
 * Moves amount from available to locked
 * @param {ObjectId} userId - User ID
 * @param {Number} amount - Amount to lock
 * @param {Object} session - MongoDB session for transaction
 * @returns {Object} Updated wallet
 */
walletSchema.statics.atomicLockFunds = async function (userId, amount, session = null) {
  if (amount <= 0) {
    throw new Error('Lock amount must be positive');
  }

  const options = session ? { session, new: true } : { new: true };
  
  const wallet = await this.findOneAndUpdate(
    { 
      userId, 
      status: 'active',
      availableBalance: { $gte: amount }
    },
    {
      $inc: {
        availableBalance: -amount,
        lockedBalance: amount,
        version: 1,
      },
      $set: { lastTransactionAt: new Date() },
    },
    options
  );

  if (!wallet) {
    const existingWallet = await this.findOne({ userId });
    if (!existingWallet) {
      throw new Error('Wallet not found');
    }
    if (existingWallet.status !== 'active') {
      throw new Error('Wallet is not active');
    }
    throw new Error('Insufficient available balance to lock');
  }

  return wallet;
};

/**
 * Atomic unlock funds operation
 * Moves amount from locked back to available
 * @param {ObjectId} userId - User ID
 * @param {Number} amount - Amount to unlock
 * @param {Object} session - MongoDB session for transaction
 * @returns {Object} Updated wallet
 */
walletSchema.statics.atomicUnlockFunds = async function (userId, amount, session = null) {
  if (amount <= 0) {
    throw new Error('Unlock amount must be positive');
  }

  const options = session ? { session, new: true } : { new: true };
  
  const wallet = await this.findOneAndUpdate(
    { 
      userId, 
      status: 'active',
      lockedBalance: { $gte: amount }
    },
    {
      $inc: {
        availableBalance: amount,
        lockedBalance: -amount,
        version: 1,
      },
      $set: { lastTransactionAt: new Date() },
    },
    options
  );

  if (!wallet) {
    const existingWallet = await this.findOne({ userId });
    if (!existingWallet) {
      throw new Error('Wallet not found');
    }
    throw new Error('Insufficient locked balance to unlock');
  }

  return wallet;
};

/**
 * Atomic release from locked (deduct from locked balance)
 * Used when escrow is released
 * @param {ObjectId} userId - User ID  
 * @param {Number} amount - Amount to release from locked
 * @param {Object} session - MongoDB session for transaction
 * @returns {Object} Updated wallet
 */
walletSchema.statics.atomicReleaseFromLocked = async function (userId, amount, session = null) {
  if (amount <= 0) {
    throw new Error('Release amount must be positive');
  }

  const options = session ? { session, new: true } : { new: true };
  
  const wallet = await this.findOneAndUpdate(
    { 
      userId, 
      lockedBalance: { $gte: amount }
    },
    {
      $inc: {
        lockedBalance: -amount,
        version: 1,
      },
      $set: { lastTransactionAt: new Date() },
    },
    options
  );

  if (!wallet) {
    throw new Error('Insufficient locked balance');
  }

  return wallet;
};

/**
 * Atomic credit earnings (for freelancers receiving payment)
 * @param {ObjectId} userId - User ID
 * @param {Number} amount - Gross amount
 * @param {Number} platformFee - Platform fee deducted
 * @param {Object} session - MongoDB session for transaction
 * @returns {Object} Updated wallet
 */
walletSchema.statics.atomicCreditEarnings = async function (userId, amount, platformFee = 0, session = null) {
  const netAmount = amount - platformFee;
  if (netAmount <= 0) {
    throw new Error('Net earnings must be positive');
  }

  const options = session 
    ? { session, new: true, upsert: true, setDefaultsOnInsert: true } 
    : { new: true, upsert: true, setDefaultsOnInsert: true };
  
  const wallet = await this.findOneAndUpdate(
    { userId },
    {
      $inc: {
        availableBalance: netAmount,
        totalEarned: netAmount,
        totalFeesPaid: platformFee,
        version: 1,
      },
      $set: { lastTransactionAt: new Date(), status: 'active' },
      $setOnInsert: {
        lockedBalance: 0,
        pendingBalance: 0,
        totalDeposited: 0,
        totalWithdrawn: 0,
        currency: 'PKR',
      },
    },
    options
  );

  return wallet;
};

/**
 * Atomic record withdrawal
 * @param {ObjectId} userId - User ID
 * @param {Number} amount - Amount withdrawn
 * @param {Object} session - MongoDB session for transaction
 * @returns {Object} Updated wallet
 */
walletSchema.statics.atomicRecordWithdrawal = async function (userId, amount, session = null) {
  if (amount <= 0) {
    throw new Error('Withdrawal amount must be positive');
  }

  const options = session ? { session, new: true } : { new: true };
  
  const wallet = await this.findOneAndUpdate(
    { userId },
    {
      $inc: {
        totalWithdrawn: amount,
        version: 1,
      },
      $set: { lastTransactionAt: new Date() },
    },
    options
  );

  if (!wallet) {
    throw new Error('Wallet not found');
  }

  return wallet;
};

/**
 * Atomic record deposit
 * @param {ObjectId} userId - User ID
 * @param {Number} amount - Amount deposited
 * @param {Object} session - MongoDB session for transaction
 * @returns {Object} Updated wallet
 */
walletSchema.statics.atomicRecordDeposit = async function (userId, amount, session = null) {
  if (amount <= 0) {
    throw new Error('Deposit amount must be positive');
  }

  const options = session 
    ? { session, new: true, upsert: true, setDefaultsOnInsert: true } 
    : { new: true, upsert: true, setDefaultsOnInsert: true };
  
  const wallet = await this.findOneAndUpdate(
    { userId },
    {
      $inc: {
        availableBalance: amount,
        totalDeposited: amount,
        version: 1,
      },
      $set: { lastTransactionAt: new Date(), status: 'active' },
      $setOnInsert: {
        lockedBalance: 0,
        pendingBalance: 0,
        totalEarned: 0,
        totalWithdrawn: 0,
        totalFeesPaid: 0,
        currency: 'PKR',
      },
    },
    options
  );

  return wallet;
};

const Wallet = mongoose.model('Wallet', walletSchema);

export default Wallet;

