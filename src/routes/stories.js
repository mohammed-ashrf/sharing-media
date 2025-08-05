const express = require('express');
const { body, validationResult } = require('express-validator');
const { 
  generateStory, 
  getGenerationStatus,
  getVideoStyles,
  getStories,
  getStory,
  createStory,
  updateStory,
  deleteStory,
  generateStorySummary,
  searchStories,
  exportStory,
  duplicateStory,
  generateIdeas
} = require('../controllers/storyController');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

// Validation middleware for story generation (supports both new and legacy formats)
const validateStoryGeneration = [
  // Video style validation (new) - prioritized over legacy storyStyle
  body('videoStyle')
    .optional()
    .isIn(['redditStorytime', 'didYouKnow', 'motivation', 'quizGame', 'memeGoogleSearch', 'dialogueSkit', 'newsExplainer', 'lifePOV'])
    .withMessage('Video style must be one of: redditStorytime, didYouKnow, motivation, quizGame, memeGoogleSearch, dialogueSkit, newsExplainer, lifePOV'),
  
  // Legacy story style validation for backward compatibility
  body('storyStyle')
    .optional()
    .isIn(['landscape', 'square', 'vertical', 'redditStorytime', 'didYouKnow', 'motivation', 'quizGame', 'memeGoogleSearch', 'dialogueSkit', 'newsExplainer', 'lifePOV'])
    .withMessage('Story style must be a valid format or video style'),
  
  body('storyName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Story name must be between 1 and 50 characters'),
  
  body('storyLength')
    .isInt({ min: 30, max: 10800 })
    .withMessage('Story length must be between 30 seconds and 3 hours (10800 seconds)'),
  
  // New video idea field (prioritized over legacy storyTopic)
  body('videoIdea')
    .optional()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Video idea must be between 10 and 500 characters'),
  
  // Legacy story topic for backward compatibility
  body('storyTopic')
    .optional()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Story topic must be between 10 and 500 characters'),
  
  // New language field
  body('selectedLanguage')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Language must be between 2 and 50 characters'),
  
  // Legacy language field
  body('language')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Language must be between 2 and 50 characters'),
  
  // New emotions array
  body('selectedEmotions')
    .optional()
    .isArray({ max: 4 })
    .withMessage('Selected emotions must be an array with maximum 4 items'),
  
  body('selectedEmotions.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each emotion must be between 1 and 50 characters'),
  
  // New additional context array
  body('additionalContext')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Additional context must be an array with maximum 10 items'),
  
  body('additionalContext.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Each context item must be between 1 and 200 characters'),
  
  // Legacy optional fields
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

// Validation error handler with custom logic for new/legacy field requirements
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

  // Custom validation: Ensure either new fields or legacy fields are provided
  const { videoStyle, storyStyle, videoIdea, storyTopic } = req.body;
  
  // Check if we have either video style or story style
  if (!videoStyle && !storyStyle) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: [{
        field: 'videoStyle/storyStyle',
        message: 'Either videoStyle or storyStyle is required',
        value: null
      }]
    });
  }

  // Check if we have either video idea or story topic
  if (!videoIdea && !storyTopic) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: [{
        field: 'videoIdea/storyTopic',
        message: 'Either videoIdea or storyTopic is required',
        value: null
      }]
    });
  }

  next();
};

// Validation middleware for generating ideas
const validateIdeaGeneration = [
  body('niche')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Niche must be between 1 and 100 characters'),
  
  body('videoStyle')
    .isIn(['redditStorytime', 'didYouKnow', 'motivation', 'quizGame', 'memeGoogleSearch', 'dialogueSkit', 'newsExplainer', 'lifePOV'])
    .withMessage('Video style must be one of: redditStorytime, didYouKnow, motivation, quizGame, memeGoogleSearch, dialogueSkit, newsExplainer, lifePOV'),
  
  // Handle validation errors
  (req, res, next) => {
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
  }
];

