const OpenAI = require('openai');
const mongoose = require('mongoose');
const Story = require('../models/Story');
const { fillTemplate, isValidStyle, getAvailableStyles } = require('../templates/videoStyleTemplates');

// Initialize OpenAI client only if API key is available
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * @desc    Generate story using OpenAI with video style templates
 * @route   POST /api/v1/stories/generate
 * @access  Private
 */
const generateStory = async (req, res) => {
  const startTime = Date.now(); // Track generation time
  
  try {
    // Check if OpenAI is configured
    if (!openai) {
      return res.status(503).json({
        success: false,
        message: 'Story generation service is not configured. Please contact administrator.'
      });
    }

    const {
      // New video-centric fields
      videoIdea,
      videoStyle, // or storyStyle for backward compatibility
      storyName,
      selectedLanguage = 'English',
      additionalContext = [],
      selectedEmotions = [],
      
      // Legacy fields for backward compatibility
      storyStyle,
      language = 'English',
      
      // Length
      storyLength, // in seconds
      
      // Optional legacy fields
      storyTopic,
      characterDetails,
      settingAtmosphere,
      selectedGenre,
      selectedFormat,
      selectedNarrative,
      selectedAgeGroup
    } = req.body;

    // Determine which style to use (prioritize videoStyle over storyStyle)
    const finalStyle = videoStyle || storyStyle;
    const finalLanguage = selectedLanguage || language;
    const finalVideoIdea = videoIdea || storyTopic;

    // Validate required fields
    if (!finalStyle || !storyName || !storyLength || !finalVideoIdea) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: videoStyle (or storyStyle), storyName, storyLength, and videoIdea (or storyTopic) are required'
      });
    }

    // Validate video style
    if (!isValidStyle(finalStyle)) {
      const availableStyles = getAvailableStyles();
      return res.status(400).json({
        success: false,
        message: `Invalid video style. Available styles: ${availableStyles.map(s => s.id).join(', ')}`
      });
    }

    // Convert seconds to human readable format
    const formatDuration = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else if (minutes > 0) {
        return `${minutes}m ${secs > 0 ? ` ${secs}s` : ''}`;
      } else {
        return `${secs}s`;
      }
    };

    // Calculate maximum word count based on duration and speaking speed (150 words per minute)
    const maxWordCount = Math.floor((storyLength / 60) * 150);
    const formattedDuration = formatDuration(storyLength);

    // Format emotions array into a readable string
    const formatEmotions = (emotions) => {
      if (!emotions || emotions.length === 0) {
        // Default emotions based on style
        const defaultEmotions = {
          redditStorytime: ['Suspense', 'Intrigue', 'Satisfaction', 'Surprise'],
          didYouKnow: ['Curiosity', 'Wonder', 'Amazement', 'Interest'],
          motivation: ['Inspiration', 'Hope', 'Empowerment', 'Determination'],
          quizGame: ['Excitement', 'Challenge', 'Fun', 'Engagement'],
          memeGoogleSearch: ['Humor', 'Relatability', 'Amusement', 'Recognition'],
          dialogueSkit: ['Comedy', 'Relatability', 'Entertainment', 'Connection'],
          newsExplainer: ['Understanding', 'Clarity', 'Awareness', 'Interest'],
          lifePOV: ['Immersion', 'Emotion', 'Connection', 'Experience']
        };
        return (defaultEmotions[finalStyle] || ['Engagement', 'Interest', 'Connection']).join(', ');
      }
      return emotions.slice(0, 4).join(', '); // Limit to 4 emotions as per frontend
    };

    // Format additional context into a readable string
    const formatAdditionalContext = (context) => {
      if (!context || context.length === 0) {
        return 'No additional context provided.';
      }
      return context.map((item, index) => `${index + 1}. ${item}`).join('\n');
    };

    // Prepare template data
    const templateData = {
      videoIdea: finalVideoIdea,
      storyName,
      maxWordCount,
      formattedDuration,
      language: finalLanguage,
      emotions: formatEmotions(selectedEmotions),
      additionalContext: formatAdditionalContext(additionalContext),
      
      // Legacy fields for backward compatibility
      storyTopic: finalVideoIdea,
      characterDetails: characterDetails || '',
      settingAtmosphere: settingAtmosphere || '',
      selectedGenre: selectedGenre || '',
      selectedFormat: selectedFormat || '',
      selectedNarrative: selectedNarrative || '',
      selectedAgeGroup: selectedAgeGroup || ''
    };

    // Fill the template with user data
    const filledPrompt = fillTemplate(finalStyle, templateData);

    // Generate the story using OpenAI with gpt-4.1-nano (or fallback to available model)
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano", // Using gpt-4o-mini as gpt-4.1-nano may not be available yet
      messages: [
        {
          role: "system",
          content: "You are a world-class content creator and storyteller who specializes in creating engaging video content across different styles and formats. You adapt your writing style perfectly to match the requested video format while maintaining high quality and audience engagement."
        },
        {
          role: "user",
          content: filledPrompt
        }
      ],
      max_tokens: 12000,
      temperature: 0.7,
    });

    const generatedStory = completion.choices[0].message.content;

    // Calculate estimated word count and reading time
    const wordCount = generatedStory.split(' ').length;
    const estimatedReadingTime = Math.ceil(wordCount / 150); // Average reading speed

    // Generate headline, description, summary using AI
    const metadataPrompt = `Based on this video story content and style "${finalStyle}", generate:

1. HEADLINE: A compelling, catchy headline optimized for video content (max 60 characters)
2. DESCRIPTION: A brief description perfect for video platforms (max 200 characters)
3. SUMMARY: A concise summary of the story (max 100 words)
4. DETAILED_SUMMARY: A detailed summary for video editing including key scenes, emotions, and visual elements (max 300 words)
5. TAGS: 5-8 relevant tags optimized for video discovery (comma-separated)
6. SEARCH_PHRASES: 8-12 search phrases for stock footage that match the story's scenes and mood (comma-separated)
7. KEY_SCENES: 3-5 key visual scenes that should be highlighted in the video (comma-separated)

Video Style: ${finalStyle}
Story Content:
${generatedStory}

Format your response exactly as:
HEADLINE: [headline here]
DESCRIPTION: [description here]
SUMMARY: [summary here]
DETAILED_SUMMARY: [detailed summary here]
TAGS: [tag1, tag2, tag3, etc.]
SEARCH_PHRASES: [phrase1, phrase2, phrase3, etc.]
KEY_SCENES: [scene1, scene2, scene3, etc.]`;

    const metadataCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert content marketer who creates compelling headlines, descriptions, and metadata for video content across different platforms and styles."
        },
        {
          role: "user",
          content: metadataPrompt
        }
      ],
      max_tokens: 800,
      temperature: 0.5,
    });

    const metadataText = metadataCompletion.choices[0].message.content;
    
    // Parse the metadata response
    const parseMetadata = (text) => {
      const lines = text.split('\n');
      const metadata = {};
      
      lines.forEach(line => {
        if (line.startsWith('HEADLINE:')) {
          metadata.headline = line.replace('HEADLINE:', '').trim();
        } else if (line.startsWith('DESCRIPTION:')) {
          metadata.description = line.replace('DESCRIPTION:', '').trim();
        } else if (line.startsWith('SUMMARY:')) {
          metadata.summary = line.replace('SUMMARY:', '').trim();
        } else if (line.startsWith('DETAILED_SUMMARY:')) {
          metadata.detailedSummary = line.replace('DETAILED_SUMMARY:', '').trim();
        } else if (line.startsWith('TAGS:')) {
          metadata.tags = line.replace('TAGS:', '').trim().split(',').map(tag => tag.trim());
        } else if (line.startsWith('SEARCH_PHRASES:')) {
          metadata.searchPhrases = line.replace('SEARCH_PHRASES:', '').trim().split(',').map(phrase => phrase.trim());
        } else if (line.startsWith('KEY_SCENES:')) {
          metadata.keyScenes = line.replace('KEY_SCENES:', '').trim().split(',').map(scene => scene.trim());
        }
      });
      
      return metadata;
    };

    const parsedMetadata = parseMetadata(metadataText);

    // Create story in database
    const generationTime = Date.now() - startTime;
    
    // Determine aspect ratio based on video style
    const getAspectRatioFromVideoStyle = (videoStyle) => {
      const aspectRatios = {
        redditStorytime: 'vertical', // 9:16 for short-form storytelling
        didYouKnow: 'vertical', // 9:16 for facts and discoveries
        motivation: 'vertical', // 9:16 for inspirational content
        quizGame: 'vertical', // 9:16 for interactive content
        memeGoogleSearch: 'vertical', // 9:16 for meme content
        dialogueSkit: 'landscape', // 16:9 for dialogue scenes
        newsExplainer: 'landscape', // 16:9 for news content
        lifePOV: 'square' // 1:1 for immersive POV content
      };
      return aspectRatios[videoStyle] || 'vertical'; // Default to vertical for shorts
    };
    
    // Helper function to get aspect ratio description for metadata
    const getAspectRatioDescription = (videoStyle) => {
      const aspectRatios = {
        redditStorytime: '9:16', // Vertical for mobile storytelling
        didYouKnow: '9:16', // Vertical for social media facts
        motivation: '9:16', // Vertical for cinematic motivation
        quizGame: '9:16', // Vertical for interactive content
        memeGoogleSearch: '9:16', // Vertical for meme content
        dialogueSkit: '16:9', // Landscape for dialogue scenes
        newsExplainer: '16:9', // Landscape for news content
        lifePOV: '1:1' // Square for immersive POV content
      };
      return aspectRatios[videoStyle] || '9:16'; // Default to vertical for shorts
    };

    // Debug logging
    console.log('🔍 Request Debug - Video Style Processing:');
    console.log('  📝 Raw videoStyle from request:', videoStyle);
    console.log('  📝 Raw storyStyle from request:', storyStyle);
    console.log('  🎯 Final style used:', finalStyle);
    console.log('  🎬 Aspect ratio will be:', getAspectRatioFromVideoStyle(finalStyle));
    
    const newStory = await Story.create({
      name: storyName,
      userId: req.user.id,
      style: getAspectRatioFromVideoStyle(finalStyle), // Aspect ratio based on video style
      duration: storyLength,
      formattedDuration: formattedDuration,
      topic: finalVideoIdea,
      characterDetails,
      settingAtmosphere,
      genre: selectedGenre,
      format: selectedFormat,
      narrative: selectedNarrative,
      ageGroup: selectedAgeGroup,
      language: finalLanguage,
      content: generatedStory,
      headline: parsedMetadata.headline || `${storyName} - A ${finalStyle} video`,
      description: parsedMetadata.description || `An engaging ${finalStyle} video story about ${finalVideoIdea}`,
      summary: parsedMetadata.summary || 'AI-generated story summary',
      detailedSummary: parsedMetadata.detailedSummary || parsedMetadata.summary || 'AI-generated detailed summary',
      keyScenes: parsedMetadata.keyScenes || [],
      tags: parsedMetadata.tags || [],
      searchPhrases: parsedMetadata.searchPhrases || [],
      status: 'completed',
      wordCount,
      estimatedReadingTime,
      aspectRatio: getAspectRatioDescription(finalStyle),
      generationTimeMs: generationTime,
      generatedBy: 'openai-gpt-4',
      openaiUsage: {
        promptTokens: completion.usage.prompt_tokens + metadataCompletion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens + metadataCompletion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens + metadataCompletion.usage.total_tokens,
        cost: ((completion.usage.total_tokens + metadataCompletion.usage.total_tokens) * 0.00003) // Approximate cost
      },
      
      // Store new fields for future reference
      videoIdea: finalVideoIdea,
      videoStyle: finalStyle,
      selectedEmotions: selectedEmotions,
      additionalContext: additionalContext
    });

    res.status(200).json({
      success: true,
      message: 'Story generated and saved successfully',
      data: {
        id: newStory._id,
        name: newStory.name,
        style: newStory.style,
        videoStyle: finalStyle,
        duration: newStory.duration,
        formattedDuration: newStory.formattedDuration,
        topic: newStory.topic,
        videoIdea: finalVideoIdea,
        genre: newStory.genre,
        format: newStory.format,
        narrative: newStory.narrative,
        ageGroup: newStory.ageGroup,
        language: newStory.language,
        selectedEmotions: selectedEmotions,
        additionalContext: additionalContext,
        characters: newStory.characterDetails,
        setting: newStory.settingAtmosphere,
        content: newStory.content,
        headline: newStory.headline,
        description: newStory.description,
        summary: newStory.summary,
        detailedSummary: newStory.detailedSummary,
        keyScenes: newStory.keyScenes,
        tags: newStory.tags,
        searchPhrases: newStory.searchPhrases,
        metadata: {
          wordCount: newStory.wordCount,
          estimatedReadingTime: newStory.estimatedReadingTime,
          aspectRatio: newStory.aspectRatio,
          createdAt: newStory.createdAt,
          generatedBy: newStory.generatedBy
        },
        status: newStory.status
      },
      usage: {
        promptTokens: completion.usage.prompt_tokens + metadataCompletion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens + metadataCompletion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens + metadataCompletion.usage.total_tokens
      }
    });

  } catch (error) {
    console.error('Error generating story:', error);

    // Handle specific OpenAI errors
    if (error.code === 'insufficient_quota') {
      return res.status(402).json({
        success: false,
        message: 'OpenAI API quota exceeded. Please check your billing details.'
      });
    }

    if (error.code === 'invalid_api_key') {
      return res.status(401).json({
        success: false,
        message: 'Invalid OpenAI API key configuration'
      });
    }

    if (error.code === 'rate_limit_exceeded') {
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded. Please try again later.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error generating story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Get story generation status/health check with available video styles
 * @route   GET /api/v1/stories/status
 * @access  Private
 */
const getGenerationStatus = async (req, res) => {
  try {
    // Check if OpenAI API key is configured
    const hasApiKey = !!process.env.OPENAI_API_KEY;
    
    res.status(200).json({
      success: true,
      message: 'Story generation service status',
      data: {
        serviceAvailable: hasApiKey,
        openaiConfigured: hasApiKey,
        supportedVideoStyles: getAvailableStyles(),
        supportedFormats: ['landscape', 'square', 'vertical'], // Legacy format support
        maxDuration: 10800, // 3 hours in seconds
        minDuration: 30, // 30 seconds
        model: 'gpt-4o-mini',
        features: {
          videoStyleTemplates: true,
          multiLanguageSupport: true,
          emotionTargeting: true,
          contextualPrompts: true,
          advancedMetadata: true
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking service status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Get all stories for the authenticated user with filtering and pagination
 * @route   GET /api/v1/stories
 * @access  Private
 */
const getStories = async (req, res) => {
  try {
    const {
      genre,       // Filter by genre
      style,       // Filter by style
      status,      // Filter by status
      sortBy = 'createdAt',  // Sort field
      sortOrder = 'desc',    // Sort order
      page = 1,    // Page number
      limit = 20,  // Items per page
      includeContent = false // Whether to include full content
    } = req.query;

    const userId = req.user.id;

    // Build query
    let query = { userId };
    if (genre) query.genre = genre;
    if (style) query.style = style;
    if (status) query.status = status;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Select fields (exclude content by default for performance)
    const selectFields = includeContent === 'true' ? '' : '-content';

    // Execute query with pagination
    const [stories, totalCount] = await Promise.all([
      Story.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .select(selectFields),
      Story.countDocuments(query)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Get summary statistics
    const stats = await Story.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalStories: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          avgWordCount: { $avg: '$wordCount' },
          genreBreakdown: { $push: '$genre' }
        }
      }
    ]);

    const formatDuration = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return { hours, minutes, total: seconds };
    };

    res.status(200).json({
      success: true,
      message: 'Stories retrieved successfully',
      data: {
        stories,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit: limitNum
        },
        summary: stats.length > 0 ? {
          totalStories: stats[0].totalStories,
          totalDuration: formatDuration(stats[0].totalDuration),
          averageWordCount: Math.round(stats[0].avgWordCount),
          genres: [...new Set(stats[0].genreBreakdown.filter(Boolean))]
        } : {
          totalStories: 0,
          totalDuration: { hours: 0, minutes: 0, total: 0 },
          averageWordCount: 0,
          genres: []
        },
        filters: {
          genre,
          style,
          status,
          sortBy,
          sortOrder
        }
      }
    });
  } catch (error) {
    console.error('Error fetching stories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stories',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Get a single story by ID
 * @route   GET /api/v1/stories/:id
 * @access  Private
 */
const getStory = async (req, res) => {
  try {
    const story = await Story.findOne({ 
      _id: req.params.id, 
      userId: req.user.id 
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Story retrieved successfully',
      data: story
    });
  } catch (error) {
    console.error('Error fetching story:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Update story (rename or edit metadata)
 * @route   PUT /api/v1/stories/:id
 * @access  Private
 */
const updateStory = async (req, res) => {
  try {
    const { name, headline, description, summary, tags, searchPhrases } = req.body;

    const story = await Story.findOne({ 
      _id: req.params.id, 
      userId: req.user.id 
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    // Update allowed fields
    if (name) story.name = name;
    if (headline) story.headline = headline;
    if (description) story.description = description;
    if (summary) story.summary = summary;
    if (tags) story.tags = tags;
    if (searchPhrases) story.searchPhrases = searchPhrases;

    await story.save();

    res.status(200).json({
      success: true,
      message: 'Story updated successfully',
      data: story
    });
  } catch (error) {
    console.error('Error updating story:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Delete story
 * @route   DELETE /api/v1/stories/:id
 * @access  Private
 */
const deleteStory = async (req, res) => {
  try {
    const story = await Story.findOne({ 
      _id: req.params.id, 
      userId: req.user.id 
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    await Story.deleteOne({ _id: req.params.id });

    res.status(200).json({
      success: true,
      message: 'Story deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting story:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Generate AI summary for existing story
 * @route   POST /api/v1/stories/:id/summary
 * @access  Private
 */
const generateStorySummary = async (req, res) => {
  try {
    if (!openai) {
      return res.status(503).json({
        success: false,
        message: 'AI service is not configured'
      });
    }

    const story = await Story.findOne({ 
      _id: req.params.id, 
      userId: req.user.id 
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    const summaryPrompt = `Generate a compelling, concise summary of this story in 50-100 words:

${story.content}

Make it engaging and highlight the key plot points, characters, and themes.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are an expert at creating compelling story summaries that capture the essence and excitement of narratives."
        },
        {
          role: "user",
          content: summaryPrompt
        }
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    const aiSummary = completion.choices[0].message.content.trim();
    
    // Update the story with the new summary
    story.summary = aiSummary;
    await story.save();

    res.status(200).json({
      success: true,
      message: 'AI summary generated successfully',
      data: {
        summary: aiSummary
      }
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating summary',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Create a new story with audio
 * @route   POST /api/v1/stories
 * @access  Private
 */
const createStory = async (req, res) => {
  try {
    const {
      name,
      style,
      length,
      content,
      headline,
      summary,
      description,
      tags,
      searchPhrases,
      voiceType,
      audioUrl,
      voiceSettings,
      selectedVoice,
      topic,
      characterDetails,
      settingAtmosphere,
      genre,
      format,
      narrative,
      ageGroup
    } = req.body;

    // Validate required fields
    if (!name || !style || !length || !content || !headline || !description) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, style, length, content, headline, and description are required'
      });
    }

    // Validate style
    if (!['landscape', 'square', 'vertical'].includes(style)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid style. Must be landscape, square, or vertical'
      });
    }

    // Validate length
    if (length < 30 || length > 10800) {
      return res.status(400).json({
        success: false,
        message: 'Story length must be between 30 seconds and 3 hours'
      });
    }

    // Calculate additional metadata
    const wordCount = content.split(/\s+/).length;
    const estimatedReadingTime = Math.ceil(wordCount / 200); // Average reading speed
    const aspectRatio = style === 'landscape' ? '16:9' : style === 'square' ? '1:1' : '9:16';

    // Format duration
    const formatDuration = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else if (minutes > 0) {
        return `${minutes}m${secs > 0 ? ` ${secs}s` : ''}`;
      } else {
        return `${secs}s`;
      }
    };

    // Create new story
    const newStory = new Story({
      name: name.trim(),
      userId: req.user.id,
      style,
      duration: length,
      formattedDuration: formatDuration(length),
      topic: topic || '',
      characterDetails,
      settingAtmosphere,
      genre,
      format,
      narrative,
      ageGroup,
      content,
      headline: headline.trim(),
      description: description.trim(),
      summary,
      tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [],
      searchPhrases: Array.isArray(searchPhrases) ? searchPhrases.filter(phrase => phrase.trim()) : [],
      status: 'completed',
      wordCount,
      estimatedReadingTime,
      aspectRatio,
      generatedBy: 'openai-gpt-4',
      // Audio-related fields
      voiceType,
      audioUrl,
      voiceSettings: voiceType === 'elevenlabs' ? voiceSettings : null,
      selectedVoice: voiceType === 'elevenlabs' ? selectedVoice : null
    });

    const savedStory = await newStory.save();

    res.status(201).json({
      success: true,
      message: 'Story created successfully',
      data: savedStory
    });

  } catch (error) {
    console.error('Error creating story:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating story',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Enhanced search stories with filters and pagination
 * @route   GET /api/v1/stories/search
 * @access  Private
 */
const searchStories = async (req, res) => {
  try {
    const {
      q,           // Search query
      genre,       // Filter by genre
      style,       // Filter by style
      ageGroup,    // Filter by age group
      format,      // Filter by format
      minDuration, // Minimum duration in seconds
      maxDuration, // Maximum duration in seconds
      sortBy = 'createdAt',  // Sort field
      sortOrder = 'desc',    // Sort order
      page = 1,    // Page number
      limit = 20   // Items per page
    } = req.query;

    const userId = req.user.id;

    // Build search query
    let query = { userId };

    // Text search across multiple fields
    if (q) {
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
        { headline: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { summary: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } },
        { searchPhrases: { $in: [new RegExp(q, 'i')] } }
      ];
    }

    // Filters
    if (genre) query.genre = genre;
    if (style) query.style = style;
    if (ageGroup) query.ageGroup = ageGroup;
    if (format) query.format = format;

    // Duration filters
    if (minDuration || maxDuration) {
      query.duration = {};
      if (minDuration) query.duration.$gte = parseInt(minDuration);
      if (maxDuration) query.duration.$lte = parseInt(maxDuration);
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const [stories, totalCount] = await Promise.all([
      Story.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .select('-content'), // Exclude full content for performance
      Story.countDocuments(query)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      message: 'Stories search completed',
      data: {
        stories,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit: limitNum
        },
        filters: {
          query: q,
          genre,
          style,
          ageGroup,
          format,
          minDuration,
          maxDuration,
          sortBy,
          sortOrder
        }
      }
    });

  } catch (error) {
    console.error('Error searching stories:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching stories',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Export story in different formats
 * @route   GET /api/v1/stories/export/:id?format=json|txt|srt
 * @access  Private
 */
const exportStory = async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    const storyId = req.params.id;
    const userId = req.user.id;

    const story = await Story.findOne({ 
      _id: storyId, 
      userId 
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    let exportData;
    let contentType;
    let fileName;

    switch (format.toLowerCase()) {
      case 'txt':
        exportData = `${story.name}\n\n${story.content}`;
        contentType = 'text/plain';
        fileName = `${story.name.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
        break;

      case 'srt':
        // Generate simple SRT format
        const words = story.content.split(' ');
        const wordsPerSecond = 2.5; // Average reading speed
        let srtContent = '';
        let currentTime = 0;

        for (let i = 0; i < words.length; i += 10) {
          const chunk = words.slice(i, i + 10).join(' ');
          const startTime = Math.floor(currentTime);
          const endTime = Math.floor(currentTime + (10 / wordsPerSecond));
          
          const formatTime = (seconds) => {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},000`;
          };

          srtContent += `${Math.floor(i / 10) + 1}\n`;
          srtContent += `${formatTime(startTime)} --> ${formatTime(endTime)}\n`;
          srtContent += `${chunk}\n\n`;
          
          currentTime = endTime;
        }

        exportData = srtContent;
        contentType = 'text/plain';
        fileName = `${story.name.replace(/[^a-zA-Z0-9]/g, '_')}.srt`;
        break;

      case 'json':
      default:
        exportData = JSON.stringify({
          id: story._id,
          name: story.name,
          style: story.style,
          duration: story.duration,
          content: story.content,
          headline: story.headline,
          description: story.description,
          summary: story.summary,
          genre: story.genre,
          tags: story.tags,
          createdAt: story.createdAt,
          metadata: {
            wordCount: story.wordCount,
            estimatedReadingTime: story.estimatedReadingTime,
            aspectRatio: story.aspectRatio
          }
        }, null, 2);
        contentType = 'application/json';
        fileName = `${story.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(exportData);

  } catch (error) {
    console.error('Error exporting story:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Duplicate an existing story
 * @route   POST /api/v1/stories/duplicate/:id
 * @access  Private
 */
const duplicateStory = async (req, res) => {
  try {
    const storyId = req.params.id;
    const userId = req.user.id;
    const { newName } = req.body;

    const originalStory = await Story.findOne({ 
      _id: storyId, 
      userId 
    });

    if (!originalStory) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    // Create duplicate with new name
    const duplicateData = {
      ...originalStory.toObject(),
      _id: undefined,
      __v: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      name: newName || `${originalStory.name} (Copy)`,
      audioUrl: undefined, // Reset audio for duplicate
      videoTimeline: undefined // Reset video timeline for duplicate
    };

    const duplicatedStory = await Story.create(duplicateData);

    res.status(201).json({
      success: true,
      message: 'Story duplicated successfully',
      data: duplicatedStory
    });

  } catch (error) {
    console.error('Error duplicating story:', error);
    res.status(500).json({
      success: false,
      message: 'Error duplicating story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Get available video styles with descriptions
 * @route   GET /api/v1/stories/video-styles
 * @access  Private
 */
const getVideoStyles = async (req, res) => {
  try {
    const styles = getAvailableStyles();
    
    res.status(200).json({
      success: true,
      message: 'Available video styles retrieved successfully',
      data: {
        videoStyles: styles,
        totalCount: styles.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving video styles',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Generate video ideas for shorts using OpenAI
 * @route   POST /api/v1/stories/generate-ideas
 * @access  Private
 */
const generateIdeas = async (req, res) => {
  try {
    // Check if OpenAI is configured
    if (!openai) {
      return res.status(503).json({
        success: false,
        message: 'Ideas generation service is not configured. Please contact administrator.'
      });
    }

    const { niche, videoStyle } = req.body;

    // Validate required fields
    if (!niche || !videoStyle) {
      return res.status(400).json({
        success: false,
        message: 'Both niche and video style are required'
      });
    }

    // Map video style codes to readable names
    const videoStyleNames = {
      'redditStorytime': 'Reddit-style story time',
      'didYouKnow': 'Did you know?',
      'motivation': 'Motivation',
      'quizGame': 'Quiz & guessing games',
      'memeGoogleSearch': 'Meme google search shorts',
      'dialogueSkit': '2-person Dialogue skit',
      'newsExplainer': 'News explainers & event breakdowns',
      'lifePOV': 'Life POV'
    };

    const styleDisplayName = videoStyleNames[videoStyle] || videoStyle;

    // Create the prompt for OpenAI
    const prompt = `I am about to create YouTube shorts video and instagram reels that will go viral but I need your to suggest a list of 50 video topic ideas for me based on my niche and video style.

My niche is: ${niche}
My video style is: ${styleDisplayName}

The video idea must be an idea that can be fully created with AI, be short-form friendly, and hook the viewer instantly.
Just show the list of responses, don't say or do anything else, do not add instructions`;

    console.log('🎯 Generating ideas with prompt:', prompt);

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.8,
    });

    const generatedContent = response.choices[0]?.message?.content;

    if (!generatedContent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate ideas. Please try again.'
      });
    }

    // Parse the response into individual ideas
    const ideas = parseIdeasFromResponse(generatedContent);

    console.log(`✅ Generated ${ideas.length} ideas for niche: ${niche}, style: ${styleDisplayName}`);

    res.status(200).json({
      success: true,
      message: 'Video ideas generated successfully',
      data: {
        ideas,
        niche,
        videoStyle,
        styleDisplayName,
        totalCount: ideas.length
      }
    });

  } catch (error) {
    console.error('❌ Error generating video ideas:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating video ideas',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Helper function to parse ideas from OpenAI response
 */
function parseIdeasFromResponse(content) {
  // Split the content into lines and clean them up
  const lines = content.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !line.match(/^(Here are|Here's|Below are|Video Ideas|Ideas:|Topic Ideas|Video Topics)/i))
    .map(line => {
      // Remove numbering (1., 2., 1), 2), etc.)
      return line.replace(/^\d+[\.\)\:\-\s]+/, '').trim();
    })
    .filter(line => line.length > 10) // Filter out very short lines
    .slice(0, 50); // Limit to 50 ideas max

  return lines;
}

module.exports = {
  generateStory,
  getGenerationStatus,
  getStories,
  getStory,
  updateStory,
  deleteStory,
  generateStorySummary,
  createStory,
  searchStories,
  exportStory,
  duplicateStory,
  getVideoStyles,
  generateIdeas
};
