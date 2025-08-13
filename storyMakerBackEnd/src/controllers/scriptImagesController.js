const ScriptToImagesService = require('../services/scriptToImagesService');
const asyncHandler = require('../middleware/asyncHandler');

// Initialize script-to-images service
const scriptToImagesService = new ScriptToImagesService();

/**
 * @desc    Generate images for script timeline (stream to frontend)
 * @route   POST /api/v1/script-images/generate-stream
 * @access  Private
 */
const generateScriptImagesStream = asyncHandler(async (req, res, next) => {
  // Handle both query parameters (for SSE EventSource) and body parameters (for POST initialization)
  let script, duration, maxImagesPerMin, projectId, token, audioDuration;
  
  if (req.method === 'GET') {
    // SSE EventSource request - extract from query
    ({ script, duration: durationStr, maxImagesPerMin: maxImagesPerMinStr = '4', projectId, token, audioDuration: audioDurationStr } = req.query);
    duration = parseFloat(durationStr);
    maxImagesPerMin = parseInt(maxImagesPerMinStr, 10);
    audioDuration = audioDurationStr ? parseFloat(audioDurationStr) : undefined;
    
    // Decode script from URL encoding
    script = decodeURIComponent(script || '');
  } else {
    // POST request - extract from body
    ({ script, duration, maxImagesPerMin = 4, projectId, audioDuration } = req.body);
    token = req.query.token || req.body.token;
  }

  console.log('📝 Script-to-Images streaming generation request:', {
    method: req.method,
    projectId,
    scriptLength: script?.length,
    duration,
    maxImagesPerMin,
    audioDuration, // ✅ Log audio duration
    scriptPreview: script ? script.substring(0, 200) + '...' : 'missing'
  });

  // For SSE, we need to validate token if provided via query params
  if (token && !req.user) {
    // Production token validation
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      console.log('✅ SSE authentication successful for user:', decoded.userId || decoded.id);
    } catch (error) {
      console.error('❌ SSE authentication failed:', error.message);
      
      if (req.method === 'GET') {
        // For SSE, send error event
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache'
        });
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: 'Invalid authentication token'
        })}\n\n`);
        res.end();
        return;
      } else {
        return res.status(401).json({
          success: false,
          message: 'Invalid authentication token'
        });
      }
    }
  } else if (!req.user) {
    // No token provided and not authenticated
    console.error('❌ SSE request without authentication');
    
    if (req.method === 'GET') {
      // For SSE, send error event
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache'
      });
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Authentication required for script image generation'
      })}\n\n`);
      res.end();
      return;
    } else {
      return res.status(401).json({
        success: false,
        message: 'Authentication required for script image generation'
      });
    }
  }

  // Handle POST request to initialize SSE session data
  if (req.method === 'POST') {
    // Store session data for SSE request (you might want to use Redis in production)
    const sessionId = `session_${Date.now()}_${Math.random().toString(36)}`;
    global.sseSessionData = global.sseSessionData || {};
    global.sseSessionData[sessionId] = {
      script,
      duration,
      maxImagesPerMin,
      projectId,
      userId: req.user.id || req.user.userId,
      createdAt: Date.now()
    };
    
    console.log(`✅ SSE session initialized: ${sessionId}`);
    return res.json({
      success: true,
      sessionId: sessionId,
      message: 'SSE session ready'
    });
  }

  // Validate input parameters
  const validation = scriptToImagesService.validateParams({
    script,
    duration,
    maxImagesPerMin,
    projectId
  });

  if (!validation.isValid) {
    const errorMessage = 'Invalid parameters: ' + validation.errors.join(', ');
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache'
    });
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: errorMessage
    })}\n\n`);
    res.end();
    return;
  }

  try {
    // Set up Server-Sent Events with production-ready headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL || 'tauri://localhost' : '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'Access-Control-Allow-Credentials': 'true',
      'X-Accel-Buffering': 'no' // Disable nginx buffering for real-time streaming
    });

    // Send initial status
    res.write(`data: ${JSON.stringify({
      type: 'init',
      message: 'Starting image generation...',
      projectId
    })}\n\n`);

    // Get generation estimates for client
    const estimates = scriptToImagesService.estimateGeneration({
      script,
      duration,
      maxImagesPerMin
    });

    console.log(`🎯 Estimated generation: ${estimates.expectedImages} images, ~${estimates.estimatedProcessingTime.formatted} processing time`);

    // Send estimates
    res.write(`data: ${JSON.stringify({
      type: 'estimates',
      data: estimates
    })}\n\n`);

    // Generate images with streaming callback
    console.log(`🎨 Starting streaming image generation for project ${projectId}`);
    
    const result = await scriptToImagesService.generateScriptImagesStream({
      script,
      duration,
      maxImagesPerMin,
      projectId,
      audioDuration, // ✅ Pass audio duration to the service
      onImageGenerated: (imageData, progress) => {
        // Stream each image as it's generated
        res.write(`data: ${JSON.stringify({
          type: 'image',
          image: imageData,
          progress: progress
        })}\n\n`);
        
        console.log(`📡 Streamed image: ${imageData.filename} (${Math.round(imageData.size / 1024)}KB) - Progress: ${progress.current}/${progress.total}`);
      },
      onProgress: (progressData) => {
        // Stream progress updates
        res.write(`data: ${JSON.stringify({
          type: 'progress',
          current: progressData.current,
          total: progressData.total,
          stage: progressData.stage,
          message: progressData.message,
          timestamp: progressData.timestamp
        })}\n\n`);
      },
      onError: (errorData) => {
        // Stream error notifications
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: errorData.error || errorData.message || 'Unknown error',
          timestamp: errorData.timestamp,
          stage: errorData.stage
        })}\n\n`);
      }
    });

    if (!result.success) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Image generation failed'
      })}\n\n`);
      res.end();
      return;
    }

    // Send completion message
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      projectId: result.data.projectId,
      totalImages: result.data.totalImages,
      failedImages: result.data.failedImages,
      generatedAt: result.data.generatedAt,
      metadata: {
        wordCount: result.data.wordCount,
        duration: result.data.duration,
        wordsPerSecond: result.data.wordsPerSecond,
        chunkDuration: result.data.chunkDuration,
        maxImagesPerMin: result.data.maxImagesPerMin,
        totalSize: result.data.metadata.totalSize,
        averageImageSize: result.data.metadata.averageImageSize
      }
    })}\n\n`);

    res.end();

    console.log(`✅ Successfully streamed ${result.data.totalImages} images to frontend (${Math.round(result.data.metadata.totalSize / 1024)}KB total)`);

  } catch (error) {
    console.error('❌ Error streaming script images:', error);
    
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    })}\n\n`);
    
    res.end();
  }
});

/**
 * @desc    Generate images for script timeline (legacy endpoint)
 * @route   POST /api/v1/script-images/generate
 * @access  Private
 */
const generateScriptImages = asyncHandler(async (req, res, next) => {
  const {
    script,
    duration,
    maxImagesPerMin = 4,
    projectId
  } = req.body;

  console.log('📝 Script-to-Images generation request:', {
    projectId,
    scriptLength: script?.length,
    duration,
    maxImagesPerMin,
    scriptPreview: script ? script.substring(0, 200) + '...' : 'missing'
  });

  // Validate input parameters
  const validation = scriptToImagesService.validateParams({
    script,
    duration,
    maxImagesPerMin,
    projectId
  });

  if (!validation.isValid) {
    return res.status(400).json({
      success: false,
      message: 'Invalid parameters',
      errors: validation.errors
    });
  }

  try {
    // Get generation estimates for client
    const estimates = scriptToImagesService.estimateGeneration({
      script,
      duration,
      maxImagesPerMin
    });

    console.log(`🎯 Estimated generation: ${estimates.expectedImages} images, ~${estimates.estimatedProcessingTime.formatted} processing time`);

    // Generate images and stream data to frontend
    console.log(`🎨 Starting image generation for project ${projectId}`);
    
    const result = await scriptToImagesService.generateScriptImages({
      script,
      duration,
      maxImagesPerMin,
      projectId,
      audioDuration // ✅ Pass audio duration to non-streaming method
    });

    if (!result.success) {
      throw new Error('Image generation failed');
    }

    // Send complete data package to frontend for local storage
    res.status(201).json({
      success: true,
      message: 'Script images generated successfully',
      data: {
        projectId: result.data.projectId,
        totalImages: result.data.totalImages,
        failedImages: result.data.failedImages,
        images: result.data.images, // Contains base64 data for frontend to save
        metadata: {
          wordCount: result.data.wordCount,
          duration: result.data.duration,
          wordsPerSecond: result.data.wordsPerSecond,
          chunkDuration: result.data.chunkDuration,
          maxImagesPerMin: result.data.maxImagesPerMin,
          totalSize: result.data.metadata.totalSize,
          averageImageSize: result.data.metadata.averageImageSize,
          downloadTime: result.data.metadata.estimatedDownloadTime
        },
        generatedAt: result.data.generatedAt,
        estimates: estimates,
        failedAttempts: result.data.failedAttempts || []
      }
    });

    console.log(`✅ Successfully sent ${result.data.totalImages} images to frontend (${Math.round(result.data.metadata.totalSize / 1024)}KB total)`);

  } catch (error) {
    console.error('❌ Error generating script images:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to generate script images',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @desc    Get generation estimates for script
 * @route   POST /api/v1/script-images/estimate
 * @access  Private
 */
const getGenerationEstimates = asyncHandler(async (req, res, next) => {
  const {
    script,
    duration,
    maxImagesPerMin = 4
  } = req.body;

  // Basic validation for estimates
  if (!script || !duration) {
    return res.status(400).json({
      success: false,
      message: 'Script and duration are required for estimates'
    });
  }

  try {
    const estimates = scriptToImagesService.estimateGeneration({
      script,
      duration,
      maxImagesPerMin
    });

    res.status(200).json({
      success: true,
      message: 'Generation estimates calculated',
      data: estimates
    });

  } catch (error) {
    console.error('❌ Error calculating estimates:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to calculate estimates',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @desc    Validate script parameters
 * @route   POST /api/v1/script-images/validate
 * @access  Private
 */
const validateScriptParams = asyncHandler(async (req, res, next) => {
  const {
    script,
    duration,
    maxImagesPerMin = 4,
    projectId
  } = req.body;

  try {
    const validation = scriptToImagesService.validateParams({
      script,
      duration,
      maxImagesPerMin,
      projectId
    });

    if (validation.isValid) {
      const estimates = scriptToImagesService.estimateGeneration({
        script,
        duration,
        maxImagesPerMin
      });

      res.status(200).json({
        success: true,
        message: 'Parameters are valid',
        data: {
          valid: true,
          estimates: estimates
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Parameter validation failed',
        data: {
          valid: false,
          errors: validation.errors
        }
      });
    }

  } catch (error) {
    console.error('❌ Error validating parameters:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to validate parameters',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = {
  generateScriptImages,
  generateScriptImagesStream,
  getGenerationEstimates,
  validateScriptParams
};
