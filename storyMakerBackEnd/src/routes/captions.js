const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  generateCaptionsFromAudio,
  generateCaptionsFromText,
  generateCaptionsForStory,
  getStoryCaptions,
  deleteStoryCaptions,
  getCaptionStatus
} = require('../controllers/captionController');

// Import middleware
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Validation middleware for audio caption generation
const validateAudioCaptions = [
  body('audioFilePath')
    .notEmpty()
    .withMessage('Audio file path is required'),
  
  body('language')
    .optional()
    .isIn(['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'])
    .withMessage('Language must be a supported language code'),
  
  body('format')
    .optional()
    .isIn(['srt', 'vtt', 'json', 'txt'])
    .withMessage('Format must be srt, vtt, json, or txt'),
  
  body('storyId')
    .optional()
    .isMongoId()
    .withMessage('Story ID must be a valid MongoDB ObjectId'),
  
  body('includeTimestamps')
    .optional()
    .isBoolean()
    .withMessage('Include timestamps must be a boolean')
];

// Validation middleware for text caption generation
const validateTextCaptions = [
  body('storyContent')
    .notEmpty()
    .isLength({ min: 10, max: 50000 })
    .withMessage('Story content is required and must be between 10 and 50,000 characters'),
  
  body('wordsPerMinute')
    .optional()
    .isInt({ min: 80, max: 300 })
    .withMessage('Words per minute must be between 80 and 300'),
  
  body('maxWordsPerCaption')
    .optional()
    .isInt({ min: 3, max: 15 })
    .withMessage('Max words per caption must be between 3 and 15'),
  
  body('format')
    .optional()
    .isIn(['srt', 'vtt', 'json', 'txt'])
    .withMessage('Format must be srt, vtt, json, or txt'),
  
  body('language')
    .optional()
    .isIn(['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'])
    .withMessage('Language must be a supported language code'),
  
  body('storyId')
    .optional()
    .isMongoId()
    .withMessage('Story ID must be a valid MongoDB ObjectId'),
  
  body('useAI')
    .optional()
    .isBoolean()
    .withMessage('Use AI must be a boolean')
];

// Validation middleware for story caption generation
const validateStoryCaptions = [
  body('source')
    .optional()
    .isIn(['auto', 'audio', 'text'])
    .withMessage('Source must be auto, audio, or text'),
  
  body('format')
    .optional()
    .isIn(['srt', 'vtt', 'json', 'txt'])
    .withMessage('Format must be srt, vtt, json, or txt'),
  
  body('useAI')
    .optional()
    .isBoolean()
    .withMessage('Use AI must be a boolean'),
  
  body('wordsPerMinute')
    .optional()
    .isInt({ min: 80, max: 300 })
    .withMessage('Words per minute must be between 80 and 300'),
  
  body('maxWordsPerCaption')
    .optional()
    .isInt({ min: 3, max: 15 })
    .withMessage('Max words per caption must be between 3 and 15')
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

// All caption routes require authentication
router.use(authenticate);

// Generate captions from audio file (Whisper AI)
router.route('/from-audio')
  .post(
    validateAudioCaptions,
    handleValidationErrors,
    generateCaptionsFromAudio
  );

// Generate captions from text content
router.route('/from-text')
  .post(
    validateTextCaptions,
    handleValidationErrors,
    generateCaptionsFromText
  );

// Generate captions for existing story
router.route('/story/:storyId')
  .post(
    validateStoryCaptions,
    handleValidationErrors,
    generateCaptionsForStory
  )
  .get(getStoryCaptions)
  .delete(deleteStoryCaptions);

// Caption service status
router.route('/status')
  .get(getCaptionStatus);

module.exports = router;
