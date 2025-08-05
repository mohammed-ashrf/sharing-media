const VideoService = require('../services/videoService');
const Story = require('../models/Story');
const asyncHandler = require('../middleware/asyncHandler');

// Initialize video service
const videoService = new VideoService();

/**
 * @desc    Generate video timeline for a story
 * @route   POST /api/v1/video/generate-timeline
 * @access  Private
 */
const generateVideoTimeline = asyncHandler(async (req, res, next) => {
  const {
    storyId,
    searchPhrases,
    duration,
    orientation = 'landscape',
    customPhrases = []
  } = req.body;

  // Validate required fields
  if (!searchPhrases || !Array.isArray(searchPhrases) || searchPhrases.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Search phrases are required and must be a non-empty array'
    });
  }

  if (!duration || duration < 10 || duration > 600) {
    return res.status(400).json({
      success: false,
      message: 'Duration must be between 10 and 600 seconds'
    });
  }

  try {
    // Combine search phrases with custom phrases
    const allSearchPhrases = [...searchPhrases, ...customPhrases].filter(phrase => phrase && phrase.trim());

    // Generate video timeline with URLs only (no downloading)
    console.log(`Generating video timeline URLs for ${allSearchPhrases.length} search phrases`);
    const timeline = await videoService.createVideoTimelineUrls(allSearchPhrases, duration, orientation);

    // If storyId provided, update the story with video timeline
    if (storyId) {
      try {
        const story = await Story.findOne({ _id: storyId, userId: req.user.id });
        if (story) {
          story.videoTimeline = timeline;
          story.videoStatus = 'generated';
          await story.save();
          console.log(`Updated story ${storyId} with video timeline`);
        }
      } catch (storyError) {
        console.error('Error updating story with timeline:', storyError);
        // Don't fail the request if story update fails
      }
    }

    res.status(200).json({
      success: true,
      message: 'Video timeline URLs generated successfully',
      data: {
        timeline,
        summary: {
          totalClips: timeline.clips.length,
          totalPhotos: timeline.photos.length,
          totalDuration: timeline.totalDuration,
          actualDuration: timeline.actualDuration,
          coverage: timeline.coverage,
          sources: timeline.metadata.sources
        },
        storyId: storyId || null,
        note: 'Timeline contains URLs to external media. Frontend should handle downloading/caching as needed.'
      }
    });

  } catch (error) {
    console.error('Error generating video timeline:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate video timeline',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @desc    Get video timeline for a story
 * @route   GET /api/v1/video/timeline/:storyId
 * @access  Private
 */
const getVideoTimeline = asyncHandler(async (req, res, next) => {
  const { storyId } = req.params;

  try {
    const story = await Story.findOne({ _id: storyId, userId: req.user.id });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    if (!story.videoTimeline) {
      return res.status(404).json({
        success: false,
        message: 'No video timeline found for this story'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Video timeline retrieved successfully',
      data: {
        timeline: story.videoTimeline,
        summary: videoService.getTimelineSummary(story.videoTimeline),
        storyId: story._id
      }
    });

  } catch (error) {
    console.error('Error retrieving video timeline:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve video timeline',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @desc    Search media preview (without downloading)
 * @route   POST /api/v1/video/search-preview
 * @access  Private
 */
const searchMediaPreview = asyncHandler(async (req, res, next) => {
  const {
    searchPhrases,
    orientation = 'landscape',
    maxResults = 20
  } = req.body;

  if (!searchPhrases || !Array.isArray(searchPhrases) || searchPhrases.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Search phrases are required and must be a non-empty array'
    });
  }

  try {
    const allMedia = [];

    // Search Pexels (preview only)
    if (process.env.PEXELS_API_KEY) {
      const pexelsMedia = await videoService.searchPexels(searchPhrases, maxResults / 2, orientation);
      allMedia.push(...pexelsMedia);
    }

    // Search Pixabay (preview only)
    if (process.env.PIXABAY_API_KEY) {
      const pixabayMedia = await videoService.searchPixabay(searchPhrases, maxResults / 2, orientation);
      allMedia.push(...pixabayMedia);
    }

    // Limit results and add preview flag
    const previewMedia = allMedia.slice(0, maxResults).map(media => ({
      ...media,
      isPreview: true,
      downloadUrl: null // Don't include download URLs in preview
    }));

    res.status(200).json({
      success: true,
      message: 'Media search preview completed',
      data: {
        media: previewMedia,
        total: previewMedia.length,
        searchPhrases,
        orientation,
        sources: {
          pexels: previewMedia.filter(m => m.source === 'pexels').length,
          pixabay: previewMedia.filter(m => m.source === 'pixabay').length
        }
      }
    });

  } catch (error) {
    console.error('Error searching media preview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search media',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @desc    Get video generation status
 * @route   GET /api/v1/video/status
 * @access  Private
 */
const getVideoStatus = asyncHandler(async (req, res, next) => {
  try {
    const status = {
      serviceAvailable: true,
      pexelsConfigured: !!process.env.PEXELS_API_KEY,
      pixabayConfigured: !!process.env.PIXABAY_API_KEY,
      supportedFormats: {
        video: ['mp4'],
        photo: ['jpg', 'jpeg', 'png']
      },
      maxDuration: 600, // 10 minutes
      minDuration: 10,
      orientation: ['landscape', 'portrait', 'square'],
      features: {
        autoTimeline: true,
        multipleSourceSearch: true,
        mediaDownload: true,
        timelineCoverage: true
      }
    };

    if (!status.pexelsConfigured && !status.pixabayConfigured) {
      status.serviceAvailable = false;
      status.message = 'No video APIs configured. Please configure Pexels and/or Pixabay API keys.';
    }

    res.status(200).json({
      success: true,
      message: 'Video service status',
      data: status
    });

  } catch (error) {
    console.error('Error getting video status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get service status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @desc    Delete video timeline and media files
 * @route   DELETE /api/v1/video/timeline/:storyId
 * @access  Private
 */
const deleteVideoTimeline = asyncHandler(async (req, res, next) => {
  const { storyId } = req.params;

  try {
    const story = await Story.findOne({ _id: storyId, userId: req.user.id });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    // Clean up downloaded media files
    if (story.videoTimeline && story.videoTimeline.clips) {
      const fs = require('fs').promises;
      const path = require('path');

      for (const clip of story.videoTimeline.clips) {
        if (clip.url && clip.url.startsWith('/uploads/media/')) {
          try {
            const filePath = path.join(process.cwd(), clip.url);
            await fs.unlink(filePath);
            console.log(`Deleted media file: ${filePath}`);
          } catch (fileError) {
            console.error(`Failed to delete file ${clip.url}:`, fileError.message);
          }
        }
      }
    }

    // Remove timeline from story
    story.videoTimeline = null;
    story.videoStatus = 'none';
    await story.save();

    res.status(200).json({
      success: true,
      message: 'Video timeline deleted successfully',
      data: { storyId: story._id }
    });

  } catch (error) {
    console.error('Error deleting video timeline:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete video timeline',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = {
  generateVideoTimeline,
  getVideoTimeline,
  searchMediaPreview,
  getVideoStatus,
  deleteVideoTimeline
};
