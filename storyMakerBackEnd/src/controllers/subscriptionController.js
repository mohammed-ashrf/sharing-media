const User = require('../models/User');
const Subuser = require('../models/Subuser');
const Subscription = require('../models/Subscription');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Get user subscription details
// @route   GET /api/subscription
// @access  Private
exports.getSubscription = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }
  
  const subscription = await Subscription.findOne({ 
    userId: user._id,
    status: 'active'
  });
  
  res.status(200).json({
    success: true,
    data: {
      subscription: user.subscription,
      activeSessions: user.activeSessions,
      subscriptionHistory: subscription
    }
  });
});

// @desc    Purchase subscription plan (one-time payment)
// @route   POST /api/subscription/purchase
// @access  Private
exports.purchaseSubscription = asyncHandler(async (req, res, next) => {
  const { plan, fastspringOrderId, amount, currency = 'USD' } = req.body;
  
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }
  
  // Validate pricing
  const validPricing = Subscription.getPlanPricing();
  if (!validPricing[plan] || validPricing[plan] !== amount) {
    return next(new ErrorResponse('Invalid plan or pricing', 400));
  }
  
  try {
    // Create new subscription record
    const subscription = await Subscription.create({
      userId: user._id,
      fastspringData: {
        orderId: fastspringOrderId,
        productPath: plan,
        state: 'completed'
      },
      plan,
      status: 'active',
      paymentType: 'one_time',
      pricing: {
        currency,
        amount
      },
      dates: {
        purchaseDate: new Date(),
        activationDate: new Date(),
        expirationDate: null // Lifetime access
      }
    });
    
    // Update user subscription
    await user.updateSubscription({
      plan,
      fastspringSubscriptionId: fastspringOrderId,
      startDate: new Date(),
      endDate: null, // Lifetime access
      status: 'active'
    });
    
    // Add purchase history
    await subscription.addHistory('purchased', {
      fastspringOrderId,
      amount,
      currency
    });
    
    res.status(201).json({
      success: true,
      data: {
        subscription: user.subscription,
        subscriptionHistory: subscription
      }
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

// @desc    Upgrade subscription plan
// @route   PUT /api/subscription/upgrade
// @access  Private
exports.upgradeSubscription = asyncHandler(async (req, res, next) => {
  const { targetPlan, fastspringOrderId, amount, currency = 'USD' } = req.body;
  
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }
  
  // Find current active subscription
  const currentSubscription = await Subscription.findOne({ 
    userId: user._id,
    status: 'active'
  });
  
  if (!currentSubscription) {
    return next(new ErrorResponse('No active subscription found', 404));
  }
  
  try {
    // Upgrade to new plan
    await currentSubscription.upgradeTo(targetPlan, {
      fastspringOrderId,
      amount,
      currency
    });
    
    // Update user subscription
    await user.updateSubscription({
      plan: targetPlan,
      fastspringSubscriptionId: fastspringOrderId,
      startDate: new Date(),
      endDate: null, // Lifetime access
      status: 'active'
    });
    
    res.status(200).json({
      success: true,
      data: {
        subscription: user.subscription,
        subscriptionHistory: currentSubscription
      }
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

// @desc    Add PC session
// @route   POST /api/subscription/sessions
// @access  Private
exports.addPCSession = asyncHandler(async (req, res, next) => {
  const { deviceId, deviceName } = req.body;
  
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }
  
  try {
    await user.addActiveSession({
      deviceId,
      deviceName,
      ipAddress: req.ip
    });
    
    res.status(201).json({
      success: true,
      data: user.activeSessions
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

// @desc    Remove PC session
// @route   DELETE /api/subscription/sessions/:deviceId
// @access  Private
exports.removePCSession = asyncHandler(async (req, res, next) => {
  const { deviceId } = req.params;
  
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }
  
  await user.removeActiveSession(deviceId);
  
  res.status(200).json({
    success: true,
    data: user.activeSessions
  });
});

// @desc    Use credits
// @route   POST /api/subscription/credits/use
// @access  Private
exports.useCredits = asyncHandler(async (req, res, next) => {
  const { amount } = req.body;
  
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }
  
  try {
    await user.useCredits(amount);
    
    res.status(200).json({
      success: true,
      data: user.subscription.credits
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

// @desc    Set API keys (Business plans only)
// @route   PUT /api/subscription/api-keys
// @access  Private
exports.setAPIKeys = asyncHandler(async (req, res, next) => {
  const { openAI, elevenLabs } = req.body;
  
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }
  
  try {
    await user.setAPIKeys({ openAI, elevenLabs });
    
    res.status(200).json({
      success: true,
      message: 'API keys updated successfully'
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

// @desc    Create subuser
// @route   POST /api/subscription/subusers
// @access  Private
exports.createSubuser = asyncHandler(async (req, res, next) => {
  const { firstName, lastName, email, password, permissions } = req.body;
  
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }
  
  if (!user.canCreateSubuser()) {
    return next(new ErrorResponse('Your plan does not support subusers', 403));
  }
  
  try {
    const subuser = await Subuser.create({
      ownerId: user._id,
      firstName,
      lastName,
      email,
      password,
      permissions: permissions || {}
    });
    
    res.status(201).json({
      success: true,
      data: subuser
    });
  } catch (error) {
    if (error.code === 11000) {
      return next(new ErrorResponse('Email already exists', 400));
    }
    return next(new ErrorResponse(error.message, 400));
  }
});

// @desc    Get all subusers
// @route   GET /api/subscription/subusers
// @access  Private
exports.getSubusers = asyncHandler(async (req, res, next) => {
  const subusers = await Subuser.findByOwner(req.user.id);
  
  res.status(200).json({
    success: true,
    count: subusers.length,
    data: subusers
  });
});

// @desc    Update subuser
// @route   PUT /api/subscription/subusers/:id
// @access  Private
exports.updateSubuser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;
  
  const subuser = await Subuser.findOne({ _id: id, ownerId: req.user.id });
  
  if (!subuser) {
    return next(new ErrorResponse('Subuser not found', 404));
  }
  
  // Don't allow password updates through this endpoint
  delete updates.password;
  delete updates.ownerId;
  
  Object.assign(subuser, updates);
  await subuser.save();
  
  res.status(200).json({
    success: true,
    data: subuser
  });
});

// @desc    Delete subuser
// @route   DELETE /api/subscription/subusers/:id
// @access  Private
exports.deleteSubuser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  const subuser = await Subuser.findOne({ _id: id, ownerId: req.user.id });
  
  if (!subuser) {
    return next(new ErrorResponse('Subuser not found', 404));
  }
  
  await Subuser.findByIdAndDelete(id);
  
  res.status(200).json({
    success: true,
    message: 'Subuser deleted successfully'
  });
});

// @desc    Get available subscription plans with pricing
// @route   GET /api/subscription/plans
// @access  Public
exports.getAvailablePlans = asyncHandler(async (req, res, next) => {
  const pricing = Subscription.getPlanPricing();
  
  const plans = [
    {
      id: 'standard',
      name: 'Standard',
      price: pricing.standard.amount,
      fastspringProductId: 'shortspie-standard',
      description: 'Perfect for individual creators',
      features: {
        pcLicenses: 1,
        credits: 100000,
        multiUserAccess: 0,
        canConnectOwnAPI: false
      }
    },
    {
      id: 'pro',
      name: 'Pro',
      price: pricing.pro.amount,
      fastspringProductId: 'shortspie-pro',
      description: 'Great for professional creators',
      popular: true,
      features: {
        pcLicenses: 5,
        credits: 1000000,
        multiUserAccess: 0,
        canConnectOwnAPI: false
      }
    },
    {
      id: 'business_standard',
      name: 'Business Standard',
      price: pricing.business_standard.amount,
      fastspringProductId: 'shortspie-business-edition',
      description: 'For growing teams and agencies',
      features: {
        pcLicenses: 100,
        credits: 'Unlimited',
        multiUserAccess: 50,
        canConnectOwnAPI: true
      }
    },
    {
      id: 'business_unlimited',
      name: 'Business Unlimited',
      price: pricing.business_unlimited.amount,
      fastspringProductId: 'shortspie-business-unlimited',
      description: 'For large enterprises',
      features: {
        pcLicenses: 'Unlimited',
        credits: 'Unlimited',
        multiUserAccess: 100,
        canConnectOwnAPI: true
      }
    }
  ];
  
  res.status(200).json({
    success: true,
    data: plans
  });
});

// @desc    Create FastSpring checkout session
// @route   POST /api/subscription/create-checkout
// @access  Private
exports.createCheckoutSession = asyncHandler(async (req, res, next) => {
  const { planId, action = 'purchase' } = req.body;

  console.log('Creating checkout session for plan:', planId, 'action:', action);
  console.log('Environment variables check:');
  console.log('FASTSPRING_API_URL:', process.env.FASTSPRING_API_URL);
  console.log('FASTSPRING_USERNAME:', process.env.FASTSPRING_USERNAME ? '***set***' : 'NOT SET');
  console.log('FASTSPRING_PASSWORD:', process.env.FASTSPRING_PASSWORD ? '***set***' : 'NOT SET'); // action can be 'purchase' or 'upgrade'
  
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Get plan details
  const pricing = Subscription.getPlanPricing();
  const planMap = {
    'standard': { productId: 'shortspie-standard', price: pricing.standard.amount },
    'pro': { productId: 'shortspie-pro', price: pricing.pro.amount },
    'business_standard': { productId: 'shortspie-business-edition', price: pricing.business_standard.amount },
    'business_unlimited': { productId: 'shortspie-business-unlimited', price: pricing.business_unlimited.amount }
  };

  const selectedPlan = planMap[planId];
  if (!selectedPlan) {
    return next(new ErrorResponse('Invalid plan selected', 400));
  }

  // For upgrades, check if user has active subscription
  if (action === 'upgrade') {
    const currentSubscription = await Subscription.findOne({ 
      userId: user._id,
      status: 'active'
    });
    
    if (!currentSubscription) {
      return next(new ErrorResponse('No active subscription found for upgrade', 404));
    }
  }

  try {
    // Create FastSpring checkout session via API
    const fastspringData = {
      products: [{
        product: selectedPlan.productId,
        quantity: 1
      }],
      customer: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      tags: {
        userId: user._id.toString(),
        action: action,
        planId: planId
      }
    };

    // Make request to FastSpring API
    const fastspringApiUrl = process.env.FASTSPRING_API_URL || 'https://api.fastspring.com';
    const fastspringUsername = process.env.FASTSPRING_USERNAME;
    const fastspringPassword = process.env.FASTSPRING_PASSWORD;

    if (!fastspringUsername || !fastspringPassword) {
      console.log('FastSpring credentials not configured, using development mode');
      
      // Development mode - return mock checkout data
      const checkoutData = {
        sessionId: `dev_session_${Date.now()}`,
        planId,
        productId: selectedPlan.productId,
        price: selectedPlan.price,
        action,
        fastspringUrl: `https://bigcommandllc.onfastspring.com/popup-bigcommand?product=${selectedPlan.productId}`,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        }
      };

      return res.status(200).json({
        success: true,
        data: checkoutData
      });
    }

    console.log('FastSpring API URL:', fastspringApiUrl);
    
    // FastSpring Sessions API endpoint (correct format)
    const fastspringUrl = `${fastspringApiUrl}/sessions`;
    console.log('Making request to:', fastspringUrl);

    // Updated FastSpring request format based on their API documentation
    // Using the sessions API with proper purchaser account format
    const fastspringPayload = {
      products: [
        {
          product: selectedPlan.productId,
          quantity: 1
        }
      ],
      account: {
        contact: {
          email: user.email,
          first: user.firstName,
          last: user.lastName
        }
      },
      language: "en",
      country: "US",
      currency: "USD",
      tags: {
        userId: user._id.toString(),
        action: action,
        planId: planId
      }
    };

    console.log('FastSpring payload:', JSON.stringify(fastspringPayload, null, 2));

    const fastspringResponse = await fetch(fastspringUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${fastspringUsername}:${fastspringPassword}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fastspringPayload)
    });

    if (!fastspringResponse.ok) {
      const errorText = await fastspringResponse.text();
      console.error('FastSpring API Error Response:', {
        status: fastspringResponse.status,
        statusText: fastspringResponse.statusText,
        body: errorText
      });
      
      // For development, return mock data if FastSpring fails
      if (process.env.NODE_ENV === 'development') {
        console.log('FastSpring API failed, falling back to development mode');
        const checkoutData = {
          sessionId: `dev_session_${Date.now()}`,
          planId,
          productId: selectedPlan.productId,
          price: selectedPlan.price,
          action,
          fastspringUrl: `https://bigcommandllc.onfastspring.com/popup-bigcommand?product=${selectedPlan.productId}`,
          user: {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName
          }
        };

        return res.status(200).json({
          success: true,
          data: checkoutData
        });
      }
      
      throw new Error(`FastSpring API error: ${fastspringResponse.status} ${fastspringResponse.statusText} - ${errorText}`);
    }

    const fastspringSession = await fastspringResponse.json();
    
    // Return the session data for frontend to use
    const checkoutData = {
      sessionId: fastspringSession.id,
      planId,
      productId: selectedPlan.productId,
      price: selectedPlan.price,
      action,
      fastspringUrl: fastspringSession.url || `https://bigcommandllc.onfastspring.com/popup-bigcommand?session=${fastspringSession.id}`,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    };

    res.status(200).json({
      success: true,
      data: checkoutData
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

// @desc    Check if user needs upgrade (credits exhausted)
// @route   GET /api/subscription/needs-upgrade
// @access  Private
exports.checkNeedsUpgrade = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const currentSubscription = await Subscription.findOne({ 
    userId: user._id,
    status: 'active'
  });

  if (!currentSubscription) {
    return res.status(200).json({
      success: true,
      data: {
        needsUpgrade: true,
        reason: 'no_subscription',
        message: 'You need a subscription to access StoryMaker features. Start with our Standard plan for lifetime access.',
        recommendedPlan: 'standard'
      }
    });
  }

  // Check if credits are exhausted
  const creditsRemaining = user.subscription?.credits?.remaining || 0;
  const currentPlan = user.subscription?.plan;

  let needsUpgrade = false;
  let reason = '';
  let message = '';
  let recommendedPlan = '';

  if (creditsRemaining <= 0) {
    needsUpgrade = true;
    reason = 'credits_exhausted';
    
    // Recommend upgrade based on current plan
    if (currentPlan === 'standard') {
      recommendedPlan = 'pro';
      message = 'Your credits are exhausted. Upgrade to Pro plan to get more credits and continue creating amazing stories.';
    } else if (currentPlan === 'pro') {
      recommendedPlan = 'business_standard';
      message = 'Your Pro credits are exhausted. Upgrade to Business Standard to get significantly more credits.';
    } else if (currentPlan === 'business_standard') {
      recommendedPlan = 'business_unlimited';
      message = 'Your Business Standard credits are exhausted. Upgrade to Business Unlimited for maximum credits.';
    } else {
      // For business_unlimited, suggest using own API keys
      needsUpgrade = false;
      reason = 'use_own_api';
      message = 'Your credits are exhausted. You can add your own API keys to continue using unlimited features.';
    }
  }

  res.status(200).json({
    success: true,
    data: {
      needsUpgrade,
      reason,
      message,
      recommendedPlan,
      currentPlan,
      creditsRemaining
    }
  });
});

// @desc    FastSpring webhook handler
// @route   POST /api/subscription/webhook/fastspring
// @access  Public (but secured with webhook signature)
exports.fastspringWebhook = asyncHandler(async (req, res, next) => {
  const events = req.body.events || [req.body];
  
  for (const event of events) {
    try {
      await processFastspringEvent(event);
    } catch (error) {
      console.error('Error processing FastSpring event:', error);
    }
  }
  
  res.status(200).json({ success: true });
});

// Helper function to process FastSpring events
async function processFastspringEvent(event) {
  const { type, data } = event;
  
  let subscription = await Subscription.findByFastspringId(data.id);
  
  switch (type) {
    case 'order.completed':
    case 'subscription.activated':
      if (!subscription) {
        // Create new subscription for one-time payment
        const user = await User.findOne({ email: data.customer.email });
        if (user) {
          const plan = mapProductToPlan(data.product);
          
          subscription = await Subscription.create({
            userId: user._id,
            fastspringData: {
              orderId: data.id,
              customerId: data.customer.id,
              productPath: data.product,
              state: 'completed'
            },
            plan,
            status: 'active',
            paymentType: 'one_time',
            pricing: {
              currency: data.currency,
              amount: data.total
            },
            dates: {
              purchaseDate: new Date(data.completed || data.begin),
              activationDate: new Date(),
              expirationDate: null // Lifetime access
            }
          });
          
          await user.updateSubscription({
            plan: subscription.plan,
            fastspringSubscriptionId: data.id,
            startDate: new Date(),
            endDate: null, // Lifetime access
            status: 'active'
          });
          
          await subscription.addHistory('purchased', {
            fastspringOrderId: data.id,
            amount: data.total,
            currency: data.currency
          });
        }
      }
      break;
      
    case 'order.refunded':
    case 'subscription.canceled':
      if (subscription) {
        await subscription.refund({
          refundAmount: data.refundAmount || data.total,
          reason: 'Customer requested refund'
        });
        
        const user = await User.findById(subscription.userId);
        if (user) {
          user.subscription.status = 'refunded';
          await user.save();
        }
      }
      break;
  }
  
  // Log the webhook event
  if (subscription) {
    await subscription.logWebhookEvent(type, event.id, data);
  }
}

// Helper function to map FastSpring product to plan
function mapProductToPlan(productPath) {
  const planMap = {
    'standard': 'standard',
    'pro': 'pro',
    'business-standard': 'business_standard',
    'business-unlimited': 'business_unlimited'
  };
  
  // Extract plan from product path
  const planKey = Object.keys(planMap).find(key => 
    productPath.toLowerCase().includes(key)
  );
  
  return planMap[planKey] || 'standard';
}
