const express = require('express');
const {
  getVoices,
  getVoiceById,
  generateSpeech,
  generateSpeechBlob,
  cloneVoice,
  getSubscription,
  generateStoryVoice,
  uploadUserAudio,
  serveAudioFile,
  upload
} = require('../controllers/voiceController');

// Import middleware
const { authenticate, requirePermission } = require('../middleware/auth');
const { checkCredits, deductCredits } = require('../middleware/credits');

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
  .post(
    requirePermission('canUseVoiceGeneration'),
    checkCredits(10), // 10 credits per voice generation
    deductCredits(10),
    generateSpeech
  );

router.route('/generate-blob')
  .post(
    requirePermission('canUseVoiceGeneration'),
    checkCredits(10),
    deductCredits(10),
    generateSpeechBlob
  );

router.route('/story/:storyId')
  .post(
    requirePermission('canUseVoiceGeneration'),
    checkCredits(25), // 25 credits for story voice generation
    deductCredits(25),
    generateStoryVoice
  );

// Voice cloning routes
router.route('/clone')
  .post(
    requirePermission('canUseVoiceGeneration'),
    checkCredits(100), // 100 credits for voice cloning
    upload.array('audioFiles', 5),
    deductCredits(100),
    cloneVoice
  );

// User audio upload
router.route('/upload')
  .post(upload.single('audioFile'), uploadUserAudio);

// Subscription information
router.route('/subscription')
  .get(getSubscription);

// Serve generated audio files
router.route('/audio/:filename')
  .get(serveAudioFile);

module.exports = router;
