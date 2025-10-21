import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema(
  {
    // Basic Information
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
      minlength: [5, 'Title must be at least 5 characters'],
      maxlength: [100, 'Title cannot exceed 100 characters'],
      index: true,
    },
    
    description: {
      type: String,
      required: [true, 'Job description is required'],
      trim: true,
      minlength: [50, 'Description must be at least 50 characters'],
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    
    // Job Details
    category: {
      type: String,
      required: [true, 'Job category is required'],
      enum: [
        'web-development',
        'mobile-development',
        'design',
        'writing',
        'marketing',
        'video-editing',
        'data-entry',
        'customer-service',
        'virtual-assistant',
        'other'
      ],
      index: true,
    },
    
    skills: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    
    // Budget & Duration
    budgetType: {
      type: String,
      required: [true, 'Budget type is required'],
      enum: ['fixed', 'hourly'],
      default: 'fixed',
    },
    
    budgetAmount: {
      type: Number,
      required: [true, 'Budget amount is required'],
      min: [5, 'Budget must be at least $5'],
      max: [1000000, 'Budget cannot exceed $1,000,000'],
    },
    
    hourlyRate: {
      min: {
        type: Number,
        min: [5, 'Minimum hourly rate must be at least $5'],
      },
      max: {
        type: Number,
        max: [500, 'Maximum hourly rate cannot exceed $500'],
      },
    },
    
    duration: {
      type: String,
      enum: ['less-than-week', '1-2-weeks', '2-4-weeks', '1-3-months', '3-6-months', 'more-than-6-months'],
    },
    
    experienceLevel: {
      type: String,
      required: [true, 'Experience level is required'],
      enum: ['entry', 'intermediate', 'expert'],
      default: 'intermediate',
    },
    
    // Project Size
    projectSize: {
      type: String,
      enum: ['small', 'medium', 'large'],
      default: 'medium',
    },
    
    // Location
    location: {
      type: {
        type: String,
        enum: ['remote', 'onsite', 'hybrid'],
        default: 'remote',
      },
      country: String,
      city: String,
      timezone: String,
    },
    
    // Client Information
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Client is required'],
      index: true,
    },
    
    // Job Status
    status: {
      type: String,
      enum: ['draft', 'open', 'in-progress', 'completed', 'cancelled', 'closed'],
      default: 'open',
      index: true,
    },
    
    // Proposals
    proposalsCount: {
      type: Number,
      default: 0,
    },
    
    maxProposals: {
      type: Number,
      default: 50,
      min: 1,
      max: 100,
    },
    
    // Attachments
    attachments: [{
      name: String,
      url: String,
      size: Number,
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    
    // Deadlines
    applicationDeadline: {
      type: Date,
    },
    
    startDate: {
      type: Date,
    },
    
    // Visibility & Featured
    isPublic: {
      type: Boolean,
      default: true,
    },
    
    isFeatured: {
      type: Boolean,
      default: false,
    },
    
    // Statistics
    views: {
      type: Number,
      default: 0,
    },
    
    // Metadata
    isActive: {
      type: Boolean,
      default: true,
    },
    
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
jobSchema.index({ title: 'text', description: 'text' });
jobSchema.index({ createdAt: -1 });
jobSchema.index({ budgetAmount: 1 });
jobSchema.index({ category: 1, status: 1 });
jobSchema.index({ 'location.type': 1 });

// Virtual for checking if deadline passed
jobSchema.virtual('isExpired').get(function() {
  if (!this.applicationDeadline) return false;
  return new Date() > this.applicationDeadline;
});

// Virtual for budget display
jobSchema.virtual('budgetDisplay').get(function() {
  if (this.budgetType === 'fixed') {
    return `$${this.budgetAmount.toLocaleString()} Fixed`;
  } else if (this.hourlyRate && this.hourlyRate.min && this.hourlyRate.max) {
    return `$${this.hourlyRate.min}-$${this.hourlyRate.max}/hr`;
  }
  return 'Budget not set';
});

// Pre-save middleware
jobSchema.pre('save', function(next) {
  // Validate hourly rate if budget type is hourly
  if (this.budgetType === 'hourly') {
    if (!this.hourlyRate || !this.hourlyRate.min || !this.hourlyRate.max) {
      return next(new Error('Hourly rate min and max are required for hourly budget type'));
    }
    if (this.hourlyRate.min > this.hourlyRate.max) {
      return next(new Error('Minimum hourly rate cannot be greater than maximum'));
    }
  }
  
  // Auto-set status to closed if max proposals reached
  if (this.proposalsCount >= this.maxProposals) {
    this.status = 'closed';
  }
  
  next();
});

// Instance method to increment views
jobSchema.methods.incrementViews = async function() {
  this.views += 1;
  return this.save();
};

// Instance method to check if user can apply
jobSchema.methods.canAcceptProposals = function() {
  return (
    this.status === 'open' &&
    this.isActive &&
    !this.isExpired &&
    this.proposalsCount < this.maxProposals
  );
};

// Static method to find active jobs
jobSchema.statics.findActiveJobs = function(filters = {}) {
  return this.find({
    status: 'open',
    isActive: true,
    deletedAt: null,
    ...filters,
  });
};

const Job = mongoose.model('Job', jobSchema);

export default Job;
