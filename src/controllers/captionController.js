const CaptionService = require('../services/captionService');
const Story = require('../models/Story');
const asyncHandler = require('../middleware/asyncHandler');

// Initialize caption service
const captionService = new CaptionService();

/**
 * @desc    Generate captions from audio file using Whisper AI
 * @route   POST /api/v1/captions/from-audio
 * @access  Private
 */
const generateCaptionsFromAudio = asyncHandler(async (req, res, next) => {
  const {
    audioFilePath,
    storyId,
    language = 'en',
    format = 'srt',
    includeTimestamps = true
  } = req.body;

  if (!audioFilePath) {
    return res.status(400).json({
      success: false,
      message: 'Audio file path is required'
    });
  }

  try {
    console.log('Generating captions from audio for user:', req.user.id);

    const options = {
      language,
      format,
      includeTimestamps
    };

    const result = await captionService.generateCaptionsFromAudio(audioFilePath, options);

    // If storyId provided, save captions to story
    if (storyId) {
      try {
        const story = await Story.findOne({ _id: storyId, userId: req.user.id });
        if (story) {
          story.captions = {
            ...result,
            source: 'whisper-audio',
            audioFilePath,
            generatedAt: new Date()
          };
          await story.save();
          console.log(`Saved captions to story ${storyId}`);
        }
      } catch (storyError) {
        console.error('Error saving captions to story:', storyError);
        // Don't fail the request if story update fails
      }
    }

    res.status(200).json({
      success: true,
      message: 'Captions generated successfully from audio',
      data: result
    });

  } catch (error) {
    console.error('Error generating captions from audio:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate captions from audio',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @desc    Generate captions from story text content
 * @route   POST /api/v1/captions/from-text
 * @access  Private
 */
const generateCaptionsFromText = asyncHandler(async (req, res, next) => {
  const {
    storyContent,
    storyId,
    wordsPerMinute = 150,
    maxWordsPerCaption = 8,
    format = 'srt',
    language = 'en',
    useAI = false
  } = req.body;

  if (!storyContent || !storyContent.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Story content is required'
    });
  }

  try {
    console.log('Generating captions from text for user:', req.user.id);

    const options = {
      wordsPerMinute,
      maxWordsPerCaption,
      format,
      language
    };

    let result;

    if (useAI) {
      // Use AI-enhanced caption generation
      result = await captionService.generateSmartCaptionsFromText(storyContent, options);
    } else {
      // Use basic text-based caption generation
      result = await captionService.generateCaptionsFromText(storyContent, options);
    }

    // If storyId provided, save captions to story
    if (storyId) {
      try {
        const story = await Story.findOne({ _id: storyId, userId: req.user.id });
        if (story) {
          story.captions = {
            ...result,
            source: useAI ? 'openai-text' : 'story-text',
            generatedAt: new Date()
          };
          await story.save();
          console.log(`Saved captions to story ${storyId}`);
        }
      } catch (storyError) {
        console.error('Error saving captions to story:', storyError);
        // Don't fail the request if story update fails
      }
    }

    res.status(200).json({
      success: true,
      message: 'Captions generated successfully from text',
      data: result
    });

  } catch (error) {
    console.error('Error generating captions from text:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate captions from text',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @desc    Generate captions for existing story
 * @route   POST /api/v1/captions/story/:storyId
 * @access  Private
 */
const generateCaptionsForStory = asyncHandler(async (req, res, next) => {
  const { storyId } = req.params;
  const {
    source = 'auto', // 'auto', 'audio', 'text'
    format = 'srt',
    useAI = true,
    ...options
  } = req.body;

  try {
    const story = await Story.findOne({ _id: storyId, userId: req.user.id });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    let result;

    if (source === 'audio' || (source === 'auto' && story.audioUrl)) {
      // Generate from audio if available
      if (!story.audioUrl) {
        return res.status(400).json({
          success: false,
          message: 'No audio file found for this story'
        });
      }

      result = await captionService.generateCaptionsFromAudio(story.audioUrl, {
        format,
        language: 'en',
        ...options
      });
      result.source = 'story-audio';

    } else if (source === 'text' || (source === 'auto' && story.content)) {
      // Generate from story content
      if (!story.content) {
        return res.status(400).json({
          success: false,
          message: 'No story content found'
        });
      }

      if (useAI) {
        result = await captionService.generateSmartCaptionsFromText(story.content, {
          format,
          maxDuration: story.duration,
          ...options
        });
      } else {
        result = await captionService.generateCaptionsFromText(story.content, {
          format,
          ...options
        });
      }
      result.source = useAI ? 'story-text-ai' : 'story-text';

    } else {
      return res.status(400).json({
        success: false,
        message: 'No audio or text content available for caption generation'
      });
    }

    // Save captions to story
    story.captions = {
      ...result,
      generatedAt: new Date()
    };
    await story.save();

    res.status(200).json({
      success: true,
      message: 'Captions generated and saved to story',
      data: {
        ...result,
        storyId: story._id
      }
    });

  } catch (error) {
    console.error('Error generating captions for story:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate captions for story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @desc    Get captions for a story
 * @route   GET /api/v1/captions/story/:storyId
 * @access  Private
 */
const getStoryCaptions = asyncHandler(async (req, res, next) => {
  const { storyId } = req.params;
  const { format } = req.query;

  try {
    const story = await Story.findOne({ _id: storyId, userId: req.user.id });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    if (!story.captions) {
      return res.status(404).json({
        success: false,
        message: 'No captions found for this story'
      });
    }

    let captions = story.captions;

    // Convert format if requested
    if (format && format !== story.captions.metadata?.format) {
      const captionData = story.captions.captions;
      if (Array.isArray(captionData)) {
        captions.captions = captionService.formatCaptions(captionData, format);
        captions.metadata.format = format;
      }
    }

    res.status(200).json({
      success: true,
      message: 'Story captions retrieved',
      data: {
        captions,
        storyId: story._id
      }
    });

  } catch (error) {
    console.error('Error retrieving story captions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve story captions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @desc    Delete captions for a story
 * @route   DELETE /api/v1/captions/story/:storyId
 * @access  Private
 */
const deleteStoryCaptions = asyncHandler(async (req, res, next) => {
  const { storyId } = req.params;

  try {
    const story = await Story.findOne({ _id: storyId, userId: req.user.id });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    story.captions = null;
    await story.save();

    res.status(200).json({
      success: true,
      message: 'Story captions deleted successfully',
      data: { storyId: story._id }
    });

  } catch (error) {
    console.error('Error deleting story captions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete story captions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @desc    Get caption service status
 * @route   GET /api/v1/captions/status
 * @access  Private
 */
const getCaptionStatus = asyncHandler(async (req, res, next) => {
  try {
    const status = captionService.getServiceStatus();

    res.status(200).json({
      success: true,
      message: 'Caption service status',
      data: status
    });

  } catch (error) {
    console.error('Error getting caption status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get caption service status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = {
  generateCaptionsFromAudio,
  generateCaptionsFromText,
  generateCaptionsForStory,
  getStoryCaptions,
  deleteStoryCaptions,
  getCaptionStatus
};
