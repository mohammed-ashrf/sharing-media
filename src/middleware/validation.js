const { body, validationResult, param, query } = require('express-validator');
const { AppError } = require('./errorHandler');

/**
 * Middleware to check validation results
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => error.msg);
    return next(new AppError(errorMessages.join('. '), 400));
  }
  
  next();
};

/**
 * Validation rules for user registration
 */
const validateRegister = [
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
    
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password confirmation does not match password');
      }
      return true;
    }),
    
  handleValidationErrors
];

/**
 * Validation rules for user login
 */
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
    
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
    
  handleValidationErrors
];

/**
 * Validation rules for forgot password
 */
const validateForgotPassword = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
    
  handleValidationErrors
];

/**
 * Validation rules for reset password
 */
const validateResetPassword = [
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'),
    
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password confirmation does not match password');
      }
      return true;
    }),
    
  handleValidationErrors
];

/**
 * Validation rules for change password
 */
const validateChangePassword = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
    
  body('newPassword')
    .isLength({ min: 8, max: 128 })
    .withMessage('New password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'),
    
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password');
      }
      return true;
    }),
    
  handleValidationErrors
];

/**
 * Validation rules for updating profile
 */
const validateUpdateProfile = [
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
    
  handleValidationErrors
];

/**
 * Validation rules for media search
 */
const validateMediaSearch = [
  body('query')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters'),
    
  body('provider')
    .isIn(['pexels', 'pixabay'])
    .withMessage('Provider must be either pexels or pixabay'),
    
  body('type')
    .isIn(['videos', 'photos'])
    .withMessage('Type must be either videos or photos'),
    
  body('category')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Category must be less than 50 characters'),
    
  body('page')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Page must be between 1 and 100'),
    
  body('perPage')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Per page must be between 1 and 50'),
    
  handleValidationErrors
];

/**
 * Validation rules for media upload metadata
 */
const validateMediaUpload = [
  body('title')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Title must be less than 255 characters'),
    
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
    
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
    
  body('tags.*')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Each tag must be less than 50 characters'),
    
  handleValidationErrors
];

/**
 * Validation rules for saving external media
 */
const validateSaveExternalMedia = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Title must be between 1 and 255 characters'),
    
  body('type')
    .isIn(['video', 'audio', 'image'])
    .withMessage('Type must be video, audio, or image'),
    
  body('url')
    .isURL()
    .withMessage('Must provide a valid URL'),
    
  body('thumbnail')
    .optional()
    .isURL()
    .withMessage('Thumbnail must be a valid URL'),
    
  body('duration')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Duration must be a positive number'),
    
  body('width')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Width must be a positive number'),
    
  body('height')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Height must be a positive number'),
    
  body('author')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Author must be less than 255 characters'),
    
  body('provider')
    .isIn(['pexels', 'pixabay', 'url'])
    .withMessage('Provider must be pexels, pixabay, or url'),
    
  body('externalId')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('External ID must be less than 100 characters'),
    
  handleValidationErrors
];

/**
 * Validation rules for media library query parameters
 */
const validateMediaLibraryQuery = [
  query('type')
    .optional()
    .isIn(['video', 'audio', 'image'])
    .withMessage('Type must be video, audio, or image'),
    
  query('source')
    .optional()
    .isIn(['upload', 'pexels', 'pixabay', 'url'])
    .withMessage('Source must be upload, pexels, pixabay, or url'),
    
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive number'),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
    
  query('tags')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        try {
          JSON.parse(value);
          return true;
        } catch {
          return false;
        }
      }
      return Array.isArray(value);
    })
    .withMessage('Tags must be an array or valid JSON string'),
    
  handleValidationErrors
];

/**
 * Validation rules for media ID parameter
 */
const validateMediaId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid media ID'),
    
  handleValidationErrors
];

module.exports = {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
  validateUpdateProfile,
  validateMediaSearch,
  validateMediaUpload,
  validateSaveExternalMedia,
  validateMediaLibraryQuery,
  validateMediaId,
  handleValidationErrors
};
