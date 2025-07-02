const voiceService = require('../services/voiceService');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const multer = require('multer');
const path = require('path');

// Configure multer for audio file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is audio
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new ErrorResponse('Please upload an audio file', 400), false);
    }
  }
});

/**
 * @desc    Get all available voices
 * @route   GET /api/v1/voice/voices
 * @access  Private
 */
const getVoices = asyncHandler(async (req, res, next) => {
  try {
    const voices = await voiceService.getVoices();
    
    res.status(200).json({
      success: true,
      count: voices.length,
      data: {
        voices: voices
      }
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 500));
  }
});

/**
 * @desc    Get voice by ID
 * @route   GET /api/v1/voice/voices/:id
 * @access  Private
 */
const getVoiceById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return next(new ErrorResponse('Voice ID is required', 400));
    }
    
    const voice = await voiceService.getVoiceById(id);
    
    res.status(200).json({
      success: true,
      data: {
        voice: voice
      }
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 404));
  }
});

/**
 * @desc    Generate speech from text
 * @route   POST /api/v1/voice/generate
 * @access  Private
 */
const generateSpeech = asyncHandler(async (req, res, next) => {
  try {
    const {
      text,
      voiceId,
      voiceSettings,
      storyId,
      storyTitle,
      outputFormat = 'mp3'
    } = req.body;

    // Validate required fields
    if (!text || text.trim().length === 0) {
      return next(new ErrorResponse('Text is required for voice generation', 400));
    }

    if (!voiceId) {
      return next(new ErrorResponse('Voice ID is required', 400));
    }

    // Validate text length (ElevenLabs has character limits)
    if (text.length > 5000) {
      return next(new ErrorResponse('Text is too long. Maximum 5000 characters allowed.', 400));
    }

    // Validate and clean voice settings
    const validatedSettings = voiceService.validateVoiceSettings(voiceSettings || {});

    // Generate speech
    const audioBuffer = await voiceService.generateSpeech({
      text: text,
      voiceId: voiceId,
      voiceSettings: validatedSettings
    });

    // Generate filename
    const timestamp = Date.now();
    let baseFilename = 'generated';
    
    if (storyTitle) {
      // Sanitize story title for filename (remove invalid characters)
      baseFilename = storyTitle
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 30); // Limit length
    } else if (storyId) {
      baseFilename = storyId;
    }
    
    const filename = `voice_${baseFilename}_${timestamp}.mp3`;
    
    // Save audio file
    const filePath = await voiceService.saveAudioFile(audioBuffer, filename);

    // Return response
    res.status(200).json({
      success: true,
      message: 'Voice generated successfully',
      data: {
        audioUrl: `/uploads/audio/${filename}`,
        filename: filename,
        size: audioBuffer.length,
        duration: null, // Could be calculated with audio libraries
        voiceId: voiceId,
        settings: validatedSettings,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Voice generation error:', error);
    return next(new ErrorResponse(error.message, 500));
  }
});

/**
 * @desc    Clone voice from uploaded audio
 * @route   POST /api/v1/voice/clone
 * @access  Private
 */
const cloneVoice = asyncHandler(async (req, res, next) => {
  try {
    const { name, description } = req.body;
    
    if (!name || name.trim().length === 0) {
      return next(new ErrorResponse('Voice name is required', 400));
    }

    if (!req.files || req.files.length === 0) {
      return next(new ErrorResponse('At least one audio file is required', 400));
    }

    // Prepare audio files for cloning
    const audioFiles = req.files.map(file => ({
      data: file.buffer,
      name: file.originalname
    }));

    // Clone voice
    const clonedVoice = await voiceService.cloneVoice({
      name: name.trim(),
      description: description || 'Custom cloned voice',
      audioFiles: audioFiles
    });

    res.status(201).json({
      success: true,
      message: 'Voice cloned successfully',
      data: {
        voice: clonedVoice
      }
    });

  } catch (error) {
    console.error('Voice cloning error:', error);
    return next(new ErrorResponse(error.message, 500));
  }
});

/**
 * @desc    Get user subscription information
 * @route   GET /api/v1/voice/subscription
 * @access  Private
 */
const getSubscription = asyncHandler(async (req, res, next) => {
  try {
    const subscription = await voiceService.getSubscriptionInfo();
    
    res.status(200).json({
      success: true,
      data: {
        subscription: subscription
      }
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 500));
  }
});

/**
 * @desc    Generate voice for story content
 * @route   POST /api/v1/voice/story/:storyId
 * @access  Private
 */
const generateStoryVoice = asyncHandler(async (req, res, next) => {
  try {
    const { storyId } = req.params;
    const {
      voiceId,
      voiceSettings,
      outputFormat = 'mp3'
    } = req.body;

    // TODO: Fetch story content from database
    // For now, we'll expect the content to be provided in the request
    const { content } = req.body;

    if (!content) {
      return next(new ErrorResponse('Story content is required', 400));
    }

    if (!voiceId) {
      return next(new ErrorResponse('Voice ID is required', 400));
    }

    // Validate content length
    if (content.length > 5000) {
      return next(new ErrorResponse('Story content is too long. Maximum 5000 characters allowed.', 400));
    }

    // Validate and clean voice settings
    const validatedSettings = voiceService.validateVoiceSettings(voiceSettings || {});

    // Generate speech
    const audioBuffer = await voiceService.generateSpeech({
      text: content,
      voiceId: voiceId,
      voiceSettings: validatedSettings
    });

    // Generate filename with story ID
    const timestamp = Date.now();
    const filename = `story_${storyId}_voice_${timestamp}.mp3`;
    
    // Save audio file
    const filePath = await voiceService.saveAudioFile(audioBuffer, filename);

    // TODO: Update story record in database with audio URL

    res.status(200).json({
      success: true,
      message: 'Story voice generated successfully',
      data: {
        storyId: storyId,
        audioUrl: `/uploads/audio/${filename}`,
        filename: filename,
        size: audioBuffer.length,
        voiceId: voiceId,
        settings: validatedSettings,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Story voice generation error:', error);
    return next(new ErrorResponse(error.message, 500));
  }
});

/**
 * @desc    Process user uploaded audio
 * @route   POST /api/v1/voice/upload
 * @access  Private
 */
const uploadUserAudio = asyncHandler(async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new ErrorResponse('Audio file is required', 400));
    }

    const { storyId } = req.body;
    
    // Generate filename
    const timestamp = Date.now();
    const fileExtension = path.extname(req.file.originalname);
    const filename = `user_audio_${storyId || 'upload'}_${timestamp}${fileExtension}`;
    
    // Save uploaded audio file
    const filePath = await voiceService.saveAudioFile(req.file.buffer, filename);

    res.status(200).json({
      success: true,
      message: 'Audio uploaded successfully',
      data: {
        audioUrl: `/uploads/audio/${filename}`,
        filename: filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        uploadedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Audio upload error:', error);
    return next(new ErrorResponse(error.message, 500));
  }
});

module.exports = {
  getVoices,
  getVoiceById,
  generateSpeech,
  cloneVoice,
  getSubscription,
  generateStoryVoice,
  uploadUserAudio,
  upload // Export multer middleware
};
