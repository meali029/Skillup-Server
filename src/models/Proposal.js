import mongoose from "mongoose";

const proposalSchema = new mongoose.Schema(
  {
    freelancerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    coverLetter: {
      type: String,
      required: true,
      minlength: 100,
      maxlength: 2000,
      trim: true,
    },
    bidAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    deliveryTime: {
      type: Number,
      required: true,
      min: 1,
      // Delivery time in days
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "withdrawn"],
      default: "pending",
      index: true,
    },
    attachments: [
      {
        name: String,
        url: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate proposals
proposalSchema.index({ freelancerId: 1, jobId: 1 }, { unique: true });

// Index for common queries
proposalSchema.index({ status: 1, createdAt: -1 });

const Proposal = mongoose.model("Proposal", proposalSchema);

export default Proposal;
