const express = require('express');
const {
  getVoices,
  getVoiceById,
  generateSpeech,
  cloneVoice,
  getSubscription,
  generateStoryVoice,
  uploadUserAudio,
  upload
} = require('../controllers/voiceController');

// Import middleware
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All voice routes require authentication
router.use(authenticate);

// Voice management routes
router.route('/voices')
  .get(getVoices);

router.route('/voices/:id')
  .get(getVoiceById);

// Voice generation routes
router.route('/generate')
  .post(generateSpeech);

router.route('/story/:storyId')
  .post(generateStoryVoice);

// Voice cloning routes
router.route('/clone')
  .post(upload.array('audioFiles', 5), cloneVoice);

// User audio upload
router.route('/upload')
  .post(upload.single('audioFile'), uploadUserAudio);

// Subscription information
router.route('/subscription')
  .get(getSubscription);

module.exports = router;
