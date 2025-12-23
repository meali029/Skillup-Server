import mongoose from 'mongoose';

/**
 * EnvironmentVariable Model
 * Stores environment variables in the database
 * Allows admins to manage env vars through the admin panel
 */
const environmentVariableSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    value: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      enum: [
        'database',
        'authentication',
        'api',
        'payment',
        'ai',
        'email',
        'storage',
        'feature',
        'other',
      ],
      default: 'other',
    },
    isEncrypted: {
      type: Boolean,
      default: false,
    },
    isPublic: {
      type: Boolean,
      default: false,
      // Public vars can be exposed to frontend (e.g., VITE_* vars)
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster lookups
environmentVariableSchema.index({ key: 1 });
environmentVariableSchema.index({ category: 1 });

// Static method to get all environment variables as an object
environmentVariableSchema.statics.getAllAsObject = async function() {
  const vars = await this.find({});
  const result = {};
  vars.forEach((envVar) => {
    result[envVar.key] = envVar.value;
  });
  return result;
};

// Static method to get a single environment variable
environmentVariableSchema.statics.getByKey = async function(key) {
  const envVar = await this.findOne({ key: key.toUpperCase() });
  return envVar ? envVar.value : null;
};

// Static method to set or update an environment variable
environmentVariableSchema.statics.setVariable = async function(key, value, options = {}) {
  const updateData = {
    key: key.toUpperCase(),
    value,
    ...options,
  };
  
  const envVar = await this.findOneAndUpdate(
    { key: key.toUpperCase() },
    updateData,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  
  return envVar;
};

// Static method to get public variables (for frontend)
environmentVariableSchema.statics.getPublicVariables = async function() {
  const vars = await this.find({ isPublic: true });
  const result = {};
  vars.forEach((envVar) => {
    result[envVar.key] = envVar.value;
  });
  return result;
};

const EnvironmentVariable = mongoose.models.EnvironmentVariable || 
  mongoose.model('EnvironmentVariable', environmentVariableSchema);

export default EnvironmentVariable;

