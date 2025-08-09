const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class VideoService {
  constructor() {
    this.pexelsApiKey = process.env.PEXELS_API_KEY;
    this.pixabayApiKey = process.env.PIXABAY_API_KEY;
    this.uploadDir = path.join(process.cwd(), 'uploads', 'media');
    
    // Ensure upload directory exists
    this.ensureUploadDir();
  }

  async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      console.log('Media upload directory ensured:', this.uploadDir);
    } catch (error) {
      console.error('Error creating upload directory:', error);
    }
  }

  /**
   * Search for stock videos and photos from multiple platforms - Returns URLs only
   * @param {Array} searchPhrases - Array of search phrases
   * @param {number} duration - Total duration needed in seconds
   * @param {string} orientation - 'landscape', 'portrait', or 'square'
   * @returns {Promise<Object>} Timeline with media URLs
   */
  async createVideoTimelineUrls(searchPhrases, duration, orientation = 'landscape') {
    try {
      console.log(`Creating video timeline URLs for ${duration}s with orientation: ${orientation}`);
      console.log('Search phrases:', searchPhrases);

      const timeline = {
        totalDuration: duration,
        orientation,
        clips: [],
        photos: [],
        metadata: {
          searchPhrases,
          createdAt: new Date().toISOString(),
          sources: []
        }
      };

      // Calculate how many clips we need (aim for 3-8 second clips)
      const avgClipDuration = Math.min(8, Math.max(3, duration / 10));
      const targetClipCount = Math.ceil(duration / avgClipDuration);
      
      console.log(`Target: ${targetClipCount} clips, avg duration: ${avgClipDuration}s`);

      // Search for media from both platforms
      const allMedia = [];
      
      // Search Pexels
      if (this.pexelsApiKey) {
        const pexelsMedia = await this.searchPexels(searchPhrases, targetClipCount, orientation);
        allMedia.push(...pexelsMedia);
        timeline.metadata.sources.push('pexels');
      }

      // Search Pixabay
      if (this.pixabayApiKey) {
        const pixabayMedia = await this.searchPixabay(searchPhrases, targetClipCount, orientation);
        allMedia.push(...pixabayMedia);
        timeline.metadata.sources.push('pixabay');
      }

      if (allMedia.length === 0) {
        // In development mode, provide helpful debugging info
        if (process.env.NODE_ENV === 'development') {
          console.log('🔧 Development Mode: No media found from APIs');
          console.log('📋 API Status:');
          console.log('  - Pexels API Key:', this.pexelsApiKey ? '✅ Present' : '❌ Missing');
          console.log('  - Pixabay API Key:', this.pixabayApiKey ? '✅ Present' : '❌ Missing');
          
          // Return mock data for development
          console.log('🎬 Generating mock video timeline URLs for development...');
          return this.generateMockTimelineUrls(searchPhrases, duration, orientation);
        }
        
        throw new Error('No media found from any source. Please check API keys and search phrases.');
      }

      // Shuffle and select best media mix
      const selectedMedia = this.selectBestMediaMix(allMedia, targetClipCount);
      
      // Create timeline with URLs only (no downloading)
      let currentDuration = 0;
      for (const media of selectedMedia) {
        if (currentDuration >= duration) break;

        const remainingDuration = duration - currentDuration;
        const clipDuration = Math.min(media.duration || avgClipDuration, remainingDuration);

        if (media.type === 'video') {
          timeline.clips.push({
            id: media.id,
            source: media.source,
            url: media.url,
            downloadUrl: media.url, // Direct link for frontend to use
            startTime: currentDuration,
            duration: clipDuration,
            endTime: currentDuration + clipDuration,
            title: media.title,
            photographer: media.photographer,
            tags: media.tags,
            type: 'video',
            quality: media.quality || 'medium',
            width: media.width,
            height: media.height,
            metadata: {
              searchPhrase: media.tags[0],
              originalDuration: media.duration
            }
          });
          
          currentDuration += clipDuration;
        } else if (media.type === 'photo') {
          // For photos, add a 3-5 second duration
          const photoExtension = Math.min(5, remainingDuration);
          
          timeline.photos.push({
            id: media.id,
            source: media.source,
            url: media.url,
            downloadUrl: media.url, // Direct link for frontend to use
            startTime: currentDuration,
            duration: photoExtension,
            endTime: currentDuration + photoExtension,
            title: media.title,
            photographer: media.photographer,
            tags: media.tags,
            type: 'photo',
            width: media.width,
            height: media.height,
            metadata: {
              searchPhrase: media.tags[0]
            }
          });
          
          currentDuration += photoExtension;
        }
      }

      timeline.actualDuration = currentDuration;
      timeline.coverage = (currentDuration / duration) * 100;

      console.log(`Timeline URLs created: ${timeline.clips.length} clips, ${timeline.photos.length} photos, ${currentDuration}s/${duration}s (${timeline.coverage.toFixed(1)}% coverage)`);
      
      return timeline;

    } catch (error) {
      console.error('Error creating video timeline URLs:', error);
      throw error;
    }
  }

  /**
   * Original method that downloads media (kept for backward compatibility)
   */
  async createVideoTimeline(searchPhrases, duration, orientation = 'landscape') {
    // For now, redirect to the URL-only version
    return this.createVideoTimelineUrls(searchPhrases, duration, orientation);
  }

  /**
   * Search Pexels for videos and photos
   */
  async searchPexels(searchPhrases, count, orientation) {
    if (!this.pexelsApiKey) {
      console.warn('Pexels API key not configured');
      return [];
    }

    console.log('Pexels API Key:', this.pexelsApiKey ? 'Configured' : 'Missing');
    
    const media = [];
    const perQuery = Math.ceil(count / searchPhrases.length);

    for (const phrase of searchPhrases) {
      try {
        // Search for videos
        const videoResponse = await axios.get('https://api.pexels.com/videos/search', {
          headers: { 'Authorization': this.pexelsApiKey },
          params: {
            query: phrase,
            per_page: Math.max(10, perQuery), // Request more to filter for vertical
            orientation: this.mapOrientation(orientation),
            size: 'medium'
          }
        });

        // Process videos with enhanced vertical filtering
        if (videoResponse.data.videos) {
          for (const video of videoResponse.data.videos) {
            const videoFile = video.video_files.find(f => f.quality === 'hd' || f.quality === 'sd') || video.video_files[0];
            if (videoFile) {
              // Enhanced vertical video validation
              const isVertical = this.isVideoVertical(videoFile.width, videoFile.height);
              
              // Only include videos that match our orientation requirements
              if (orientation === 'portrait' && !isVertical) {
                continue; // Skip non-vertical videos when requesting portrait
              }
              
              media.push({
                id: video.id,
                type: 'video',
                source: 'pexels',
                url: videoFile.link,
                duration: video.duration || 5,
                title: `Video ${video.id}`,
                photographer: video.user?.name || 'Unknown',
                tags: [phrase],
                orientation: isVertical ? 'portrait' : 'landscape',
                quality: videoFile.quality,
                width: videoFile.width,
                height: videoFile.height,
                aspectRatio: videoFile.width / videoFile.height,
                isVertical: isVertical
              });
              
              // Stop once we have enough videos for this phrase
              if (media.filter(m => m.type === 'video' && m.tags.includes(phrase)).length >= Math.ceil(perQuery / 2)) {
                break;
              }
            }
          }
        }

        // Search for photos
        const photoResponse = await axios.get('https://api.pexels.com/v1/search', {
          headers: { 'Authorization': this.pexelsApiKey },
          params: {
            query: phrase,
            per_page: Math.ceil(perQuery / 2),
            orientation: this.mapOrientation(orientation)
          }
        });

        // Process photos
        if (photoResponse.data.photos) {
          for (const photo of photoResponse.data.photos) {
            const isVertical = this.isVideoVertical(photo.width, photo.height);
            
            // Only include photos that match our orientation requirements  
            if (orientation === 'portrait' && !isVertical) {
              continue;
            }
            
            media.push({
              id: photo.id,
              type: 'photo',
              source: 'pexels',
              url: photo.src.large || photo.src.medium,
              title: photo.alt || `Photo ${photo.id}`,
              photographer: photo.photographer || 'Unknown',
              tags: [phrase],
              orientation: isVertical ? 'portrait' : 'landscape',
              width: photo.width,
              height: photo.height,
              aspectRatio: photo.width / photo.height,
              isVertical: isVertical
            });
          }
        }

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`Error searching Pexels for "${phrase}":`, error.message);
      }
    }

    console.log(`Found ${media.length} media items from Pexels`);
    return media;
  }

  /**
   * Search Pixabay for videos and photos
   */
  async searchPixabay(searchPhrases, count, orientation) {
    if (!this.pixabayApiKey) {
      console.warn('Pixabay API key not configured');
      return [];
    }

    const media = [];
    const perQuery = Math.ceil(count / searchPhrases.length);

    for (const phrase of searchPhrases) {
      try {
        // Search for videos with enhanced filtering
        const videoResponse = await axios.get('https://pixabay.com/api/videos/', {
          params: {
            key: this.pixabayApiKey,
            q: phrase,
            per_page: Math.max(10, perQuery), // Request more to filter for vertical
            video_type: 'film',
            orientation: orientation === 'landscape' ? 'horizontal' : orientation === 'portrait' ? 'vertical' : 'all'
          }
        });

        // Process videos with enhanced vertical filtering
        if (videoResponse.data.hits) {
          for (const video of videoResponse.data.hits) {
            const videoFile = video.videos?.medium || video.videos?.small || video.videos?.tiny;
            if (videoFile) {
              // Get video dimensions if available
              const width = video.webformatWidth || 1920;
              const height = video.webformatHeight || 1080;
              const isVertical = this.isVideoVertical(width, height);
              
              // Only include videos that match our orientation requirements
              if (orientation === 'portrait' && !isVertical) {
                continue; // Skip non-vertical videos when requesting portrait
              }
              
              media.push({
                id: video.id,
                type: 'video',
                source: 'pixabay',
                url: videoFile.url,
                duration: video.duration || 5,
                title: video.tags || `Video ${video.id}`,
                photographer: video.user || 'Unknown',
                tags: video.tags ? video.tags.split(', ') : [phrase],
                orientation: isVertical ? 'portrait' : 'landscape',
                width: width,
                height: height,
                aspectRatio: width / height,
                isVertical: isVertical
              });
              
              // Stop once we have enough videos for this phrase
              if (media.filter(m => m.type === 'video' && m.tags.some(t => t.includes(phrase) || phrase.includes(t))).length >= Math.ceil(perQuery / 2)) {
                break;
              }
            }
          }
        }

        // Search for photos
        const photoResponse = await axios.get('https://pixabay.com/api/', {
          params: {
            key: this.pixabayApiKey,
            q: phrase,
            per_page: Math.ceil(perQuery / 2),
            image_type: 'photo',
            orientation: orientation === 'landscape' ? 'horizontal' : orientation === 'portrait' ? 'vertical' : 'all',
            safesearch: 'true'
          }
        });

        // Process photos
        if (photoResponse.data.hits) {
          for (const photo of photoResponse.data.hits) {
            const isVertical = this.isVideoVertical(photo.imageWidth, photo.imageHeight);
            
            // Only include photos that match our orientation requirements
            if (orientation === 'portrait' && !isVertical) {
              continue;
            }
            
            media.push({
              id: photo.id,
              type: 'photo',
              source: 'pixabay',
              url: photo.largeImageURL || photo.webformatURL,
              title: photo.tags || `Photo ${photo.id}`,
              photographer: photo.user || 'Unknown',
              tags: photo.tags ? photo.tags.split(', ') : [phrase],
              orientation: isVertical ? 'portrait' : 'landscape',
              width: photo.imageWidth,
              height: photo.imageHeight,
              aspectRatio: photo.imageWidth / photo.imageHeight,
              isVertical: isVertical
            });
          }
        }

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`Error searching Pixabay for "${phrase}":`, error.message);
      }
    }

    console.log(`Found ${media.length} media items from Pixabay`);
    return media;
  }

  /**
   * Select best mix of media for the timeline
   */
  selectBestMediaMix(allMedia, targetCount) {
    // Prioritize videos over photos
    const videos = allMedia.filter(m => m.type === 'video');
    const photos = allMedia.filter(m => m.type === 'photo');

    // Shuffle arrays for variety
    const shuffledVideos = this.shuffleArray([...videos]);
    const shuffledPhotos = this.shuffleArray([...photos]);

    // Aim for 70% videos, 30% photos
    const targetVideos = Math.ceil(targetCount * 0.7);
    const targetPhotos = targetCount - targetVideos;

    const selectedVideos = shuffledVideos.slice(0, Math.min(targetVideos, shuffledVideos.length));
    const selectedPhotos = shuffledPhotos.slice(0, Math.min(targetPhotos, shuffledPhotos.length));

    // Fill remaining slots with whatever is available
    const totalSelected = selectedVideos.length + selectedPhotos.length;
    if (totalSelected < targetCount) {
      const remaining = targetCount - totalSelected;
      const availableMedia = [...shuffledVideos.slice(selectedVideos.length), ...shuffledPhotos.slice(selectedPhotos.length)];
      selectedVideos.push(...availableMedia.slice(0, remaining));
    }

    return [...selectedVideos, ...selectedPhotos];
  }

  /**
   * Download media file to local storage
   */
  async downloadMedia(media) {
    try {
      const extension = media.type === 'video' ? '.mp4' : '.jpg';
      const filename = `${media.source}_${media.id}_${Date.now()}${extension}`;
      const localPath = path.join(this.uploadDir, filename);

      console.log(`Downloading ${media.type} from ${media.source}: ${media.url}`);

      const response = await axios({
        method: 'GET',
        url: media.url,
        responseType: 'stream',
        timeout: 30000, // 30 second timeout
        headers: {
          'User-Agent': 'StoryMaker-VideoService/1.0'
        }
      });

      const writer = require('fs').createWriteStream(localPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          resolve({
            localPath: `/uploads/media/${filename}`,
            filename,
            size: response.headers['content-length'] || 0
          });
        });
        writer.on('error', reject);
      });

    } catch (error) {
      console.error(`Failed to download media ${media.id}:`, error.message);
      throw error;
    }
  }

  /**
   * Helper methods
   */
  mapOrientation(orientation) {
    switch (orientation) {
      case 'landscape': return 'landscape';
      case 'portrait': return 'portrait';
      case 'square': return 'square';
      default: return 'landscape';
    }
  }

  /**
   * Determine if video/image is vertical based on dimensions
   * @param {number} width - Width in pixels
   * @param {number} height - Height in pixels
   * @returns {boolean} - True if vertical (height > width)
   */
  isVideoVertical(width, height) {
    if (!width || !height) return false;
    
    const aspectRatio = width / height;
    
    // Consider vertical if height is significantly greater than width
    // Use 0.8 threshold to account for slight variations (instead of strict 1.0)
    return aspectRatio < 0.8;
  }

  /**
   * Filter media items to only include vertical videos/images
   * @param {Array} media - Array of media items
   * @returns {Array} - Filtered array with only vertical media
   */
  filterVerticalMedia(media) {
    return media.filter(item => {
      if (item.width && item.height) {
        return this.isVideoVertical(item.width, item.height);
      }
      // If dimensions not available, check orientation property
      return item.orientation === 'portrait' || item.isVertical;
    });
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Get timeline summary
   */
  getTimelineSummary(timeline) {
    return {
      totalClips: timeline.clips.length,
      totalPhotos: timeline.photos.length,
      totalDuration: timeline.actualDuration,
      coverage: timeline.coverage,
      sources: timeline.metadata.sources,
      searchPhrases: timeline.metadata.searchPhrases
    };
  }

  /**
   * Generate mock video timeline for development when APIs are unavailable
   * @param {Array} searchPhrases - Array of search phrases
   * @param {number} duration - Total duration in seconds
   * @param {string} orientation - Video orientation
   * @returns {Object} Mock timeline data
   */
  generateMockTimeline(searchPhrases, duration, orientation = 'landscape') {
    console.log('🎭 Creating mock timeline with phrases:', searchPhrases);
    
    const mockVideoUrls = [
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'
    ];

    const clips = [];
    const numClips = Math.min(searchPhrases.length, 5);
    const clipDuration = duration / numClips;

    for (let i = 0; i < numClips; i++) {
      const phrase = searchPhrases[i] || `Mock Clip ${i + 1}`;
      const startTime = i * clipDuration;
      
      clips.push({
        id: `mock_${i}`,
        url: mockVideoUrls[i % mockVideoUrls.length],
        title: `${phrase} (Development Mock)`,
        duration: clipDuration,
        startTime: startTime,
        endTime: startTime + clipDuration,
        source: 'mock',
        searchPhrase: phrase,
        thumbnail: `https://via.placeholder.com/320x180/4338ca/ffffff?text=${encodeURIComponent(phrase)}`,
        localPath: null // No local download for mock data
      });
    }

    const timeline = {
      totalDuration: duration,
      actualDuration: duration,
      orientation,
      clips,
      photos: [], // No photos in mock data
      coverage: 100, // Mock full coverage
      metadata: {
        searchPhrases,
        createdAt: new Date().toISOString(),
        sources: ['mock-development'],
        mockData: true,
        apiKeysStatus: {
          pexels: this.pexelsApiKey ? 'present-but-invalid' : 'missing',
          pixabay: this.pixabayApiKey ? 'present-but-invalid' : 'missing'
        }
      }
    };

    console.log('✅ Mock timeline created with', clips.length, 'clips');
    return timeline;
  }

  /**
   * Generate mock timeline with URLs (for development when APIs are not available)
   */
  generateMockTimelineUrls(searchPhrases, duration, orientation = 'landscape') {
    console.log('🎬 Generating mock timeline URLs for development...');
    
    const mockVideoUrls = [
      'https://player.vimeo.com/external/371433846.sd.mp4?s=236da2f3c0fd273d2c6d9a064f3ae35579b2bbdf&profile_id=165&oauth2_token_id=57447761',
      'https://cdn.pixabay.com/vimeo/539607/540p/4K_Sunset_Orange_Pink_Clouds_Moving_Time-lapse.mp4',
      'https://cdn.pixabay.com/vimeo/502163/540p/Time_Lapse_Clouds_Sky.mp4',
      'https://cdn.pixabay.com/vimeo/397384/540p/Ocean_Waves_Beach_Sand.mp4',
      'https://cdn.pixabay.com/vimeo/458654/540p/Nature_Forest_Trees_Sunlight.mp4'
    ];

    const clips = [];
    const photos = [];
    const numClips = Math.min(searchPhrases.length, 5);
    const clipDuration = duration / numClips;

    for (let i = 0; i < numClips; i++) {
      const phrase = searchPhrases[i] || `Mock Clip ${i + 1}`;
      const startTime = i * clipDuration;
      
      clips.push({
        id: `mock_video_${i}`,
        source: 'mock',
        url: mockVideoUrls[i % mockVideoUrls.length],
        downloadUrl: mockVideoUrls[i % mockVideoUrls.length], // Same as URL for mock
        startTime: startTime,
        duration: clipDuration,
        endTime: startTime + clipDuration,
        title: `${phrase} (Development Mock Video)`,
        photographer: 'Mock Artist',
        tags: [phrase],
        type: 'video',
        quality: 'medium',
        width: 1920,
        height: 1080,
        metadata: {
          searchPhrase: phrase,
          originalDuration: clipDuration + 2 // Mock longer original
        }
      });

      // Add some mock photos too
      if (i % 2 === 0) {
        photos.push({
          id: `mock_photo_${i}`,
          source: 'mock',
          url: `https://via.placeholder.com/1920x1080/4338ca/ffffff?text=${encodeURIComponent(phrase)}`,
          downloadUrl: `https://via.placeholder.com/1920x1080/4338ca/ffffff?text=${encodeURIComponent(phrase)}`,
          startTime: 0, // Will be set when used
          duration: 3,
          endTime: 3,
          title: `${phrase} (Development Mock Photo)`,
          photographer: 'Mock Photographer',
          tags: [phrase],
          type: 'photo',
          width: 1920,
          height: 1080,
          metadata: {
            searchPhrase: phrase
          }
        });
      }
    }

    const timeline = {
      totalDuration: duration,
      actualDuration: duration,
      orientation,
      clips,
      photos,
      coverage: 100, // Mock full coverage
      metadata: {
        searchPhrases,
        createdAt: new Date().toISOString(),
        sources: ['mock-development'],
        mockData: true,
        note: 'This is mock data for development. Configure PEXELS_API_KEY and PIXABAY_API_KEY environment variables for real video data.',
        apiKeysStatus: {
          pexels: this.pexelsApiKey ? 'present-but-not-tested' : 'missing',
          pixabay: this.pixabayApiKey ? 'present-but-not-tested' : 'missing'
        }
      }
    };

    console.log('✅ Mock timeline URLs created with', clips.length, 'video clips and', photos.length, 'photos');
    return timeline;
  }
}

module.exports = VideoService;
