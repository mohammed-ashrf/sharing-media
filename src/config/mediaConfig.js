const path = require('path');

// Media configuration
const mediaConfig = {
  // Upload settings
  upload: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    maxFiles: 5,
    allowedMimeTypes: {
      video: [
        'video/mp4',
        'video/avi',
        'video/mov',
        'video/wmv',
        'video/webm',
        'video/quicktime'
      ],
      audio: [
        'audio/mp3',
        'audio/mpeg',
        'audio/wav',
        'audio/aac',
        'audio/ogg',
        'audio/flac',
        'audio/x-wav',
        'audio/x-mpeg'
      ],
      image: [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml'
      ]
    }
  },

  // Storage paths
  storage: {
    uploadDir: path.join(process.cwd(), 'uploads', 'media'),
    thumbnailDir: path.join(process.cwd(), 'uploads', 'thumbnails'),
    tempDir: path.join(process.cwd(), 'uploads', 'temp')
  },

  // External API settings
  external: {
    pexels: {
      baseUrl: 'https://api.pexels.com',
      videosEndpoint: '/videos/search',
      photosEndpoint: '/v1/search',
      defaultPerPage: 15,
      maxPerPage: 50
    },
    pixabay: {
      baseUrl: 'https://pixabay.com/api',
      videosEndpoint: '/videos/',
      photosEndpoint: '/',
      defaultPerPage: 15,
      maxPerPage: 50
    }
  },

  // Processing settings
  processing: {
    thumbnailSize: {
      width: 320,
      height: 180
    },
    videoThumbnailTime: 5, // seconds into video for thumbnail
    maxProcessingTime: 300, // 5 minutes in seconds
    retryAttempts: 3
  },

  // Server settings
  server: {
    staticPath: '/uploads',
    cacheMaxAge: 86400, // 24 hours in seconds
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:4200']
  },

  // Validation rules
  validation: {
    title: {
      minLength: 1,
      maxLength: 255
    },
    description: {
      maxLength: 1000
    },
    tags: {
      maxCount: 10,
      maxLength: 50
    }
  }
};

module.exports = mediaConfig;
