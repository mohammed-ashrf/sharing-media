const express = require('express');
const router = express.Router();
const {
  getSubscription,
  purchaseSubscription,
  upgradeSubscription,
  getAvailablePlans,
  createCheckoutSession,
  checkNeedsUpgrade,
  addPCSession,
  removePCSession,
  useCredits,
  setAPIKeys,
  createSubuser,
  getSubusers,
  updateSubuser,
  deleteSubuser,
  fastspringWebhook
} = require('../controllers/subscriptionController');

const { protect } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');

// Validation rules
const purchaseValidation = [
  body('plan')
    .isIn(['standard', 'pro', 'business_standard', 'business_unlimited'])
    .withMessage('Invalid plan selection'),
  body('fastspringOrderId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('FastSpring order ID is required'),
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Amount must be a positive number'),
  body('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be 3 characters')
];

const checkoutValidation = [
  body('planId')
    .isIn(['standard', 'pro', 'business_standard', 'business_unlimited'])
    .withMessage('Invalid plan selection'),
  body('action')
    .optional()
    .isIn(['purchase', 'upgrade'])
    .withMessage('Action must be purchase or upgrade')
];

const upgradeValidation = [
  body('targetPlan')
    .isIn(['standard', 'pro', 'business_standard', 'business_unlimited'])
    .withMessage('Invalid target plan'),
  body('fastspringOrderId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('FastSpring order ID is required'),
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Amount must be a positive number'),
  body('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be 3 characters')
];

const createSubuserValidation = [
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('First name must contain only letters and spaces'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Last name must contain only letters and spaces'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

const addSessionValidation = [
  body('deviceId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Device ID is required'),
  body('deviceName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Device name cannot exceed 100 characters')
];

const useCreditsValidation = [
  body('amount')
    .isInt({ min: 1 })
    .withMessage('Amount must be a positive integer')
];

const apiKeysValidation = [
  body('openAI')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('OpenAI API key cannot be empty'),
  body('elevenLabs')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('ElevenLabs API key cannot be empty')
];

// Subscription routes
router.get('/', protect, getSubscription);
router.get('/plans', getAvailablePlans); // Public route for plan pricing
router.get('/needs-upgrade', protect, checkNeedsUpgrade); // Check if upgrade needed
router.post('/create-checkout', protect, checkoutValidation, handleValidationErrors, createCheckoutSession);
router.post('/purchase', protect, purchaseValidation, handleValidationErrors, purchaseSubscription);
router.put('/upgrade', protect, upgradeValidation, handleValidationErrors, upgradeSubscription);

// PC session management
router.post('/sessions', protect, addSessionValidation, handleValidationErrors, addPCSession);
router.delete('/sessions/:deviceId', protect, removePCSession);

// Credits management
router.post('/credits/use', protect, useCreditsValidation, handleValidationErrors, useCredits);

// API keys management (Business plans only)
router.put('/api-keys', protect, apiKeysValidation, handleValidationErrors, setAPIKeys);

// Subuser management
router.post('/subusers', protect, createSubuserValidation, handleValidationErrors, createSubuser);
router.get('/subusers', protect, getSubusers);
router.put('/subusers/:id', protect, updateSubuser);
router.delete('/subusers/:id', protect, deleteSubuser);

// FastSpring webhook (no auth needed, but should validate signature in production)
router.post('/webhook/fastspring', fastspringWebhook);

module.exports = router;
