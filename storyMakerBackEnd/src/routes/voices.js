const express = require('express');
const router = express.Router();
const ElevenLabsVoiceService = require('../services/elevenLabsVoiceService');
const { authenticate } = require('../middleware/auth');

// Initialize the service instance
const elevenLabsVoiceService = new ElevenLabsVoiceService();

/**
 * @route   GET /api/v1/voices
 * @desc    Get all available ElevenLabs voices
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const voices = await elevenLabsVoiceService.getVoices();
    
    res.json({
      success: true,
      data: {
        voices: voices,
        count: voices.length
      }
    });
  } catch (error) {
    console.error('Error fetching voices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voices',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/v1/voices/:voiceId/sample
 * @desc    Get voice sample audio
 * @access  Private
 */
router.get('/:voiceId/sample', authenticate, async (req, res) => {
  try {
    const { voiceId } = req.params;
    
    if (!voiceId) {
      return res.status(400).json({
        success: false,
        message: 'Voice ID is required'
      });
    }

    const result = await elevenLabsVoiceService.getVoiceSample(voiceId);
    
    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.error || 'Voice sample not found'
      });
    }

    // Set CORS headers for audio streaming
    res.set({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type'
    });

    // Stream the audio file
    const fs = require('fs');
    const path = require('path');
    
    // Check if file exists
    if (!fs.existsSync(result.filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Audio file not found'
      });
    }
    
    const audioStream = fs.createReadStream(result.filePath);
    
    audioStream.on('error', (error) => {
      console.error('Error streaming audio:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Failed to stream audio'
        });
      }
    });

    audioStream.pipe(res);
  } catch (error) {
    console.error('Error serving voice sample:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to serve voice sample',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/v1/voices/clear-cache
 * @desc    Clear voice cache (admin only)
 * @access  Private
 */
router.post('/clear-cache', authenticate, async (req, res) => {
  try {
    // Add admin check here if needed
    const success = await elevenLabsVoiceService.clearCache();
    
    if (success) {
      res.json({
        success: true,
        message: 'Voice cache cleared successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to clear cache'
      });
    }
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
      error: error.message
    });
  }
});

module.exports = router;
