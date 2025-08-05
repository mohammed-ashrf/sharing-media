const express = require('express');
const router = express.Router();
const MurfAiService = require('../services/murfAiService');
const { authenticate } = require('../middleware/auth');

// Initialize the service instance
let murfAiService;

// Function to ensure voice service is initialized
function getVoiceService() {
  if (!murfAiService) {
    murfAiService = new MurfAiService();
  }
  return murfAiService;
}

/**
 * @route   GET /api/v1/voices
 * @desc    Get all available Murf AI voices
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const voices = await getVoiceService().getVoices();
    
    res.json({
      success: true,
      data: {
        voices: voices,
        count: voices.length
      }
    });
  } catch (error) {
    console.error('Error fetching Murf AI voices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voices from Murf AI',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/v1/voices/:voiceId/sample
 * @desc    Get voice sample audio or info from Murf AI
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

    // Get voice details which may include sample info
    const voice = await getVoiceService().getVoiceById(voiceId);
    
    if (!voice) {
      return res.status(404).json({
        success: false,
        message: 'Voice not found in Murf AI catalog'
      });
    }

    // For Murf AI, we'll return voice information including sample text capability
    // Since Murf AI doesn't provide pre-recorded samples, we can generate a short demo
    res.json({
      success: true,
      data: {
        voice: voice,
        sampleAvailable: true,
        sampleText: voice.sampleText || "Hello, this is a sample of my voice. I can help bring your stories to life with natural and expressive speech.",
        instructions: "Use the /api/v1/voice/generate-sample endpoint to generate an audio sample with custom text"
      }
    });

  } catch (error) {
    console.error('Error getting voice sample info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get voice sample information',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/v1/voices/generate-sample
 * @desc    Generate a voice sample with custom text using Murf AI
 * @access  Private
 */
router.post('/generate-sample', authenticate, async (req, res) => {
  try {
    const { voiceId, text } = req.body;
    
    if (!voiceId) {
      return res.status(400).json({
        success: false,
        message: 'Voice ID is required'
      });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Sample text is required'
      });
    }

    // Limit sample text length
    if (text.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Sample text must be 200 characters or less'
      });
    }

    // Generate voice sample using Murf AI
    const audioBuffer = await getVoiceService().generateSpeech({
      text: text.trim(),
      voiceId: voiceId,
      voiceSettings: { speed: 1.0, volume: 1.0 } // Default settings for sample
    });

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('No audio data received from Murf AI');
    }

    // Return audio as blob response
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Content-Disposition': `attachment; filename="voice_sample_${voiceId}_${Date.now()}.mp3"`,
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'X-Voice-Sample-Metadata': JSON.stringify({
        voiceId: voiceId,
        text: text,
        generatedAt: new Date().toISOString(),
        service: 'MurfAI'
      })
    });

    res.status(200).send(audioBuffer);

  } catch (error) {
    console.error('Error generating voice sample:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate voice sample with Murf AI',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/v1/voices/:voiceId
 * @desc    Get specific voice details from Murf AI
 * @access  Private
 */
router.get('/:voiceId', authenticate, async (req, res) => {
  try {
    const { voiceId } = req.params;
    
    if (!voiceId) {
      return res.status(400).json({
        success: false,
        message: 'Voice ID is required'
      });
    }

    const voice = await getVoiceService().getVoiceById(voiceId);
    
    if (!voice) {
      return res.status(404).json({
        success: false,
        message: 'Voice not found in Murf AI catalog'
      });
    }

    res.json({
      success: true,
      data: {
        voice: voice
      }
    });

  } catch (error) {
    console.error('Error fetching voice details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voice details from Murf AI',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/v1/voices/categories/list
 * @desc    Get voice categories from Murf AI
 * @access  Private
 */
router.get('/categories/list', authenticate, async (req, res) => {
  try {
    const voices = await getVoiceService().getVoices();
    
    // Extract unique categories from voices
    const categories = [...new Set(voices.map(voice => voice.category || 'General'))];
    
    // Group voices by category
    const voicesByCategory = {};
    categories.forEach(category => {
      voicesByCategory[category] = voices.filter(voice => 
        (voice.category || 'General') === category
      );
    });

    res.json({
      success: true,
      data: {
        categories: categories,
        voicesByCategory: voicesByCategory,
        totalVoices: voices.length
      }
    });

  } catch (error) {
    console.error('Error fetching voice categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voice categories',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/v1/voices/clear-cache
 * @desc    Clear Murf AI voice cache (admin only)
 * @access  Private
 */
router.post('/clear-cache', authenticate, async (req, res) => {
  try {
    // Add admin check here if needed
    const success = await getVoiceService().clearCache();
    
    if (success) {
      res.json({
        success: true,
        message: 'Murf AI voice cache cleared successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to clear Murf AI cache'
      });
    }
  } catch (error) {
    console.error('Error clearing Murf AI cache:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear Murf AI cache',
      error: error.message
    });
  }
});

module.exports = router;
