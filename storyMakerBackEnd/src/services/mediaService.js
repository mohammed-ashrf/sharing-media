const Media = require('../models/Media');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

class MediaService {
  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads', 'media');
    this.thumbnailDir = path.join(process.cwd(), 'uploads', 'thumbnails');
    this.ensureDirectories();
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      await fs.mkdir(this.thumbnailDir, { recursive: true });
    } catch (error) {
      console.error('Error creating upload directories:', error);
    }
  }

  /**
   * Generate a unique filename for uploaded files
   */
  generateUniqueFilename(originalName, mimetype) {
    const ext = path.extname(originalName);
    const hash = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    return `${timestamp}_${hash}${ext}`;
  }

  /**
   * Validate file based on type and size
   */
  validateFile(file, maxSize = 100 * 1024 * 1024) { // 100MB default
    const allowedMimes = {
      video: ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/webm'],
      audio: ['audio/mp3', 'audio/wav', 'audio/aac', 'audio/ogg', 'audio/flac'],
      image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    };

    const allAllowedMimes = Object.values(allowedMimes).flat();
    
    if (!allAllowedMimes.includes(file.mimetype)) {
      throw new Error(`Unsupported file type: ${file.mimetype}`);
    }

    if (file.size > maxSize) {
      throw new Error(`File size too large. Maximum size is ${maxSize / (1024 * 1024)}MB`);
    }

    // Determine media type
    let mediaType;
    for (const [type, mimes] of Object.entries(allowedMimes)) {
      if (mimes.includes(file.mimetype)) {
        mediaType = type;
        break;
      }
    }

    return { isValid: true, mediaType };
  }

  /**
   * Extract metadata from media file
   */
  async extractMetadata(filePath, mediaType) {
    const metadata = {
      format: path.extname(filePath).slice(1).toLowerCase()
    };

    try {
      const stats = await fs.stat(filePath);
      metadata.fileSize = stats.size;

      // For production, you would use libraries like ffprobe for video/audio
      // or sharp for images to extract detailed metadata
      if (mediaType === 'video') {
        // Mock video metadata - in production use ffprobe
        metadata.duration = 30; // seconds
        metadata.width = 1920;
        metadata.height = 1080;
        metadata.framerate = 30;
        metadata.bitrate = 5000; // kbps
        metadata.codec = 'h264';
        metadata.aspectRatio = '16:9';
      } else if (mediaType === 'audio') {
        // Mock audio metadata - in production use ffprobe
        metadata.duration = 180; // seconds
        metadata.bitrate = 128; // kbps
        metadata.sampleRate = 44100;
        metadata.channels = 2;
        metadata.codec = 'aac';
      } else if (mediaType === 'image') {
        // Mock image metadata - in production use sharp
        metadata.width = 1920;
        metadata.height = 1080;
        metadata.colorSpace = 'sRGB';
      }
    } catch (error) {
      console.error('Error extracting metadata:', error);
    }

    return metadata;
  }

  /**
   * Generate thumbnail for media file
   */
  async generateThumbnail(filePath, mediaType, filename) {
    try {
      const thumbnailFilename = `thumb_${filename.replace(path.extname(filename), '.jpg')}`;
      const thumbnailPath = path.join(this.thumbnailDir, thumbnailFilename);

      if (mediaType === 'video') {
        // In production, use ffmpeg to generate video thumbnail
        // For now, return a placeholder
        return `/uploads/thumbnails/${thumbnailFilename}`;
      } else if (mediaType === 'image') {
        // In production, use sharp to generate image thumbnail
        // For now, return the original image
        return `/uploads/media/${filename}`;
      }
      
      return null; // No thumbnail for audio
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      return null;
    }
  }

  /**
   * Save uploaded file and create media record
   */
  async saveUploadedFile(file, userId, additionalData = {}) {
    const validation = this.validateFile(file);
    
    if (!validation.isValid) {
      throw new Error('File validation failed');
    }

    const filename = this.generateUniqueFilename(file.originalname, file.mimetype);
    const filePath = path.join(this.uploadDir, filename);
    
    // Save file to disk
    await fs.writeFile(filePath, file.buffer);

    // Extract metadata
    const metadata = await this.extractMetadata(filePath, validation.mediaType);

    // Generate thumbnail
    const thumbnail = await this.generateThumbnail(filePath, validation.mediaType, filename);

    // Create media record
    const mediaData = {
      title: additionalData.title || file.originalname,
      description: additionalData.description || '',
      type: validation.mediaType,
      originalName: file.originalname,
      filename,
      mimetype: file.mimetype,
      size: file.size,
      url: `/uploads/media/${filename}`,
      thumbnail,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      metadata,
      userId,
      tags: additionalData.tags || [],
      source: 'upload',
      processingStatus: 'completed'
    };

    const media = new Media(mediaData);
    await media.save();

    return media;
  }

  /**
   * Search external media APIs (Pexels)
   */
  async searchPexels(query, type = 'videos', options = {}) {
    const apiKey = process.env.PEXELS_API_KEY;
    
    if (!apiKey) {
      throw new Error('Pexels API key not configured');
    }

    try {
      const endpoint = type === 'videos' 
        ? 'https://api.pexels.com/videos/search'
        : 'https://api.pexels.com/v1/search';

      const params = {
        query,
        per_page: options.perPage || 15,
        page: options.page || 1
      };

      if (options.category) {
        params.category = options.category;
      }

      const response = await axios.get(endpoint, {
        headers: {
          Authorization: apiKey
        },
        params
      });

      const results = type === 'videos' 
        ? response.data.videos.map(video => ({
            id: `pexels_${video.id}`,
            title: `Pexels Video ${video.id}`,
            thumbnail: video.image,
            url: video.video_files[0]?.link || '',
            duration: video.duration,
            width: video.width,
            height: video.height,
            author: video.user?.name || 'Pexels',
            provider: 'pexels',
            type: 'video',
            externalId: video.id.toString(),
            license: 'Pexels License'
          }))
        : response.data.photos.map(photo => ({
            id: `pexels_${photo.id}`,
            title: photo.alt || `Pexels Photo ${photo.id}`,
            thumbnail: photo.src.medium,
            url: photo.src.large,
            width: photo.width,
            height: photo.height,
            author: photo.photographer,
            provider: 'pexels',
            type: 'image',
            externalId: photo.id.toString(),
            license: 'Pexels License'
          }));

      return {
        results,
        total: response.data.total_results,
        page: response.data.page,
        perPage: response.data.per_page
      };
    } catch (error) {
      console.error('Pexels API error:', error);
      throw new Error('Failed to search Pexels');
    }
  }

  /**
   * Search external media APIs (Pixabay)
   */
  async searchPixabay(query, type = 'videos', options = {}) {
    const apiKey = process.env.PIXABAY_API_KEY;
    
    if (!apiKey) {
      throw new Error('Pixabay API key not configured');
    }

    try {
      const endpoint = type === 'videos'
        ? 'https://pixabay.com/api/videos/'
        : 'https://pixabay.com/api/';

      const params = {
        key: apiKey,
        q: query,
        per_page: options.perPage || 15,
        page: options.page || 1,
        safesearch: 'true'
      };

      if (options.category) {
        params.category = options.category;
      }

      const response = await axios.get(endpoint, { params });

      const results = response.data.hits.map(item => ({
        id: `pixabay_${item.id}`,
        title: item.tags || `Pixabay ${type} ${item.id}`,
        thumbnail: type === 'videos' ? item.videos?.medium?.thumbnail : item.previewURL,
        url: type === 'videos' ? item.videos?.medium?.url : item.largeImageURL,
        duration: type === 'videos' ? item.duration : null,
        width: type === 'videos' ? item.videos?.medium?.width : item.imageWidth,
        height: type === 'videos' ? item.videos?.medium?.height : item.imageHeight,
        author: item.user,
        provider: 'pixabay',
        type: type === 'videos' ? 'video' : 'image',
        externalId: item.id.toString(),
        license: 'Pixabay License'
      }));

      return {
        results,
        total: response.data.totalHits,
        page: options.page || 1,
        perPage: options.perPage || 15
      };
    } catch (error) {
      console.error('Pixabay API error:', error);
      throw new Error('Failed to search Pixabay');
    }
  }

  /**
   * Save external media to user's library
   */
  async saveExternalMedia(externalMedia, userId) {
    const mediaData = {
      title: externalMedia.title,
      type: externalMedia.type,
      originalName: externalMedia.title,
      filename: null, // External media doesn't have local file
      mimetype: externalMedia.type === 'video' ? 'video/mp4' : 'image/jpeg',
      size: 0, // Unknown for external media
      url: externalMedia.url,
      thumbnail: externalMedia.thumbnail,
      duration: externalMedia.duration,
      width: externalMedia.width,
      height: externalMedia.height,
      author: externalMedia.author,
      license: externalMedia.license,
      userId,
      source: externalMedia.provider,
      externalId: externalMedia.externalId,
      processingStatus: 'completed'
    };

    const media = new Media(mediaData);
    await media.save();

    return media;
  }

  /**
   * Get user's media library
   */
  async getMediaLibrary(userId, options = {}) {
    const query = Media.findByUser(userId, options);
    
    if (options.limit) {
      query.limit(options.limit);
    }
    
    if (options.skip) {
      query.skip(options.skip);
    }

    const media = await query.exec();
    const total = await Media.countDocuments({ userId, isActive: true });

    return { media, total };
  }

  /**
   * Delete media file
   */
  async deleteMedia(mediaId, userId) {
    const media = await Media.findOne({ _id: mediaId, userId, isActive: true });
    
    if (!media) {
      throw new Error('Media not found');
    }

    // Soft delete
    await media.softDelete();

    // If it's an uploaded file, optionally delete the physical file
    if (media.source === 'upload' && media.filename) {
      try {
        const filePath = path.join(this.uploadDir, media.filename);
        await fs.unlink(filePath);
        
        // Delete thumbnail if exists
        if (media.thumbnail && media.thumbnail.includes('thumbnails/')) {
          const thumbnailPath = path.join(this.thumbnailDir, path.basename(media.thumbnail));
          await fs.unlink(thumbnailPath).catch(() => {}); // Ignore errors
        }
      } catch (error) {
        console.error('Error deleting physical file:', error);
        // Don't throw error as the record is already soft deleted
      }
    }

    return media;
  }

  /**
   * Process pending media files (for background processing)
   */
  async processPendingMedia() {
    const pendingMedia = await Media.findProcessing();
    
    for (const media of pendingMedia) {
      try {
        media.processingStatus = 'processing';
        await media.save();

        // Perform any additional processing here
        // e.g., generate thumbnails, extract metadata, virus scanning, etc.

        await media.markAsProcessed();
        console.log(`Processed media: ${media._id}`);
      } catch (error) {
        await media.markAsFailed(error.message);
        console.error(`Failed to process media ${media._id}:`, error);
      }
    }
  }
}

module.exports = new MediaService();
