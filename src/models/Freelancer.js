import mongoose from 'mongoose';

const freelancerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  cnic: {
    type: String,
    sparse: true
  },
  skills: [{
    type: String
  }],
  profileImage: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    default: ''
  },
  education: [{
    degree: String,
    institution: String,
    year: String
  }],
  location: {
    city: String,
    country: String
  },
  profileCompletion: {
    type: Number,
    default: 0
  },
  earnings: {
    total: {
      type: Number,
      default: 0
    },
    pending: {
      type: Number,
      default: 0
    }
  },
  proposals: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal'
  }],
  ongoingProjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  }],
  reviews: [{
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: Number,
    comment: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

export default mongoose.model('Freelancer', freelancerSchema);
