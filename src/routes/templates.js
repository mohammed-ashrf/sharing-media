const express = require('express');
const { body, validationResult } = require('express-validator');
const { 
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  useTemplate,
  getPublicTemplates,
  favoriteTemplate,
  unfavoriteTemplate
} = require('../controllers/templateController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Validation middleware for template creation
const validateTemplate = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Template name must be between 1 and 100 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  
  body('category')
    .isIn(['Business', 'Entertainment', 'Education', 'Social Media', 'Marketing', 'Personal', 'Other'])
    .withMessage('Invalid category'),
  
  body('settings.storyStyle')
    .isIn(['landscape', 'square', 'vertical'])
    .withMessage('Story style must be landscape, square, or vertical'),
  
  body('settings.storyLength')
    .isInt({ min: 30, max: 10800 })
    .withMessage('Story length must be between 30 seconds and 3 hours'),
  
  body('settings.selectedGenre')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Genre must not exceed 50 characters'),
];

// Handle validation errors
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

// Get public templates (no auth required)
router.get('/public', getPublicTemplates);

// User-specific template routes (require authentication)
router.route('/')
  .get(authenticate, getTemplates)
  .post(authenticate, validateTemplate, handleValidationErrors, createTemplate);

router.route('/:id')
  .get(authenticate, getTemplate)
  .put(authenticate, validateTemplate, handleValidationErrors, updateTemplate)
  .delete(authenticate, deleteTemplate);

// Use template to create a story
router.post('/:id/use', authenticate, useTemplate);

// Favorite/unfavorite templates
router.post('/:id/favorite', authenticate, favoriteTemplate);
router.delete('/:id/favorite', authenticate, unfavoriteTemplate);

module.exports = router;
