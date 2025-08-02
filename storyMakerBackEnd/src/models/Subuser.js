const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const subuserSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner ID is required'],
    index: true
  },
  
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot be more than 50 characters'],
    validate: {
      validator: function(v) {
        return /^[a-zA-Z\s]+$/.test(v);
      },
      message: 'First name can only contain letters and spaces'
    }
  },
  
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot be more than 50 characters'],
    validate: {
      validator: function(v) {
        return /^[a-zA-Z\s]+$/.test(v);
      },
      message: 'Last name can only contain letters and spaces'
    }
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false
  },
  
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  
  permissions: {
    canCreateStories: {
      type: Boolean,
      default: true
    },
    canEditStories: {
      type: Boolean,
      default: true
    },
    canDeleteStories: {
      type: Boolean,
      default: false
    },
    canAccessTemplates: {
      type: Boolean,
      default: true
    },
    canUseVoiceGeneration: {
      type: Boolean,
      default: true
    },
    canExportVideo: {
      type: Boolean,
      default: true
    }
  },
  
  lastLogin: {
    type: Date
  },
  
  // Track subuser's credit usage from owner's pool
  creditUsage: {
    used: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
subuserSchema.index({ ownerId: 1, email: 1 });
subuserSchema.index({ ownerId: 1, status: 1 });

// Virtual for full name
subuserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Pre-save middleware to hash password
subuserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Validate owner can create subusers before saving
subuserSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const User = mongoose.model('User');
      const owner = await User.findById(this.ownerId);
      
      if (!owner) {
        return next(new Error('Owner not found'));
      }
      
      if (!owner.canCreateSubuser()) {
        return next(new Error('Owner plan does not support subusers'));
      }
      
      // Check if owner has reached subuser limit
      const existingSubusers = await mongoose.model('Subuser').countDocuments({
        ownerId: this.ownerId,
        status: { $ne: 'suspended' }
      });
      
      if (existingSubusers >= owner.subscription.features.multiUserAccess) {
        return next(new Error('Subuser limit reached for this plan'));
      }
      
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

// Instance method to compare password
subuserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to use credits from owner's pool
subuserSchema.methods.useOwnerCredits = async function(amount) {
  try {
    const User = mongoose.model('User');
    const owner = await User.findById(this.ownerId);
    
    if (!owner) {
      throw new Error('Owner not found');
    }
    
    // For business plans with own API, credits are unlimited
    if (owner.subscription.features.canConnectOwnAPI && 
        (owner.apiKeys.openAI || owner.apiKeys.elevenLabs)) {
      this.creditUsage.used += amount;
      await this.save();
      return true;
    }
    
    // For credit-based plans, use owner's credits
    await owner.useCredits(amount);
    this.creditUsage.used += amount;
    await this.save();
    
    return true;
  } catch (error) {
    throw error;
  }
};

// Static method to find subusers by owner
subuserSchema.statics.findByOwner = function(ownerId, status = null) {
  const query = { ownerId };
  if (status) query.status = status;
  return this.find(query);
};

// Static method to find by email
subuserSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Remove sensitive fields from JSON output
subuserSchema.methods.toJSON = function() {
  const subuserObject = this.toObject();
  delete subuserObject.password;
  delete subuserObject.__v;
  
  return subuserObject;
};

module.exports = mongoose.model('Subuser', subuserSchema);
