const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Media title is required'],
    trim: true,
    maxlength: [255, 'Title cannot exceed 255 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  type: {
    type: String,
    required: [true, 'Media type is required'],
    enum: {
      values: ['video', 'audio', 'image'],
      message: 'Media type must be video, audio, or image'
    }
  },
  originalName: {
    type: String,
    required: [true, 'Original filename is required']
  },
  filename: {
    type: String,
    required: [true, 'Stored filename is required'],
    unique: true
  },
  mimetype: {
    type: String,
    required: [true, 'MIME type is required']
  },
  size: {
    type: Number,
    required: [true, 'File size is required'],
    min: [0, 'File size cannot be negative']
  },
  url: {
    type: String,
    required: [true, 'Media URL is required']
  },
  thumbnail: {
    type: String,
    default: null
  },
  duration: {
    type: Number, // in seconds, for video/audio
    min: [0, 'Duration cannot be negative'],
    default: null
  },
  width: {
    type: Number,
    min: [0, 'Width cannot be negative'],
    default: null
  },
  height: {
    type: Number,
    min: [0, 'Height cannot be negative'],
    default: null
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  source: {
    type: String,
    enum: {
      values: ['upload', 'pexels', 'pixabay', 'url'],
      message: 'Source must be upload, pexels, pixabay, or url'
    },
    default: 'upload'
  },
  externalId: {
    type: String, // For external API sources (Pexels/Pixabay)
    default: null
  },
  author: {
    type: String,
    trim: true,
    maxlength: [255, 'Author name cannot exceed 255 characters']
  },
  license: {
    type: String,
    trim: true,
    maxlength: [255, 'License cannot exceed 255 characters']
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    bitrate: Number,
    codec: String,
    framerate: Number,
    aspectRatio: String,
    colorSpace: String,
    channels: Number, // For audio
    sampleRate: Number, // For audio
    format: String
  },
  processingStatus: {
    type: String,
    enum: {
      values: ['pending', 'processing', 'completed', 'failed'],
      message: 'Processing status must be pending, processing, completed, or failed'
    },
    default: 'pending'
  },
  processingError: {
    type: String,
    default: null
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  storyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
mediaSchema.index({ userId: 1, createdAt: -1 });
mediaSchema.index({ type: 1, isActive: 1 });
mediaSchema.index({ source: 1, externalId: 1 });
mediaSchema.index({ tags: 1 });
mediaSchema.index({ processingStatus: 1 });

// Virtual for file path
mediaSchema.virtual('filePath').get(function() {
  return this.filename ? `uploads/media/${this.filename}` : null;
});

// Virtual for readable file size
mediaSchema.virtual('readableSize').get(function() {
  const size = this.size;
  if (!size) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let fileSize = size;
  
  while (fileSize >= 1024 && unitIndex < units.length - 1) {
    fileSize /= 1024;
    unitIndex++;
  }
  
  return `${fileSize.toFixed(2)} ${units[unitIndex]}`;
});

// Virtual for readable duration
mediaSchema.virtual('readableDuration').get(function() {
  const duration = this.duration;
  if (!duration) return null;
  
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = Math.floor(duration % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Pre-save middleware
mediaSchema.pre('save', function(next) {
  // Auto-generate tags from title
  if (this.isModified('title') && this.title) {
    const titleTags = this.title.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(tag => tag.length > 2);
    
    this.tags = [...new Set([...this.tags, ...titleTags])].slice(0, 10);
  }
  
  next();
});

// Static methods
mediaSchema.statics.findByUser = function(userId, options = {}) {
  const query = this.find({ userId, isActive: true });
  
  if (options.type) {
    query.where('type').equals(options.type);
  }
  
  if (options.source) {
    query.where('source').equals(options.source);
  }
  
  if (options.tags && options.tags.length > 0) {
    query.where('tags').in(options.tags);
  }
  
  return query.sort({ createdAt: -1 });
};

mediaSchema.statics.findProcessing = function() {
  return this.find({
    processingStatus: { $in: ['pending', 'processing'] },
    isActive: true
  }).sort({ createdAt: 1 });
};

// Instance methods
mediaSchema.methods.markAsProcessed = function(metadata = {}) {
  this.processingStatus = 'completed';
  this.processingError = null;
  if (Object.keys(metadata).length > 0) {
    this.metadata = { ...this.metadata, ...metadata };
  }
  return this.save();
};

mediaSchema.methods.markAsFailed = function(error) {
  this.processingStatus = 'failed';
  this.processingError = error;
  return this.save();
};

mediaSchema.methods.softDelete = function() {
  this.isActive = false;
  return this.save();
};

module.exports = mongoose.model('Media', mediaSchema);
