const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  generateScriptImages,
  generateScriptImagesStream,
  getGenerationEstimates,
  validateScriptParams
} = require('../controllers/scriptImagesController');

// Import middleware
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Validation middleware for script image generation
const validateScriptImageGeneration = [
  body('script')
    .trim()
    .isLength({ min: 30, max: 50000 })
    .withMessage('Script must be between 30 and 50,000 characters'),
  
  body('duration')
    .isFloat({ min: 10, max: 3600 })
    .withMessage('Duration must be between 10 and 3600 seconds (1 hour max)'),
  
  body('maxImagesPerMin')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Max images per minute must be between 1 and 10'),
  
  body('projectId')
    .trim()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Project ID must be 1-100 characters and contain only letters, numbers, underscores, and hyphens')
];

// Validation middleware for estimates (no project ID required)
const validateEstimatesRequest = [
  body('script')
    .trim()
    .isLength({ min: 30, max: 50000 })
    .withMessage('Script must be between 30 and 50,000 characters'),
  
  body('duration')
    .isFloat({ min: 10, max: 3600 })
    .withMessage('Duration must be between 10 and 3600 seconds'),
  
  body('maxImagesPerMin')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Max images per minute must be between 1 and 10')
];

// Error handling middleware for validation
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.error('❌ Script images validation failed:', {
      method: req.method,
      path: req.path,
      body: {
        script: req.body.script ? `${req.body.script.substring(0, 100)}... (length: ${req.body.script.length})` : 'missing',
        duration: req.body.duration,
        maxImagesPerMin: req.body.maxImagesPerMin,
        projectId: req.body.projectId
      },
      errors: errors.array()
    });
    
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// Routes

/**
 * @route   POST /api/v1/script-images/generate
 * @desc    Generate images for script timeline (batch mode - legacy)
 * @access  Private
 * @body    { script: string, duration: number, maxImagesPerMin?: number, projectId: string }
 */
router.post(
  '/generate',
  authenticate,
  validateScriptImageGeneration,
  handleValidationErrors,
  generateScriptImages
);

/**
 * @route   POST /api/v1/script-images/generate-stream
 * @desc    Initialize Server-Sent Events streaming session for script image generation
 * @access  Private
 * @body    { script: string, duration: number, maxImagesPerMin?: number, projectId: string }
 */
router.post(
  '/generate-stream',
  authenticate,
  validateScriptImageGeneration,
  handleValidationErrors,
  generateScriptImagesStream
);

/**
 * @route   GET /api/v1/script-images/generate-stream
 * @desc    Stream images for script timeline using Server-Sent Events
 * @access  Private
 * @query   { script: string, duration: number, maxImagesPerMin?: number, projectId: string, token?: string }
 */
router.get(
  '/generate-stream',
  // Note: authenticate middleware might not work with query token, so we handle auth in controller
  generateScriptImagesStream
);

/**
 * @route   POST /api/v1/script-images/estimate
 * @desc    Get generation estimates for script parameters
 * @access  Private
 * @body    { script: string, duration: number, maxImagesPerMin?: number }
 */
router.post(
  '/estimate',
  authenticate,
  validateEstimatesRequest,
  handleValidationErrors,
  getGenerationEstimates
);

/**
 * @route   POST /api/v1/script-images/validate
 * @desc    Validate script parameters and get estimates
 * @access  Private
 * @body    { script: string, duration: number, maxImagesPerMin?: number, projectId: string }
 */
router.post(
  '/validate',
  authenticate,
  validateScriptImageGeneration,
  handleValidationErrors,
  validateScriptParams
);

module.exports = router;
