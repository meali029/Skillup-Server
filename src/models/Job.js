import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema(
  {
    // Basic Information
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
      minlength: [10, 'Title must be at least 10 characters'],
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
        'seo',
        'social-media',
        'translation',
        'accounting',
        'legal',
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
      required: function() {
        return this.budgetType === 'fixed';
      },
      min: [5, 'Budget must be at least $5'],
      max: [1000000, 'Budget cannot exceed $1,000,000'],
    },
    
    hourlyRate: {
      min: {
        type: Number,
        min: [5, 'Minimum hourly rate must be at least $5'],
        required: function() {
          return this.budgetType === 'hourly';
        },
      },
      max: {
        type: Number,
        max: [500, 'Maximum hourly rate cannot exceed $500'],
        required: function() {
          return this.budgetType === 'hourly';
        },
      },
    },
    
    estimatedHours: {
      type: Number,
      min: [1, 'Estimated hours must be at least 1'],
      max: [1000, 'Estimated hours cannot exceed 1000'],
    },
    
    duration: {
      type: String,
      required: [true, 'Project duration is required'],
      enum: ['less-than-week', '1-2-weeks', '2-4-weeks', '1-3-months', '3-6-months', 'more-than-6-months'],
    },
    
    experienceLevel: {
      type: String,
      required: [true, 'Experience level is required'],
      enum: ['beginner', 'intermediate', 'expert'],
      default: 'intermediate',
    },
    
    // Project Size
    projectSize: {
      type: String,
      enum: ['small', 'medium', 'large'],
      default: 'medium',
    },
    
    // Location
    locationType: {
      type: String,
      enum: ['remote', 'onsite', 'hybrid'],
      default: 'remote',
    },
    
    location: {
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
    
    // Assigned Freelancer (when job is awarded)
    assignedFreelancer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    
    // Job Status
    status: {
      type: String,
      enum: ['draft', 'open', 'in-progress', 'in-review', 'completed', 'cancelled', 'closed'],
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
      type: String,
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    
    // Requirements
    requirements: [{
      type: String,
      trim: true,
    }],
    
    // Preferred Qualifications
    preferredQualifications: [{
      type: String,
      trim: true,
    }],
    
    // Deadlines
    applicationDeadline: {
      type: Date,
    },
    
    startDate: {
      type: Date,
    },
    
    completionDate: {
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
    
    // Questions for applicants
    screeningQuestions: [{
      question: String,
      required: {
        type: Boolean,
        default: false,
      },
    }],
    
    // Statistics
    views: {
      type: Number,
      default: 0,
    },
    
    savedByCount: {
      type: Number,
      default: 0,
    },
    
    // Payment & Milestones
    paymentVerified: {
      type: Boolean,
      default: false,
    },
    
    milestones: [{
      title: String,
      amount: Number,
      dueDate: Date,
      status: {
        type: String,
        enum: ['pending', 'in-progress', 'completed', 'paid'],
        default: 'pending',
      },
      completedAt: Date,
    }],
    
    // Metadata
    isActive: {
      type: Boolean,
      default: true,
    },
    
    deletedAt: {
      type: Date,
      default: null,
    },
    
    // Admin Moderation
    isFlagged: {
      type: Boolean,
      default: false,
      index: true,
    },
    
    flagReason: {
      type: String,
    },
    
    flagType: {
      type: String,
      enum: ['inappropriate', 'spam', 'misleading', 'duplicate', 'other'],
    },
    
    flaggedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    
    flaggedAt: {
      type: Date,
    },
    
    moderationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    
    rejectionReason: {
      type: String,
    },
    
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    
    moderatedAt: {
      type: Date,
    },
    
    // Admin suspension tracking
    suspendedByAdmin: {
      type: Boolean,
      default: false,
    },
    
    suspendedAt: {
      type: Date,
    },
    
    // Search optimization
    searchKeywords: [{
      type: String,
      lowercase: true,
    }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
jobSchema.index({ title: 'text', description: 'text', searchKeywords: 'text' });
jobSchema.index({ createdAt: -1 });
jobSchema.index({ budgetAmount: 1 });
jobSchema.index({ category: 1, status: 1 });
jobSchema.index({ locationType: 1 });
jobSchema.index({ client: 1, status: 1 });
jobSchema.index({ skills: 1 });
jobSchema.index({ experienceLevel: 1 });

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

// Virtual for days remaining until deadline
jobSchema.virtual('daysRemaining').get(function() {
  if (!this.applicationDeadline) return null;
  const diff = this.applicationDeadline - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
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
  
  // Validate budget amount for fixed budget
  if (this.budgetType === 'fixed' && !this.budgetAmount) {
    return next(new Error('Budget amount is required for fixed budget type'));
  }
  
  // Auto-set status to closed if max proposals reached
  if (this.proposalsCount >= this.maxProposals && this.status === 'open') {
    this.status = 'closed';
  }
  
  // Generate search keywords from title, description, and skills
  if (this.isModified('title') || this.isModified('description') || this.isModified('skills')) {
    const titleWords = this.title.toLowerCase().split(' ');
    const descWords = this.description.toLowerCase().split(' ').slice(0, 20);
    this.searchKeywords = [...new Set([...titleWords, ...descWords, ...this.skills])];
  }
  
  next();
});

// Instance method to increment views
jobSchema.methods.incrementViews = async function() {
  this.views += 1;
  return this.save({ validateBeforeSave: false });
};

// Instance method to check if user can apply
jobSchema.methods.canAcceptProposals = function() {
  return (
    this.status === 'open' &&
    this.isActive &&
    !this.isExpired &&
    this.proposalsCount < this.maxProposals &&
    !this.deletedAt
  );
};

// Instance method to check if job is editable
jobSchema.methods.isEditable = function() {
  return ['draft', 'open'].includes(this.status) && this.proposalsCount === 0;
};

// Static method to find active jobs
jobSchema.statics.findActiveJobs = function(filters = {}) {
  return this.find({
    status: 'open',
    isActive: true,
    deletedAt: null,
    ...filters,
  }).populate('client', 'name email avatar companyName');
};

// Static method to find jobs by category
jobSchema.statics.findByCategory = function(category, limit = 10) {
  return this.find({
    category,
    status: 'open',
    isActive: true,
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('client', 'name email avatar companyName');
};

// Static method to search jobs
jobSchema.statics.searchJobs = function(searchTerm, filters = {}) {
  return this.find({
    $text: { $search: searchTerm },
    status: 'open',
    isActive: true,
    deletedAt: null,
    ...filters,
  })
    .sort({ score: { $meta: 'textScore' } })
    .populate('client', 'name email avatar companyName');
};

export default mongoose.model('Job', jobSchema);
