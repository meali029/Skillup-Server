import mongoose from 'mongoose';

const proposalSchema = new mongoose.Schema({
  freelancerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Freelancer',
    required: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  coverLetter: {
    type: String,
    required: true
  },
  bidAmount: {
    type: Number,
    required: true
  },
  deliveryTime: {
    type: Number,
    required: true // in days
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'withdrawn'],
    default: 'pending'
  },
  attachments: [{
    type: String
  }]
}, {
  timestamps: true
});

export default mongoose.model('Proposal', proposalSchema);
