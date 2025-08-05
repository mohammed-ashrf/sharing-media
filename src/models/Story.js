const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  style: {
    type: String,
    enum: ['landscape', 'square', 'vertical'],
    required: true
  },
  duration: {
    type: Number, // Duration in seconds
    required: true,
    min: 30,
    max: 180 // 3 minutes
  },
  formattedDuration: String,
  topic: {
    type: String,
    required: true,
    maxlength: 500
  },
  characterDetails: {
    type: String,
    maxlength: 150
  },
  settingAtmosphere: {
    type: String,
    maxlength: 150
  },
  genre: String,
  format: String,
  narrative: String,
  ageGroup: String,
  
  // Generated content
  content: {
    type: String, // The actual story text
    required: true
  },
  headline: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  summary: String,
  detailedSummary: String, // Detailed summary for video editing
  keyScenes: [String], // Key visual scenes for video production
  tags: [String],
  searchPhrases: [String],
  
  // Audio/Voice related fields
  voiceType: {
    type: String,
    enum: ['user', 'elevenlabs'],
    default: 'elevenlabs'
  },
  audioUrl: String, // URL to generated audio or uploaded audio file
  voiceSettings: {
    styleExaggeration: Number,
    speed: Number,
    stability: Number,
    similarity: Number
  },
  selectedVoice: {
    voiceId: String,
    name: String,
    gender: String,
    accent: String,
    age: String,
    useCase: String
  },
  
  // Video/Timeline related fields
  videoTimeline: {
    totalDuration: Number,
    actualDuration: Number,
    orientation: {
      type: String,
      enum: ['landscape', 'portrait', 'square'],
      default: 'landscape'
    },
    coverage: Number, // Percentage of duration covered
    clips: [{
      id: String,
      type: {
        type: String,
        enum: ['video', 'photo']
      },
      source: {
        type: String,
        enum: ['pexels', 'pixabay']
      },
      url: String, // Local file path
      originalUrl: String, // Original source URL
      duration: Number,
      startTime: Number,
      endTime: Number,
      metadata: {
        title: String,
        tags: [String],
        photographer: String,
        source: String,
        originalId: String
      }
    }],
    photos: [{
      id: String,
      type: {
        type: String,
        enum: ['video', 'photo']
      },
      source: {
        type: String,
        enum: ['pexels', 'pixabay']
      },
      url: String,
      originalUrl: String,
      duration: Number,
      startTime: Number,
      endTime: Number,
      metadata: {
        title: String,
        tags: [String],
        photographer: String,
        source: String,
        originalId: String
      }
    }],
    metadata: {
      searchPhrases: [String],
      createdAt: Date,
      sources: [String]
    }
  },
  videoStatus: {
    type: String,
    enum: ['none', 'generating', 'generated', 'error'],
    default: 'none'
  },
  
  // Captions/Subtitles
  captions: {
    success: Boolean,
    captions: mongoose.Schema.Types.Mixed, // Can be string (SRT/VTT) or array of objects
    metadata: {
      language: String,
      format: String,
      duration: Number,
      captionCount: Number,
      wordCount: Number,
      wordsPerMinute: Number,
      generatedAt: Date,
      source: {
        type: String,
        enum: ['whisper-audio', 'story-text', 'openai-text', 'story-audio', 'story-text-ai']
      }
    }
  },
  
  // Status and metadata
  status: {
    type: String,
    enum: ['draft', 'processing', 'completed', 'error'],
    default: 'draft'
  },
  thumbnail: String,
  videoUrl: String,
  
  // AI metadata
  openaiUsage: {
    promptTokens: Number,
    completionTokens: Number,
    totalTokens: Number,
    cost: Number
  },
  
  // Processing metadata
  wordCount: Number,
  estimatedReadingTime: Number,
  aspectRatio: String,
  
  // Performance tracking
  generationTimeMs: {
    type: Number, // Time taken to generate the story in milliseconds
    default: null
  },
  generatedBy: {
    type: String,
    enum: ['openai-gpt-4', 'openai-gpt-3.5', 'template', 'manual'],
    default: 'openai-gpt-4'
  },
  
  // User interaction tracking
  viewCount: {
    type: Number,
    default: 0
  },
  lastViewedAt: Date,
  
  // Collaboration features
  isShared: {
    type: Boolean,
    default: false
  },
  sharedWith: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permission: {
      type: String,
      enum: ['view', 'edit'],
      default: 'view'
    },
    sharedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Version control
  version: {
    type: Number,
    default: 1
  },
  previousVersions: [{
    version: Number,
    content: String,
    modifiedAt: Date,
    modifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // New video-centric fields
  videoIdea: {
    type: String,
    maxlength: 500
  },
  videoStyle: {
    type: String,
    enum: ['redditStorytime', 'didYouKnow', 'motivation', 'quizGame', 'memeGoogleSearch', 'dialogueSkit', 'newsExplainer', 'lifePOV']
  },
  selectedEmotions: [String],
  additionalContext: [String],
  selectedLanguage: {
    type: String,
    default: 'English'
  }
}, {
  timestamps: true
});

// Comprehensive indexes for better query performance
storySchema.index({ userId: 1, createdAt: -1 });
storySchema.index({ userId: 1, status: 1 });
storySchema.index({ userId: 1, genre: 1 });
storySchema.index({ userId: 1, style: 1 });
storySchema.index({ userId: 1, videoStyle: 1 }); // New index for video styles
storySchema.index({ genre: 1, style: 1 });
storySchema.index({ videoStyle: 1 }); // New index for video style queries
storySchema.index({ status: 1 });
storySchema.index({ createdAt: -1 });
storySchema.index({ viewCount: -1 });
storySchema.index({ tags: 1 });
storySchema.index({ isShared: 1 });
storySchema.index({ selectedEmotions: 1 }); // New index for emotions
storySchema.index({ selectedLanguage: 1 }); // New index for language

// Text index for search functionality
storySchema.index({
  name: 'text',
  headline: 'text',
  description: 'text',
  content: 'text',
  summary: 'text'
});

// Compound indexes for analytics
storySchema.index({ userId: 1, createdAt: -1, genre: 1 });
storySchema.index({ userId: 1, duration: 1 });
storySchema.index({ createdAt: -1, generatedBy: 1 });

// Virtual fields
storySchema.virtual('isRecentlyViewed').get(function() {
  if (!this.lastViewedAt) return false;
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.lastViewedAt > dayAgo;
});

storySchema.virtual('collaboratorCount').get(function() {
  return this.sharedWith ? this.sharedWith.length : 0;
});

// Ensure virtual fields are serialized
storySchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Story', storySchema);
