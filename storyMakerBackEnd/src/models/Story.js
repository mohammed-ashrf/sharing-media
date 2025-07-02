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
    max: 10800 // 3 hours
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
  generatedBy: {
    type: String,
    default: 'openai-gpt-4'
  }
}, {
  timestamps: true
});

// Index for better query performance
storySchema.index({ userId: 1, createdAt: -1 });
storySchema.index({ status: 1 });

module.exports = mongoose.model('Story', storySchema);
