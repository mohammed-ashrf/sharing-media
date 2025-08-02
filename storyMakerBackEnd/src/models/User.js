const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
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
    select: false // Don't include password in queries by default
  },
  
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user'
  },
  
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  
  emailVerificationToken: {
    type: String,
    select: false
  },
  
  emailVerificationExpires: {
    type: Date,
    select: false
  },
  
  passwordResetToken: {
    type: String,
    select: false
  },
  
  passwordResetExpires: {
    type: Date,
    select: false
  },
  
  passwordChangedAt: {
    type: Date,
    select: false
  },
  
  loginAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  
  lockUntil: {
    type: Date,
    select: false
  },
  
  lastLogin: {
    type: Date
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  profile: {
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot be more than 500 characters']
    },
    avatar: {
      type: String
    },
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'auto'],
        default: 'auto'
      },
      language: {
        type: String,
        default: 'en'
      },
      notifications: {
        email: {
          type: Boolean,
          default: true
        },
        desktop: {
          type: Boolean,
          default: true
        }
      }
    }
  },
  
  refreshTokens: [{
    token: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 2592000 // 30 days
    }
  }],
  
  // Subscription Information
  subscription: {
    plan: {
      type: String,
      enum: ['standard', 'pro', 'business_standard', 'business_unlimited'],
      default: 'standard'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled', 'expired'],
      default: 'inactive'
    },
    fastspringSubscriptionId: {
      type: String,
      unique: true,
      sparse: true
    },
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    },
    credits: {
      total: {
        type: Number,
        default: 0
      },
      used: {
        type: Number,
        default: 0
      },
      remaining: {
        type: Number,
        default: 0
      }
    },
    features: {
      pcLicenses: {
        type: Number,
        default: 1 // Standard gets 1 PC
      },
      multiUserAccess: {
        type: Number,
        default: 0 // Only business plans get multi-user access
      },
      canConnectOwnAPI: {
        type: Boolean,
        default: false // Only business plans can connect own API
      }
    }
  },
  
  // Custom API Keys (Business Unlimited only)
  apiKeys: {
    openai: {
      type: String,
      select: false // Don't include API keys in queries by default
    },
    murf: {
      type: String,
      select: false // Don't include API keys in queries by default
    },
    updatedAt: {
      type: Date
    }
  },
  
  // Active PC Sessions
  activeSessions: [{
    deviceId: {
      type: String,
      required: true
    },
    deviceName: {
      type: String
    },
    lastActive: {
      type: Date,
      default: Date.now
    },
    ipAddress: {
      type: String
    }
  }],
  
  // API Keys for Business Plans
  apiKeys: {
    openAI: {
      type: String,
      select: false
    },
    elevenLabs: {
      type: String,
      select: false
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
userSchema.index({ passwordResetToken: 1 });
userSchema.index({ emailVerificationToken: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash the password with cost of 12
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    
    // Set passwordChangedAt field
    if (!this.isNew) {
      this.passwordChangedAt = Date.now() - 1000; // Subtract 1 second to handle timing issues
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware to clean up expired refresh tokens
userSchema.pre('save', function(next) {
  if (this.isModified('refreshTokens')) {
    this.refreshTokens = this.refreshTokens.filter(
      tokenObj => tokenObj.createdAt.getTime() + (30 * 24 * 60 * 60 * 1000) > Date.now()
    );
  }
  next();
});

// Instance method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to check if password was changed after JWT was issued
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Instance method to create password reset token
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken; // Return plain text token
};

// Instance method to create email verification token
userSchema.methods.createEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
    
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return verificationToken;
};

// Instance method to handle failed login attempts
userSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // Lock for 2 hours
  }
  
  return this.updateOne(updates);
};

// Instance method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Instance method to add refresh token
userSchema.methods.addRefreshToken = function(token) {
  this.refreshTokens.push({ token });
  
  // Keep only the 5 most recent refresh tokens
  if (this.refreshTokens.length > 5) {
    this.refreshTokens = this.refreshTokens.slice(-5);
  }
  
  return this.save();
};

// Instance method to remove refresh token
userSchema.methods.removeRefreshToken = function(token) {
  this.refreshTokens = this.refreshTokens.filter(
    tokenObj => tokenObj.token !== token
  );
  return this.save();
};

// Instance method to remove all refresh tokens (logout from all devices)
userSchema.methods.removeAllRefreshTokens = function() {
  this.refreshTokens = [];
  return this.save();
};

// Subscription management methods
userSchema.methods.updateSubscription = function(planData) {
  const planLimits = {
    standard: {
      pcLicenses: 1,
      credits: 100000,
      multiUserAccess: 0,
      canConnectOwnAPI: false
    },
    pro: {
      pcLicenses: 5,
      credits: 1000000,
      multiUserAccess: 0,
      canConnectOwnAPI: false
    },
    business_standard: {
      pcLicenses: 100,
      credits: 0, // Unlimited with own API
      multiUserAccess: 50,
      canConnectOwnAPI: true
    },
    business_unlimited: {
      pcLicenses: -1, // Unlimited
      credits: 0, // Unlimited with own API
      multiUserAccess: 100,
      canConnectOwnAPI: true
    }
  };
  
  const limits = planLimits[planData.plan];
  
  this.subscription.plan = planData.plan;
  this.subscription.status = planData.status || 'active';
  this.subscription.fastspringSubscriptionId = planData.fastspringSubscriptionId;
  this.subscription.startDate = planData.startDate || new Date();
  this.subscription.endDate = planData.endDate;
  
  // Update credits only if it's a credit-based plan
  if (limits.credits > 0) {
    this.subscription.credits.total = limits.credits;
    this.subscription.credits.remaining = limits.credits - this.subscription.credits.used;
  }
  
  // Update features
  this.subscription.features.pcLicenses = limits.pcLicenses;
  this.subscription.features.multiUserAccess = limits.multiUserAccess;
  this.subscription.features.canConnectOwnAPI = limits.canConnectOwnAPI;
  
  return this.save();
};

userSchema.methods.useCredits = function(amount) {
  if (this.subscription.credits.remaining < amount) {
    throw new Error('Insufficient credits');
  }
  
  this.subscription.credits.used += amount;
  this.subscription.credits.remaining -= amount;
  
  return this.save();
};

userSchema.methods.canAddPC = function() {
  const maxSessions = this.subscription.features.pcLicenses;
  
  // Unlimited PCs
  if (maxSessions === -1) return true;
  
  // Check current active sessions
  const activeSessions = this.activeSessions.filter(
    session => session.lastActive > new Date(Date.now() - 24 * 60 * 60 * 1000) // Active in last 24 hours
  );
  
  return activeSessions.length < maxSessions;
};

userSchema.methods.addActiveSession = function(deviceData) {
  if (!this.canAddPC()) {
    throw new Error('PC license limit exceeded');
  }
  
  // Remove existing session for this device
  this.activeSessions = this.activeSessions.filter(
    session => session.deviceId !== deviceData.deviceId
  );
  
  // Add new session
  this.activeSessions.push({
    deviceId: deviceData.deviceId,
    deviceName: deviceData.deviceName,
    lastActive: new Date(),
    ipAddress: deviceData.ipAddress
  });
  
  return this.save();
};

userSchema.methods.removeActiveSession = function(deviceId) {
  this.activeSessions = this.activeSessions.filter(
    session => session.deviceId !== deviceId
  );
  return this.save();
};

userSchema.methods.canCreateSubuser = function() {
  const maxSubusers = this.subscription.features.multiUserAccess;
  return maxSubusers > 0; // Will be checked against actual count in the Subuser model
};

userSchema.methods.setAPIKeys = function(apiKeys) {
  if (!this.subscription.features.canConnectOwnAPI) {
    throw new Error('API key connection not available for this plan');
  }
  
  if (apiKeys.openAI) this.apiKeys.openAI = apiKeys.openAI;
  if (apiKeys.elevenLabs) this.apiKeys.elevenLabs = apiKeys.elevenLabs;
  
  return this.save();
};

// Static method to find user by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Static method to find user by reset token
userSchema.statics.findByPasswordResetToken = function(token) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  return this.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });
};

// Static method to find user by email verification token
userSchema.statics.findByEmailVerificationToken = function(token) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  return this.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() }
  });
};

// Remove sensitive fields from JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.passwordResetToken;
  delete userObject.passwordResetExpires;
  delete userObject.emailVerificationToken;
  delete userObject.emailVerificationExpires;
  delete userObject.passwordChangedAt;
  delete userObject.loginAttempts;
  delete userObject.lockUntil;
  delete userObject.refreshTokens;
  delete userObject.apiKeys; // Hide API keys
  delete userObject.__v;
  
  return userObject;
};

module.exports = mongoose.model('User', userSchema);
