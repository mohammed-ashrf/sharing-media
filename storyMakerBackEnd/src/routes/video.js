const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  generateVideoTimeline,
  getVideoTimeline,
  searchMediaPreview,
  getVideoStatus,
  deleteVideoTimeline
} = require('../controllers/videoController');

// Import middleware
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Validation middleware for video timeline generation
const validateVideoGeneration = [
  body('searchPhrases')
    .isArray({ min: 1 })
    .withMessage('Search phrases must be a non-empty array'),
  
  body('searchPhrases.*')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Each search phrase must be between 1 and 100 characters'),
  
  body('duration')
    .isInt({ min: 10, max: 600 })
    .withMessage('Duration must be between 10 and 600 seconds'),
  
  body('orientation')
    .optional()
    .isIn(['landscape', 'portrait', 'square'])
    .withMessage('Orientation must be landscape, portrait, or square'),
  
  body('storyId')
    .optional()
    .isMongoId()
    .withMessage('Story ID must be a valid MongoDB ObjectId'),
  
  body('customPhrases')
    .optional()
    .isArray()
    .withMessage('Custom phrases must be an array'),
  
  body('customPhrases.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Each custom phrase must be between 1 and 100 characters')
];

// Validation middleware for media search preview
const validateMediaSearch = [
  body('searchPhrases')
    .isArray({ min: 1 })
    .withMessage('Search phrases must be a non-empty array'),
  
  body('searchPhrases.*')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Each search phrase must be between 1 and 100 characters'),
  
  body('orientation')
    .optional()
    .isIn(['landscape', 'portrait', 'square'])
    .withMessage('Orientation must be landscape, portrait, or square'),
  
  body('maxResults')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Max results must be between 1 and 50')
];

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// All video routes require authentication
router.use(authenticate);

// Video timeline generation
router.route('/generate-timeline')
  .post(
    validateVideoGeneration,
    handleValidationErrors,
    generateVideoTimeline
  );

// Get video timeline for a story
router.route('/timeline/:storyId')
  .get(getVideoTimeline)
  .delete(deleteVideoTimeline);

// Media search preview (no download)
router.route('/search-preview')
  .post(
    validateMediaSearch,
    handleValidationErrors,
    searchMediaPreview
  );

// Video service status
router.route('/status')
  .get(getVideoStatus);

module.exports = router;
