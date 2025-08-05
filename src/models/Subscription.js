const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  fastspringData: {
    subscriptionId: {
      type: String,
      required: true,
      unique: true
    },
    orderId: {
      type: String
    },
    customerId: {
      type: String
    },
    productPath: {
      type: String
    },
    state: {
      type: String,
      enum: ['active', 'canceled', 'deactivated', 'completed']
    }
  },
  
  plan: {
    type: String,
    enum: ['standard', 'pro', 'business_standard', 'business_unlimited'],
    required: true
  },
  
  status: {
    type: String,
    enum: ['active', 'inactive', 'cancelled', 'expired', 'completed'],
    default: 'inactive'
  },
  
  paymentType: {
    type: String,
    enum: ['one_time'],
    default: 'one_time',
    required: true
  },
  
  pricing: {
    currency: {
      type: String,
      default: 'USD'
    },
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: function(value) {
          // Validate pricing based on plan
          const planPricing = {
            'standard': 99,
            'pro': 199,
            'business_standard': 299,
            'business_unlimited': 399
          };
          return planPricing[this.plan] === value;
        },
        message: 'Invalid pricing for the selected plan'
      }
    }
  },
  
  dates: {
    purchaseDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    activationDate: {
      type: Date
    },
    expirationDate: {
      type: Date
    },
    cancelledAt: {
      type: Date
    }
  },
  
  // Track subscription changes
  history: [{
    action: {
      type: String,
      enum: ['purchased', 'activated', 'cancelled', 'refunded', 'upgraded', 'downgraded', 'suspended', 'expired'],
      required: true
    },
    fromPlan: String,
    toPlan: String,
    date: {
      type: Date,
      default: Date.now
    },
    reason: String,
    fastspringEventId: String
  }],
  
  // FastSpring webhook events log
  webhookEvents: [{
    eventType: String,
    eventId: String,
    receivedAt: {
      type: Date,
      default: Date.now
    },
    data: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

// Indexes
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ 'dates.expirationDate': 1 });
subscriptionSchema.index({ plan: 1, status: 1 });

// Static method to find by FastSpring subscription ID
subscriptionSchema.statics.findByFastspringId = function(subscriptionId) {
  return this.findOne({ 'fastspringData.subscriptionId': subscriptionId });
};

// Static method to find active subscriptions
subscriptionSchema.statics.findActive = function() {
  return this.find({ 
    status: 'active',
    $or: [
      { 'dates.expirationDate': { $exists: false } }, // Lifetime access
      { 'dates.expirationDate': { $gt: new Date() } }  // Not expired
    ]
  });
};

// Static method to find expiring subscriptions (if they have expiration dates)
subscriptionSchema.statics.findExpiring = function(days = 7) {
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + days);
  
  return this.find({
    status: 'active',
    'dates.expirationDate': { 
      $exists: true,
      $gte: new Date(),
      $lte: expirationDate
    }
  });
};

// Static method to get plan pricing
subscriptionSchema.statics.getPlanPricing = function() {
  return {
    'standard': { amount: 99, currency: 'USD' },
    'pro': { amount: 199, currency: 'USD' },
    'business_standard': { amount: 299, currency: 'USD' },
    'business_unlimited': { amount: 399, currency: 'USD' }
  };
};

// Instance method to add history entry
subscriptionSchema.methods.addHistory = function(action, details = {}) {
  this.history.push({
    action,
    fromPlan: details.fromPlan,
    toPlan: details.toPlan,
    reason: details.reason,
    fastspringEventId: details.fastspringEventId
  });
  
  return this.save();
};

// Instance method to log webhook event
subscriptionSchema.methods.logWebhookEvent = function(eventType, eventId, data) {
  this.webhookEvents.push({
    eventType,
    eventId,
    data
  });
  
  // Keep only last 50 webhook events
  if (this.webhookEvents.length > 50) {
    this.webhookEvents = this.webhookEvents.slice(-50);
  }
  
  return this.save();
};

// Instance method to check if subscription is active
subscriptionSchema.methods.isActive = function() {
  if (this.status !== 'active') return false;
  
  // If no expiration date, it's lifetime access
  if (!this.dates.expirationDate) return true;
  
  // Check if not expired
  return this.dates.expirationDate > new Date();
};

// Instance method to activate purchase
subscriptionSchema.methods.activate = function() {
  this.status = 'active';
  this.dates.activationDate = new Date();
  
  this.addHistory('activated');
  
  return this.save();
};

// Instance method to cancel subscription
subscriptionSchema.methods.cancel = function(reason = null) {
  this.status = 'cancelled';
  this.dates.cancelledAt = new Date();
  
  this.addHistory('cancelled', { reason });
  
  return this.save();
};

// Instance method to process refund
subscriptionSchema.methods.refund = function(reason = null) {
  this.status = 'cancelled';
  this.dates.cancelledAt = new Date();
  
  this.addHistory('refunded', { reason });
  
  return this.save();
};

// Instance method to upgrade plan
subscriptionSchema.methods.upgradeTo = function(newPlan) {
  const oldPlan = this.plan;
  const planPricing = this.constructor.getPlanPricing();
  
  this.plan = newPlan;
  this.pricing.amount = planPricing[newPlan].amount;
  
  this.addHistory('upgraded', { 
    fromPlan: oldPlan, 
    toPlan: newPlan 
  });
  
  return this.save();
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
