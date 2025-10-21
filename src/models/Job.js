import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  budget: {
    min: {
      type: Number,
      required: true
    },
    max: {
      type: Number,
      required: true
    }
  },
  skillsRequired: [{
    type: String,
    required: true
  }],
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'closed'],
    default: 'active'
  },
  bids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal'
  }],
  duration: {
    type: String,
    enum: ['short', 'medium', 'long']
  },
  experienceLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'expert']
  },
  category: String
}, {
  timestamps: true
});

export default mongoose.model('Job', jobSchema);
