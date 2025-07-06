const express = require('express');
const { authenticate } = require('../middleware/auth');
const { uploadSingle, uploadMultiple, validateUpload } = require('../middleware/upload');
const {
  validateMediaSearch,
  validateMediaUpload,
  validateSaveExternalMedia,
  validateMediaLibraryQuery,
  validateMediaId
} = require('../middleware/validation');
const {
  getMediaLibrary,
  uploadMedia,
  uploadMultipleMedia,
  searchExternalMedia,
  saveExternalMedia,
  getMediaById,
  updateMedia,
  deleteMedia,
  getProcessingStatus
} = require('../controllers/mediaController');

const router = express.Router();

// Get media library
router.route('/')
  .get(authenticate, validateMediaLibraryQuery, getMediaLibrary);

// Search online media (Pexels/Pixabay)
router.route('/search')
  .post(authenticate, validateMediaSearch, searchExternalMedia);

// Save external media to library
router.route('/external')
  .post(authenticate, validateSaveExternalMedia, saveExternalMedia);

// Upload media file(s)
router.route('/upload')
  .post(authenticate, uploadSingle('file'), validateUpload, validateMediaUpload, uploadMedia);

// Upload multiple media files
router.route('/upload/multiple')
  .post(authenticate, uploadMultiple('files', 5), validateUpload, uploadMultipleMedia);

// Get processing status
router.route('/processing/status')
  .get(authenticate, getProcessingStatus);

// Media by ID operations
router.route('/:id')
  .get(authenticate, validateMediaId, getMediaById)
  .put(authenticate, validateMediaId, validateMediaUpload, updateMedia)
  .delete(authenticate, validateMediaId, deleteMedia);

module.exports = router;
