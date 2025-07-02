const OpenAI = require('openai');
const Story = require('../models/Story');

// Initialize OpenAI client only if API key is available
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * @desc    Generate story using OpenAI
 * @route   POST /api/v1/stories/generate
 * @access  Private
 */
const generateStory = async (req, res) => {
  try {
    // Check if OpenAI is configured
    if (!openai) {
      return res.status(503).json({
        success: false,
        message: 'Story generation service is not configured. Please contact administrator.'
      });
    }
    const {
      // Step 1: Style and Name
      storyStyle,
      storyName,
      
      // Step 2: Length
      storyLength, // in seconds
      
      // Step 3: Optimization details
      storyTopic,
      characterDetails,
      settingAtmosphere,
      selectedGenre,
      selectedFormat,
      selectedNarrative,
      selectedAgeGroup,
      
      // Optional language selection (default: English)
      language = 'English'
    } = req.body;

    // Validate required fields
    if (!storyStyle || !storyName || !storyLength || !storyTopic) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: storyStyle, storyName, storyLength, and storyTopic are required'
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

    // Build the custom prompt
    const buildPrompt = () => {
      // Calculate maximum word count based on duration and speaking speed (150 words per minute)
      const maxWordCount = Math.floor((storyLength / 60) * 150);
      
      // Dynamic emotion mapping based on story parameters
      const getEmotions = () => {
        let emotions = [];
        
        // Base emotions for different genres
        const genreEmotions = {
          'Horror': ['Fear', 'Terror', 'Dread', 'Anxiety', 'Suspense'],
          'Thriller': ['Suspense', 'Tension', 'Anxiety', 'Fear', 'Anticipation'],
          'Drama': ['Empathy', 'Sadness', 'Hope', 'Compassion', 'Melancholy'],
          'Romance': ['Love', 'Longing', 'Joy', 'Heartbreak', 'Passion'],
          'Comedy': ['Joy', 'Amusement', 'Delight', 'Surprise', 'Warmth'],
          'Action': ['Excitement', 'Adrenaline', 'Tension', 'Anticipation', 'Triumph'],
          'Mystery': ['Curiosity', 'Intrigue', 'Suspense', 'Confusion', 'Revelation'],
          'Sci-Fi': ['Wonder', 'Awe', 'Curiosity', 'Uncertainty', 'Discovery'],
          'Fantasy': ['Wonder', 'Magic', 'Adventure', 'Enchantment', 'Heroism'],
          'Crime': ['Tension', 'Moral Conflict', 'Justice', 'Betrayal', 'Retribution'],
          'Documentary': ['Curiosity', 'Understanding', 'Empathy', 'Awareness', 'Truth'],
          'Biography': ['Inspiration', 'Admiration', 'Empathy', 'Understanding', 'Legacy']
        };
        
        // Age group modifications
        const ageGroupModifiers = {
          'Children (5-12)': ['Wonder', 'Joy', 'Curiosity', 'Friendship', 'Adventure'],
          'Teens (13-17)': ['Identity', 'Rebellion', 'Romance', 'Discovery', 'Growth'],
          'Young Adults (18-25)': ['Ambition', 'Love', 'Uncertainty', 'Freedom', 'Choice'],
          'Adults (26-40)': ['Responsibility', 'Achievement', 'Relationships', 'Purpose', 'Balance'],
          'Middle-aged (41-55)': ['Reflection', 'Legacy', 'Wisdom', 'Acceptance', 'Renewal'],
          'Seniors (55+)': ['Nostalgia', 'Wisdom', 'Peace', 'Reflection', 'Gratitude']
        };
        
        // Narrative style influences
        const narrativeEmotions = {
          'First Person': ['Intimacy', 'Personal Connection', 'Immediacy', 'Vulnerability'],
          'Third Person': ['Objectivity', 'Broader Perspective', 'Multiple Viewpoints'],
          'Narrator': ['Authority', 'Guidance', 'Storytelling', 'Wisdom']
        };
        
        // Format influences
        const formatEmotions = {
          'Short Film': ['Intensity', 'Focus', 'Impact', 'Conciseness'],
          'Feature Film': ['Epic', 'Journey', 'Development', 'Transformation'],
          'Documentary': ['Truth', 'Reality', 'Education', 'Awareness'],
          'Commercial': ['Persuasion', 'Appeal', 'Desire', 'Action'],
          'Social Media': ['Engagement', 'Viral', 'Shareability', 'Quick Impact']
        };
        
        // Start with genre-based emotions
        if (selectedGenre && genreEmotions[selectedGenre]) {
          emotions = [...genreEmotions[selectedGenre]];
        } else {
          // Default emotions if no genre or unknown genre
          emotions = ['Doubt', 'Anger', 'Fear', 'Anxiety', 'Horror'];
        }
        
        // Add age group modifiers
        if (selectedAgeGroup && ageGroupModifiers[selectedAgeGroup]) {
          emotions = emotions.concat(ageGroupModifiers[selectedAgeGroup].slice(0, 2));
        }
        
        // Add narrative style emotions
        if (selectedNarrative && narrativeEmotions[selectedNarrative]) {
          emotions = emotions.concat(narrativeEmotions[selectedNarrative].slice(0, 1));
        }
        
        // Add format emotions
        if (selectedFormat && formatEmotions[selectedFormat]) {
          emotions = emotions.concat(formatEmotions[selectedFormat].slice(0, 1));
        }
        
        // Remove duplicates and limit to 5-7 emotions
        emotions = [...new Set(emotions)].slice(0, 7);
        
        return emotions.join(', ');
      };
      
      const targetEmotions = getEmotions();
      
      let prompt = `You are a world-class screenwriter and storyteller known for creating realistic, emotionally engaging, grounded short stories that feel like they could happen in real life — no sci-fi, no hacking, no fantasy.

I want one unique story of maximum ${maxWordCount} words when voiced at 150 words per minute (${formatDuration(storyLength)} duration), that is perfect for a short film or video content — believable, cinematic, and compelling.

The story should feel like someone narrating a surreal life experience and should draw in the listener with utter shock and gasp.

The story must hook the viewer in the first 60 seconds, build tension with realistic escalation, and end with a clever or emotionally satisfying twist — not one that feels exaggerated or fake.

Use visual storytelling, body language, realistic dialogue, and subtle cues to bring the story to life. Write it as if it's being shown on screen — grounded, human, and cinematic. Avoid anything that sounds boring, cartoonish, fake or overly dramatic. Keep it relatable and smart.

This should be a perfect story that the listener can sleep to.

Here's the topic for the story: ${storyTopic}

STORY SPECIFICATIONS:
- Title: "${storyName}"
- Video Style: ${storyStyle} (${getAspectRatio(storyStyle)})
- Duration: ${formatDuration(storyLength)} (max ${maxWordCount} words)
- Language: ${language}`;

      if (characterDetails) {
        prompt += `\n- Characters: ${characterDetails}`;
      }

      if (settingAtmosphere) {
        prompt += `\n- Setting/Atmosphere: ${settingAtmosphere}`;
      }

      if (selectedGenre) {
        prompt += `\n- Genre: ${selectedGenre}`;
      }

      if (selectedNarrative) {
        prompt += `\n- Narrative Perspective: ${selectedNarrative}`;
      }

      if (selectedAgeGroup) {
        prompt += `\n- Target Age Group: ${selectedAgeGroup}`;
      }

      // Combine additional details into "other important facts"
      let otherFacts = [];
      if (selectedFormat) otherFacts.push(`Format: ${selectedFormat}`);
      if (otherFacts.length > 0) {
        prompt += `\n- Other Important Facts: ${otherFacts.join(', ')}`;
      }

      prompt += `

The goal is to create a story that's so believable and well-told that the viewer leans in and says: "No way, that actually happened?" Focus on real people, real consequences, and subtle wins.

The language used must be ${language}.

The emotions I want the story to evoke and make the viewer feel deeply are: ${targetEmotions}.

REQUIREMENTS:
1. Create a cinematic narrative script suitable for ${storyStyle} format
2. Include vivid scene descriptions and realistic dialogue
3. Ensure the content fits within ${formatDuration(storyLength)} (max ${maxWordCount} words)
4. Hook the viewer immediately and maintain tension throughout
5. End with a clever, emotionally satisfying twist
6. Make it feel completely realistic and grounded
7. Consider the ${storyStyle} aspect ratio for visual composition
8. Write entirely in ${language} language
9. Tailor the emotional tone to evoke: ${targetEmotions}

Generate a complete, emotionally compelling story that feels like a real-life experience.`;

      return prompt;
    };

    // Helper function to get aspect ratio description
    const getAspectRatio = (style) => {
      switch (style) {
        case 'landscape': return '16:9 aspect ratio';
        case 'square': return '1:1 aspect ratio';
        case 'vertical': return '9:16 aspect ratio';
        default: return 'standard aspect ratio';
      }
    };

    // Generate the story using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are a world-class screenwriter and storyteller known for creating realistic, emotionally engaging, grounded stories that feel like they could happen in real life. You specialize in cinematic narratives that hook viewers immediately, build tension through realistic escalation, and end with clever, emotionally satisfying twists. Your stories are believable, relatable, and evoke deep emotions like doubt, anger, fear, anxiety, and horror while remaining grounded in reality."
        },
        {
          role: "user",
          content: buildPrompt()
        }
      ],
      max_tokens: 4000,
      temperature: 0.7,
    });

    const generatedStory = completion.choices[0].message.content;

    // Calculate estimated word count and reading time
    const wordCount = generatedStory.split(' ').length;
    const estimatedReadingTime = Math.ceil(wordCount / 150); // Average reading speed

    // Generate headline, description, summary using AI
    const metadataPrompt = `Based on this story content, generate:

1. HEADLINE: A compelling, catchy headline (max 60 characters)
2. DESCRIPTION: A brief description for the story (max 200 characters)
3. SUMMARY: A concise summary of the story (max 100 words)
4. TAGS: 5-8 relevant tags (comma-separated)
5. SEARCH_PHRASES: 5-8 search phrases for stock footage (comma-separated)

Story Content:
${generatedStory}

Format your response exactly as:
HEADLINE: [headline here]
DESCRIPTION: [description here]
SUMMARY: [summary here]
TAGS: [tag1, tag2, tag3, etc.]
SEARCH_PHRASES: [phrase1, phrase2, phrase3, etc.]`;

    const metadataCompletion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are an expert content marketer who creates compelling headlines, descriptions, and metadata for video content."
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
        } else if (line.startsWith('TAGS:')) {
          metadata.tags = line.replace('TAGS:', '').trim().split(',').map(tag => tag.trim());
        } else if (line.startsWith('SEARCH_PHRASES:')) {
          metadata.searchPhrases = line.replace('SEARCH_PHRASES:', '').trim().split(',').map(phrase => phrase.trim());
        }
      });
      
      return metadata;
    };

    const parsedMetadata = parseMetadata(metadataText);

    // Create story in database
    const newStory = await Story.create({
      name: storyName,
      userId: req.user.id,
      style: storyStyle,
      duration: storyLength,
      formattedDuration: formatDuration(storyLength),
      topic: storyTopic,
      characterDetails,
      settingAtmosphere,
      genre: selectedGenre,
      format: selectedFormat,
      narrative: selectedNarrative,
      ageGroup: selectedAgeGroup,
      language: language,
      content: generatedStory,
      headline: parsedMetadata.headline || `${storyName} - A ${selectedGenre || 'Story'}`,
      description: parsedMetadata.description || `An engaging ${storyStyle} video story about ${storyTopic}`,
      summary: parsedMetadata.summary || 'AI-generated story summary',
      tags: parsedMetadata.tags || [],
      searchPhrases: parsedMetadata.searchPhrases || [],
      status: 'completed',
      wordCount,
      estimatedReadingTime,
      aspectRatio: getAspectRatio(storyStyle),
      openaiUsage: {
        promptTokens: completion.usage.prompt_tokens + metadataCompletion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens + metadataCompletion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens + metadataCompletion.usage.total_tokens,
        cost: ((completion.usage.total_tokens + metadataCompletion.usage.total_tokens) * 0.00003) // Approximate cost
      }
    });

    res.status(200).json({
      success: true,
      message: 'Story generated and saved successfully',
      data: {
        id: newStory._id,
        name: newStory.name,
        style: newStory.style,
        duration: newStory.duration,
        formattedDuration: newStory.formattedDuration,
        topic: newStory.topic,
        genre: newStory.genre,
        format: newStory.format,
        narrative: newStory.narrative,
        ageGroup: newStory.ageGroup,
        language: newStory.language,
        characters: newStory.characterDetails,
        setting: newStory.settingAtmosphere,
        content: newStory.content,
        headline: newStory.headline,
        description: newStory.description,
        summary: newStory.summary,
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
 * @desc    Get story generation status/health check
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
        supportedFormats: ['landscape', 'square', 'vertical'],
        maxDuration: 10800, // 3 hours in seconds
        minDuration: 30, // 30 seconds
        model: 'gpt-4-turbo-preview'
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
 * @desc    Get all stories for the authenticated user
 * @route   GET /api/v1/stories
 * @access  Private
 */
const getStories = async (req, res) => {
  try {
    const stories = await Story.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .select('-content'); // Exclude full content for list view

    res.status(200).json({
      success: true,
      message: 'Stories retrieved successfully',
      data: {
        stories,
        count: stories.length
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

module.exports = {
  generateStory,
  getGenerationStatus,
  getStories,
  getStory,
  updateStory,
  deleteStory,
  generateStorySummary,
  createStory
};
