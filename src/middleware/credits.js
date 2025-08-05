const User = require('../models/User');
const Subuser = require('../models/Subuser');
const ErrorResponse = require('../utils/errorResponse');

/**
 * Middleware to deduct credits for API operations
 * @param {number} creditCost - Number of credits to deduct
 * @returns {Function} Express middleware
 */
const deductCredits = (creditCost) => {
  return async (req, res, next) => {
    try {
      if (req.userType === 'subuser') {
        // Handle subuser credit usage
        const subuser = await Subuser.findById(req.user.id);
        if (!subuser) {
          return next(new ErrorResponse('Subuser not found', 404));
        }
        
        try {
          await subuser.useOwnerCredits(creditCost);
          req.creditsUsed = creditCost;
          next();
        } catch (error) {
          return next(new ErrorResponse(error.message, 400));
        }
      } else {
        // Handle main user credit usage
        const user = await User.findById(req.user.id);
        if (!user) {
          return next(new ErrorResponse('User not found', 404));
        }
        
        // Business plans with API keys have unlimited credits
        if (user.subscription.features.canConnectOwnAPI && 
            (user.apiKeys.openAI || user.apiKeys.elevenLabs)) {
          req.creditsUsed = 0; // No credits deducted for business with own API
          return next();
        }
        
        try {
          await user.useCredits(creditCost);
          req.creditsUsed = creditCost;
          next();
        } catch (error) {
          return next(new ErrorResponse(error.message, 400));
        }
      }
    } catch (error) {
      return next(new ErrorResponse('Error processing credit usage', 500));
    }
  };
};

/**
 * Middleware to check if user has sufficient credits before operation
 * @param {number} creditCost - Number of credits required
 * @returns {Function} Express middleware
 */
const checkCredits = (creditCost) => {
  return async (req, res, next) => {
    try {
      if (req.userType === 'subuser') {
        // Check owner's credits for subuser
        const subuser = await Subuser.findById(req.user.id).populate('ownerId');
        if (!subuser || !subuser.ownerId) {
          return next(new ErrorResponse('Subuser or owner not found', 404));
        }
        
        const owner = subuser.ownerId;
        
        // Business plans with API keys have unlimited credits
        if (owner.subscription.features.canConnectOwnAPI && 
            (owner.apiKeys.openAI || owner.apiKeys.elevenLabs)) {
          return next();
        }
        
        if (owner.subscription.credits.remaining < creditCost) {
          return next(new ErrorResponse('Insufficient credits in owner account', 402));
        }
      } else {
        // Check main user credits
        const user = await User.findById(req.user.id);
        if (!user) {
          return next(new ErrorResponse('User not found', 404));
        }
        
        // Business plans with API keys have unlimited credits
        if (user.subscription.features.canConnectOwnAPI && 
            (user.apiKeys.openAI || user.apiKeys.elevenLabs)) {
          return next();
        }
        
        if (user.subscription.credits.remaining < creditCost) {
          return next(new ErrorResponse('Insufficient credits', 402));
        }
      }
      
      next();
    } catch (error) {
      return next(new ErrorResponse('Error checking credits', 500));
    }
  };
};

/**
 * Get user's effective API keys (their own or owner's for subusers)
 * @param {Object} req - Express request object
 * @returns {Object} API keys object
 */
const getEffectiveAPIKeys = async (req) => {
  if (req.userType === 'subuser') {
    const subuser = await Subuser.findById(req.user.id).populate('ownerId');
    if (subuser && subuser.ownerId && subuser.ownerId.subscription.features.canConnectOwnAPI) {
      return subuser.ownerId.apiKeys;
    }
  } else {
    const user = await User.findById(req.user.id);
    if (user && user.subscription.features.canConnectOwnAPI) {
      return user.apiKeys;
    }
  }
  
  return {
    openAI: process.env.OPENAI_API_KEY,
    elevenLabs: process.env.ELEVENLABS_API_KEY
  };
};

module.exports = {
  deductCredits,
  checkCredits,
  getEffectiveAPIKeys
};