// Test endpoint for frontend development (no auth required) - MUST be before auth middleware
router.route('/test')
  .get((req, res) => {
    res.status(200).json({
      success: true,
      message: 'Test stories for development',
      data: {
        stories: [
          {
            _id: 'test_story_1',
            name: 'Mountain Adventure',
            userId: 'test_user',
            style: 'landscape',
            duration: 120,
            formattedDuration: '2:00',
            topic: 'Adventure',
            content: 'A thrilling mountain adventure story...',
            headline: 'Epic Mountain Journey',
            description: 'Follow our hero on an incredible adventure',
            tags: ['adventure', 'mountains'],
            searchPhrases: ['mountains', 'adventure', 'nature'],
            status: 'completed',
            thumbnail: 'https://picsum.photos/320/180?random=1',
            videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            audioUrl: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav',
            wordCount: 250,
            estimatedReadingTime: 2,
            aspectRatio: '16:9',
            generatedBy: 'OpenAI GPT-4',
            createdAt: new Date().toISOString()
          },
          {
            _id: 'test_story_2',
            name: 'Ocean Discovery',
            userId: 'test_user',
            style: 'landscape',
            duration: 90,
            formattedDuration: '1:30',
            topic: 'Ocean',
            content: 'An underwater exploration story...',
            headline: 'Deep Ocean Mysteries',
            description: 'Discover underwater wonders',
            tags: ['ocean', 'documentary'],
            searchPhrases: ['ocean', 'underwater', 'marine'],
            status: 'completed',
            thumbnail: 'https://picsum.photos/320/180?random=2',
            videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
            audioUrl: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav',
            captions: [
              { id: 'cap1', text: 'Deep beneath the ocean surface...', startTime: 0, endTime: 4 },
              { id: 'cap2', text: 'Mysteries await discovery.', startTime: 4, endTime: 8 }
            ],
            wordCount: 180,
            estimatedReadingTime: 1.5,
            aspectRatio: '16:9',
            generatedBy: 'OpenAI GPT-4',
            createdAt: new Date().toISOString()
          }
        ],
        count: 2
      }
    });
  });

// Routes with authentication
router.route('/')
  .get(authenticate, getStories) // Get all stories for user with filtering and search
  .post(authenticate, requirePermission('canCreateStories'), createStory); // Create a new story

router.route('/generate')
  .post(
    authenticate, // Require authentication
    requirePermission('canCreateStories'), // Require story creation permission
    validateStoryGeneration,
    handleValidationErrors,
    generateStory
  );

router.route('/generate-ideas')
  .post(
    authenticate, // Require authentication
    requirePermission('canCreateStories'), // Require story creation permission
    validateIdeaGeneration,
    generateIdeas
  );

router.route('/search')
  .get(authenticate, searchStories); // Advanced search endpoint

router.route('/export/:id')
  .get(authenticate, requirePermission('canExportVideo'), exportStory); // Export story in different formats

router.route('/duplicate/:id')
  .post(authenticate, requirePermission('canCreateStories'), duplicateStory); // Duplicate an existing story

// Video rendering endpoint
router.route('/render-video')
  .post(authenticate, async (req, res) => {
    try {
      const { audioTracks, videoClips, soundtracks, duration, subtitleStyle, volumes } = req.body;
      
      // Mock video rendering response for now
      const renderedVideoUrl = 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_5mb.mp4';
      
      res.json({
        success: true,
        data: {
          videoUrl: renderedVideoUrl,
          duration: duration,
          renderTime: Date.now(),
          status: 'completed'
        }
      });
    } catch (error) {
      console.error('Video rendering error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to render video'
      });
    }
  });

router.route('/status')
  .get(authenticate, getGenerationStatus);

router.route('/video-styles')
  .get(authenticate, getVideoStyles);

router.route('/:id')
  .get(authenticate, getStory) // Get single story
  .put(authenticate, requirePermission('canEditStories'), updateStory) // Update story
  .delete(authenticate, requirePermission('canDeleteStories'), deleteStory); // Delete story

router.route('/:id/summary')
  .post(authenticate, generateStorySummary); // Generate AI summary

module.exports = router;
