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
    availableBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockedBalance: {
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
    currency: {
      type: String,
      default: 'PKR',
      enum: ['PKR'],
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
walletSchema.statics.getOrCreateWallet = async function (userId) {
  let wallet = await this.findOne({ userId });
  if (!wallet) {
    wallet = await this.create({ userId });
  }
  return wallet;
};

const Wallet = mongoose.model('Wallet', walletSchema);

export default Wallet;

