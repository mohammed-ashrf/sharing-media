const express = require('express');
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  deactivateUser,
  activateUser,
  getUserStats,
  saveApiKeys,
  testApiKeys
} = require('../controllers/userController');

const { authenticate, requireAdmin } = require('../middleware/auth');
const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// API Key management routes (require authentication only)
router.post('/api-keys', authenticate, [
  body('openai').notEmpty().withMessage('OpenAI API key is required'),
  body('murf').notEmpty().withMessage('Murf AI API key is required'),
  handleValidationErrors
], saveApiKeys);

router.post('/test-api-keys', authenticate, [
  body('openai').notEmpty().withMessage('OpenAI API key is required'),
  body('murf').notEmpty().withMessage('Murf AI API key is required'),
  handleValidationErrors
], testApiKeys);

// All routes below require authentication
router.use(authenticate);

// All routes below require admin privileges
router.use(requireAdmin);

// Validation for user creation
const validateCreateUser = [
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 30 })
    .withMessage('First name must be between 2 and 30 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('First name can only contain letters and spaces'),
    
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 30 })
    .withMessage('Last name must be between 2 and 30 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Last name can only contain letters and spaces'),
    
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
    .isLength({ max: 100 })
    .withMessage('Email must be less than 100 characters'),
    
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'),
    
  body('role')
    .optional()
    .isIn(['user', 'admin'])
    .withMessage('Role must be either user or admin'),
    
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
    
  body('isEmailVerified')
    .optional()
    .isBoolean()
    .withMessage('isEmailVerified must be a boolean'),
    
  handleValidationErrors
];

// Validation for user updates
const validateUpdateUser = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 30 })
    .withMessage('First name must be between 2 and 30 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('First name can only contain letters and spaces'),
    
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 30 })
    .withMessage('Last name must be between 2 and 30 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Last name can only contain letters and spaces'),
    
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
    .isLength({ max: 100 })
    .withMessage('Email must be less than 100 characters'),
    
  body('role')
    .optional()
    .isIn(['user', 'admin'])
    .withMessage('Role must be either user or admin'),
    
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
    
  body('isEmailVerified')
    .optional()
    .isBoolean()
    .withMessage('isEmailVerified must be a boolean'),
    
  handleValidationErrors
];

// Routes
router.route('/stats').get(getUserStats);

router.route('/')
  .get(getUsers)
  .post(validateCreateUser, createUser);

router.route('/:id')
  .get(getUser)
  .put(validateUpdateUser, updateUser)
  .delete(deleteUser);

router.route('/:id/deactivate')
  .put(deactivateUser);

router.route('/:id/activate')
  .put(activateUser);

module.exports = router;
