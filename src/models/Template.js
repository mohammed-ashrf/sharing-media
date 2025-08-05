const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  category: {
    type: String,
    enum: ['Business', 'Entertainment', 'Education', 'Social Media', 'Marketing', 'Personal', 'Other'],
    required: true
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  settings: {
    // Story configuration
    storyStyle: {
      type: String,
      enum: ['landscape', 'square', 'vertical'],
      required: true
    },
    storyLength: {
      type: Number,
      required: true,
      min: 30,
      max: 10800
    },
    
    // Content settings
    storyTopicTemplate: String, // Template for story topic with placeholders
    characterDetailsTemplate: String,
    settingAtmosphereTemplate: String,
    selectedGenre: String,
    selectedFormat: String,
    selectedNarrative: String,
    selectedAgeGroup: String,
    language: {
      type: String,
      default: 'English'
    },
    
    // Voice settings
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
      accent: String
    },
    
    // Video settings
    videoStyle: String,
    transitionStyle: String,
    backgroundColor: String,
    textStyle: String
  },
  
  // Template metadata
  tags: [String],
  thumbnail: String, // URL to template preview image
  
  // Usage statistics
  useCount: {
    type: Number,
    default: 0
  },
  rating: {
    average: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },
  
  // User interactions
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Sample content
  sampleContent: {
    title: String,
    description: String,
    previewText: String
  }
}, {
  timestamps: true
});

// Indexes for better query performance
templateSchema.index({ category: 1, isPublic: 1 });
templateSchema.index({ createdBy: 1 });
templateSchema.index({ tags: 1 });
templateSchema.index({ useCount: -1 });
templateSchema.index({ 'rating.average': -1 });

// Virtual for favorite count
templateSchema.virtual('favoriteCount').get(function() {
  return this.favorites.length;
});

// Ensure virtual fields are serialized
templateSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Template', templateSchema);
