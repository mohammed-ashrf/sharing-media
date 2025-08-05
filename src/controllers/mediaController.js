const mediaService = require('../services/mediaService');
const Media = require('../models/Media');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');

/**
 * Get user's media library
 * @route GET /api/v1/media
 * @access Private
 */
const getMediaLibrary = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const options = {
    type: req.query.type,
    source: req.query.source,
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20
  };

  // Parse tags if provided
  if (req.query.tags) {
    try {
      options.tags = typeof req.query.tags === 'string' 
        ? JSON.parse(req.query.tags) 
        : req.query.tags;
    } catch (error) {
      throw new AppError('Invalid tags format', 400);
    }
  }

  // Calculate skip for pagination
  options.skip = (options.page - 1) * options.limit;

  const { media, total } = await mediaService.getMediaLibrary(userId, options);

  res.json({
    success: true,
    data: media,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      pages: Math.ceil(total / options.limit)
    }
  });
});

/**
 * Upload media file
 * @route POST /api/v1/media/upload
 * @access Private
 */
const uploadMedia = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  const userId = req.user.id;
  const additionalData = {
    title: req.body.title,
    description: req.body.description,
    tags: req.body.tags ? (Array.isArray(req.body.tags) ? req.body.tags : [req.body.tags]) : []
  };

  const media = await mediaService.saveUploadedFile(req.file, userId, additionalData);

  res.status(201).json({
    success: true,
    data: media,
    message: 'Media uploaded successfully'
  });
});

/**
 * Upload multiple media files
 * @route POST /api/v1/media/upload/multiple
 * @access Private
 */
const uploadMultipleMedia = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new AppError('No files uploaded', 400);
  }

  const userId = req.user.id;
  const uploadedMedia = [];
  const errors = [];

  // Process each file
  for (let i = 0; i < req.files.length; i++) {
    try {
      const file = req.files[i];
      const additionalData = {
        title: file.originalname,
        description: '',
        tags: []
      };

      const media = await mediaService.saveUploadedFile(file, userId, additionalData);
      uploadedMedia.push(media);
    } catch (error) {
      errors.push({
        file: req.files[i].originalname,
        error: error.message
      });
    }
  }

  res.status(201).json({
    success: true,
    data: uploadedMedia,
    errors: errors.length > 0 ? errors : undefined,
    message: `${uploadedMedia.length} file(s) uploaded successfully${errors.length > 0 ? `, ${errors.length} failed` : ''}`
  });
});

/**
 * Search external media APIs
 * @route POST /api/v1/media/search
 * @access Private
 */
const searchExternalMedia = asyncHandler(async (req, res) => {
  const { query, provider, type, category, page, perPage } = req.body;

  const options = {
    page: page || 1,
    perPage: perPage || 15,
    category
  };

  let results;

  try {
    if (provider === 'pexels') {
      results = await mediaService.searchPexels(query, type, options);
    } else if (provider === 'pixabay') {
      results = await mediaService.searchPixabay(query, type, options);
    } else {
      throw new AppError('Unsupported provider', 400);
    }

    res.json({
      success: true,
      data: results.results,
      pagination: {
        page: results.page,
        perPage: results.perPage,
        total: results.total,
        pages: Math.ceil(results.total / results.perPage)
      },
      query,
      provider
    });
  } catch (error) {
    // If external API fails, return mock data for development
    if (process.env.NODE_ENV === 'development') {
      const mockResults = [
        {
          id: `${provider}_1`,
          title: `${query} - Beautiful Scene`,
          thumbnail: 'https://picsum.photos/200/150?random=20',
          url: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',
          duration: 45,
          author: 'Professional Creator',
          provider: provider,
          type: type === 'videos' ? 'video' : 'image',
          externalId: '1'
        },
        {
          id: `${provider}_2`,
          title: `${query} - Stunning View`,
          thumbnail: 'https://picsum.photos/200/150?random=21',
          url: 'https://sample-videos.com/zip/10/mp4/SampleVideo_640x360_1mb.mp4',
          duration: 30,
          author: 'Nature Filmmaker',
          provider: provider,
          type: type === 'videos' ? 'video' : 'image',
          externalId: '2'
        }
      ];

      return res.json({
        success: true,
        data: mockResults,
        pagination: {
          page: 1,
          perPage: 15,
          total: 2,
          pages: 1
        },
        query,
        provider,
        note: 'Mock data returned due to API configuration'
      });
    }

    throw error;
  }
});

/**
 * Save external media to user's library
 * @route POST /api/v1/media/external
 * @access Private
 */
const saveExternalMedia = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const externalMedia = req.body;

  const media = await mediaService.saveExternalMedia(externalMedia, userId);

  res.status(201).json({
    success: true,
    data: media,
    message: 'External media saved to library'
  });
});

/**
 * Get media by ID
 * @route GET /api/v1/media/:id
 * @access Private
 */
const getMediaById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const media = await Media.findOne({ _id: id, userId, isActive: true });

  if (!media) {
    throw new AppError('Media not found', 404);
  }

  res.json({
    success: true,
    data: media
  });
});

/**
 * Update media metadata
 * @route PUT /api/v1/media/:id
 * @access Private
 */
const updateMedia = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const updates = req.body;

  const media = await Media.findOne({ _id: id, userId, isActive: true });

  if (!media) {
    throw new AppError('Media not found', 404);
  }

  // Only allow updating certain fields
  const allowedUpdates = ['title', 'description', 'tags'];
  const updateData = {};

  allowedUpdates.forEach(field => {
    if (updates[field] !== undefined) {
      updateData[field] = updates[field];
    }
  });

  Object.assign(media, updateData);
  await media.save();

  res.json({
    success: true,
    data: media,
    message: 'Media updated successfully'
  });
});

/**
 * Delete media
 * @route DELETE /api/v1/media/:id
 * @access Private
 */
const deleteMedia = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  await mediaService.deleteMedia(id, userId);

  res.json({
    success: true,
    message: 'Media deleted successfully'
  });
});

/**
 * Get media processing status
 * @route GET /api/v1/media/processing/status
 * @access Private
 */
const getProcessingStatus = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const processingMedia = await Media.find({
    userId,
    processingStatus: { $in: ['pending', 'processing'] },
    isActive: true
  }).select('title type processingStatus createdAt');

  res.json({
    success: true,
    data: processingMedia,
    count: processingMedia.length
  });
});

module.exports = {
  getMediaLibrary,
  uploadMedia,
  uploadMultipleMedia,
  searchExternalMedia,
  saveExternalMedia,
  getMediaById,
  updateMedia,
  deleteMedia,
  getProcessingStatus
};
