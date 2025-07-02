const express = require('express');
const { body, validationResult } = require('express-validator');
const { 
  generateStory, 
  getGenerationStatus,
  getStories,
  getStory,
  createStory,
  updateStory,
  deleteStory,
  generateStorySummary
} = require('../controllers/storyController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Validation middleware for story generation
const validateStoryGeneration = [
  body('storyStyle')
    .isIn(['landscape', 'square', 'vertical'])
    .withMessage('Story style must be landscape, square, or vertical'),
  
  body('storyName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Story name must be between 1 and 50 characters'),
  
  body('storyLength')
    .isInt({ min: 30, max: 10800 })
    .withMessage('Story length must be between 30 seconds and 3 hours (10800 seconds)'),
  
  body('storyTopic')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Story topic must be between 10 and 500 characters'),
  
  body('characterDetails')
    .optional()
    .trim()
    .isLength({ max: 150 })
    .withMessage('Character details must not exceed 150 characters'),
  
  body('settingAtmosphere')
    .optional()
    .trim()
    .isLength({ max: 150 })
    .withMessage('Setting/atmosphere must not exceed 150 characters'),
  
  body('selectedGenre')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Genre must not exceed 50 characters'),
  
  body('selectedFormat')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Format must not exceed 50 characters'),
  
  body('selectedNarrative')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Narrative perspective must not exceed 50 characters'),
  
  body('selectedAgeGroup')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Age group must not exceed 50 characters'),
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

// Routes
router.route('/')
  .get(authenticate, getStories) // Get all stories for user
  .post(authenticate, createStory); // Create a new story

router.route('/generate')
  .post(
    authenticate, // Require authentication
    validateStoryGeneration,
    handleValidationErrors,
    generateStory
  );

router.route('/status')
  .get(authenticate, getGenerationStatus);

router.route('/:id')
  .get(authenticate, getStory) // Get single story
  .put(authenticate, updateStory) // Update story
  .delete(authenticate, deleteStory); // Delete story

router.route('/:id/summary')
  .post(authenticate, generateStorySummary); // Generate AI summary

module.exports = router;
