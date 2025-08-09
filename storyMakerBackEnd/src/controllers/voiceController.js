const MurfAiService = require('../services/murfAiService');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const multer = require('multer');
const path = require('path');
const OpenAI = require('openai');

// Initialize services after environment variables are loaded
let murfAiService;

// Function to ensure voice service is initialized
function getVoiceService() {
  if (!murfAiService) {
    murfAiService = new MurfAiService();
  }
  return murfAiService;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
    const voices = await getVoiceService().getVoices();
    
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
    
    const voice = await getVoiceService().getVoiceById(id);
    
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
 * @desc    Generate speech from text (with OpenAI voice direction optimization)
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
      outputFormat = 'mp3',
      returnAsFile = false // New parameter to control whether to save file or return as blob
    } = req.body;

    // Validate required fields
    if (!text || text.trim().length === 0) {
      return next(new ErrorResponse('Text is required for voice generation', 400));
    }

    if (!voiceId) {
      return next(new ErrorResponse('Voice ID is required', 400));
    }

    // Validate text length (reasonable limit for processing)
    if (text.length > 20000) {
      return next(new ErrorResponse('Text is too long. Maximum 20,000 characters allowed.', 400));
    }

    // Validate and clean voice settings
    const validatedSettings = getVoiceService().validateVoiceSettings(voiceSettings || {});

    // Step 2: Generate speech with Murf AI using optimized script
    console.log('🎙️ Generating voice with Murf AI...');
    
    let audioBuffer;
    try {
      audioBuffer = await getVoiceService().generateSpeech({
        text: text,
        voiceId: voiceId,
        voiceSettings: validatedSettings
      });

      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error('No audio data received from Murf AI');
      }

      console.log(`✅ Voice generation successful: ${audioBuffer.length} bytes`);
    } catch (voiceError) {
      console.error('❌ Voice generation failed:', voiceError.message);
      
      // Enhanced error handling for Murf AI specific errors
      if (voiceError.message.includes('api-key')) {
        return next(new ErrorResponse('Murf AI API key is missing or invalid. Please check your configuration.', 401));
      } else if (voiceError.message.includes('Missing \'api-key\'')) {
        return next(new ErrorResponse('Murf AI API authentication failed. Please check your API key configuration.', 401));
      } else if (voiceError.message.includes('Bad request')) {
        return next(new ErrorResponse('Invalid request to Murf AI. Please check your voice ID and text content.', 400));
      } else if (voiceError.message.includes('Insufficient credits')) {
        return next(new ErrorResponse('Insufficient credits in your Murf AI account. Please upgrade your plan.', 402));
      } else {
        return next(new ErrorResponse(voiceError.message, 500));
      }
    }

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
    
    // Determine whether to save file or return as blob
    if (returnAsFile) {
      // Traditional file saving approach
      let filePath;
      try {
        filePath = await getVoiceService().saveAudioFile(audioBuffer, filename);
        console.log(`💾 Audio file saved: ${filename}`);
      } catch (saveError) {
        console.error('❌ Failed to save audio file:', saveError.message);
        return next(new ErrorResponse('Failed to save generated audio file', 500));
      }

      console.log('✅ Voice generation completed successfully');

      // Return response with file URL
      res.status(200).json({
        success: true,
        message: 'Voice generated successfully with AI optimization',
        data: {
          audioUrl: `/uploads/audio/${filename}`,
          filename: filename,
          size: audioBuffer.length,
          duration: null, // Could be calculated with audio libraries
          voiceId: voiceId,
          settings: validatedSettings,
          optimizedScript: text, // Include the optimized script in response
          originalScript: text,
          generatedAt: new Date().toISOString()
        }
      });
    } else {
      // Return audio as blob response for frontend local storage
      console.log('✅ Voice generation completed, returning as blob');
      
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Audio-Metadata': JSON.stringify({
          voiceId: voiceId,
          settings: validatedSettings,
          optimizedScript: text,
          originalScript: text,
          generatedAt: new Date().toISOString(),
          size: audioBuffer.length
        })
      });
      
      res.status(200).send(audioBuffer);
    }

  } catch (error) {
    console.error('❌ Voice generation error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Check for specific error types
    if (error.message.includes('Murf AI API authentication')) {
      return next(new ErrorResponse('Murf AI API authentication failed. Please check your API key.', 401));
    } else if (error.message.includes('Model access denied') || error.message.includes('model_access_denied')) {
      return next(new ErrorResponse('Your Murf AI account does not have access to the requested voice model. Please upgrade your plan or contact support.', 403));
    } else if (error.message.includes('rate limit')) {
      return next(new ErrorResponse('API rate limit exceeded. Please try again in a moment.', 429));
    } else if (error.message.includes('quota exceeded')) {
      return next(new ErrorResponse('Murf AI quota exceeded. Please upgrade your plan or try shorter text.', 402));
    } else if (error.message.includes('timeout')) {
      return next(new ErrorResponse('Request timeout. Please try with shorter text or try again later.', 408));
    } else {
      return next(new ErrorResponse(error.message || 'Voice generation failed', 500));
    }
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
    const clonedVoice = await getVoiceService().cloneVoice({
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
    const subscription = await getVoiceService().getSubscriptionInfo();
    
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
 * @desc    Generate voice for story content (with OpenAI voice direction optimization)
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
    if (content.length > 20000) {
      return next(new ErrorResponse('Story content is too long. Maximum 20,000 characters allowed.', 400));
    }


    // Validate and clean voice settings
    const validatedSettings = getVoiceService().validateVoiceSettings(voiceSettings || {});

    // Step 2: Generate speech with Murf AI using optimized content
    console.log('🎙️ Generating story voice with Murf AI...');
    
    const audioBuffer = await getVoiceService().generateSpeech({
      text: content,
      voiceId: voiceId,
      voiceSettings: validatedSettings
    });

    // Generate filename with story ID
    const timestamp = Date.now();
    const filename = `story_${storyId}_voice_${timestamp}.mp3`;
    
    // Save audio file
    const filePath = await getVoiceService().saveAudioFile(audioBuffer, filename);

    console.log('✅ Story voice generation completed successfully');

    // TODO: Update story record in database with audio URL

    res.status(200).json({
      success: true,
      message: 'Story voice generated successfully with AI optimization',
      data: {
        storyId: storyId,
        audioUrl: `/uploads/audio/${filename}`,
        filename: filename,
        size: audioBuffer.length,
        voiceId: voiceId,
        settings: validatedSettings,
        optimizedScript: content,
        originalScript: content,
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
    const filePath = await getVoiceService().saveAudioFile(req.file.buffer, filename);

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

/**
 * @desc    Generate speech and return as blob (for local storage)
 * @route   POST /api/v1/voice/generate-blob
 * @access  Private
 */
const generateSpeechBlob = asyncHandler(async (req, res, next) => {
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

    // Validate text length (reasonable limit for processing)
    if (text.length > 20000) {
      return next(new ErrorResponse('Text is too long. Maximum 20,000 characters allowed.', 400));
    }

    // Validate and clean voice settings
    const validatedSettings = getVoiceService().validateVoiceSettings(voiceSettings || {});

    // Step 2: Generate speech with Murf AI using optimized script
    console.log('🎙️ Generating voice with Murf AI...');
    
    let audioBuffer;
    try {
      audioBuffer = await getVoiceService().generateSpeech({
        text: text,
        voiceId: voiceId,
        voiceSettings: validatedSettings
      });

      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error('No audio data received from Murf AI');
      }

      console.log(`✅ Voice generation successful: ${audioBuffer.length} bytes`);
    } catch (voiceError) {
      console.error('❌ Voice generation failed:', voiceError.message);
      
      // Enhanced error handling for Murf AI specific errors
      if (voiceError.message.includes('api-key')) {
        return next(new ErrorResponse('Murf AI API key is missing or invalid. Please check your configuration.', 401));
      } else if (voiceError.message.includes('Missing \'api-key\'')) {
        return next(new ErrorResponse('Murf AI API authentication failed. Please check your API key configuration.', 401));
      } else if (voiceError.message.includes('Bad request')) {
        return next(new ErrorResponse('Invalid request to Murf AI. Please check your voice ID and text content.', 400));
      } else if (voiceError.message.includes('Insufficient credits')) {
        return next(new ErrorResponse('Insufficient credits in your Murf AI account. Please upgrade your plan.', 402));
      } else {
        return next(new ErrorResponse(voiceError.message, 500));
      }
    }

    // Generate filename for metadata
    const timestamp = Date.now();
    let baseFilename = 'generated';
    
    if (storyTitle) {
      baseFilename = storyTitle
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 30);
    } else if (storyId) {
      baseFilename = storyId;
    }
    
    const filename = `voice_${baseFilename}_${timestamp}.mp3`;

    console.log('✅ Voice generation completed, returning as blob');
    
    // Return audio as blob response for frontend local storage
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Audio-Metadata': JSON.stringify({
        voiceId: voiceId,
        settings: validatedSettings,
        optimizedScript: text,
        originalScript: text,
        generatedAt: new Date().toISOString(),
        size: audioBuffer.length,
        filename: filename
      })
    });
    
    res.status(200).send(audioBuffer);

  } catch (error) {
    console.error('❌ Voice generation error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Check for specific error types
    if (error.message.includes('Murf AI API authentication')) {
      return next(new ErrorResponse('Murf AI API authentication failed. Please check your API key.', 401));
    } else if (error.message.includes('Model access denied') || error.message.includes('model_access_denied')) {
      return next(new ErrorResponse('Your Murf AI account does not have access to the requested voice model. Please upgrade your plan or contact support.', 403));
    } else if (error.message.includes('rate limit')) {
      return next(new ErrorResponse('API rate limit exceeded. Please try again in a moment.', 429));
    } else if (error.message.includes('quota exceeded')) {
      return next(new ErrorResponse('Murf AI quota exceeded. Please upgrade your plan or try shorter text.', 402));
    } else if (error.message.includes('timeout')) {
      return next(new ErrorResponse('Request timeout. Please try with shorter text or try again later.', 408));
    } else {
      return next(new ErrorResponse(error.message || 'Voice generation failed', 500));
    }
  }
});

/**
 * Serve generated audio file
 */
const serveAudioFile = asyncHandler(async (req, res) => {
  const { filename } = req.params;
  
  if (!filename) {
    return res.status(400).json({
      success: false,
      message: 'Filename is required'
    });
  }

  // Validate filename to prevent path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({
      success: false,
      message: 'Invalid filename'
    });
  }

  const path = require('path');
  const fs = require('fs').promises;
  
  // Construct the full path to the audio file
  const audioFilePath = path.join(process.cwd(), 'uploads', 'audio', filename);
  
  try {
    // Check if file exists
    await fs.access(audioFilePath);
    
    // Set appropriate headers for audio file
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    
    // Send the file
    res.sendFile(audioFilePath);
  } catch (error) {
    console.error('Error serving audio file:', error);
    res.status(404).json({
      success: false,
      message: 'Audio file not found'
    });
  }
});

module.exports = {
  getVoices,
  getVoiceById,
  generateSpeech,
  generateSpeechBlob,
  cloneVoice,
  getSubscription,
  generateStoryVoice,
  uploadUserAudio,
  serveAudioFile,
  upload // Export multer middleware
};
