const ScriptToImagesService = require('../services/scriptToImagesService');
const asyncHandler = require('../middleware/asyncHandler');

// Initialize script-to-images service
const scriptToImagesService = new ScriptToImagesService();

// ✅ PRODUCTION FIX: Per-session SSE management for concurrent users
class SSESessionManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> session data
    this.activeGenerations = new Map(); // projectId -> generation data
    this.cleanupInterval = null;
    this.startCleanup();
  }

  createSession(sessionData) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36)}`;
    this.sessions.set(sessionId, {
      ...sessionData,
      createdAt: Date.now(),
      lastAccessed: Date.now()
    });
    
    // Clean up old sessions (older than 1 hour)
    this.cleanupSessions();
    
    return sessionId;
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessed = Date.now();
      return session;
    }
    return null;
  }

  deleteSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  isProjectGenerating(projectId) {
    return this.activeGenerations.has(projectId);
  }

  startGeneration(projectId, generationData) {
    this.activeGenerations.set(projectId, {
      ...generationData,
      startedAt: Date.now()
    });
  }

  finishGeneration(projectId) {
    return this.activeGenerations.delete(projectId);
  }

  cleanupSessions() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [sessionId, session] of this.sessions) {
      if (session.lastAccessed < oneHourAgo) {
        this.sessions.delete(sessionId);
      }
    }
  }

  startCleanup() {
    // Clean up every 30 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupSessions();
    }, 30 * 60 * 1000);
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessions.clear();
    this.activeGenerations.clear();
  }
}

// Global session manager instance
const sseSessionManager = new SSESessionManager();

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

  // ✅ PRODUCTION FIX: Check if project is already generating
  if (sseSessionManager.isProjectGenerating(projectId)) {
    console.log(`⚠️ Project ${projectId} is already generating images, rejecting duplicate request`);
    
    if (req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache'
      });
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Image generation already in progress for this project'
      })}\n\n`);
      res.end();
      return;
    } else {
      return res.status(409).json({
        success: false,
        message: 'Image generation already in progress for this project'
      });
    }
  }

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
    // ✅ PRODUCTION FIX: Use session manager instead of global variables
    const sessionId = sseSessionManager.createSession({
      script,
      duration,
      maxImagesPerMin,
      projectId,
      userId: req.user.id || req.user.userId,
      audioDuration // ✅ CRITICAL: Include audio duration in session data
    });
    
    console.log(`✅ SSE session initialized: ${sessionId} for project: ${projectId} with audio duration: ${audioDuration}s`);
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
    // ✅ PRODUCTION FIX: Mark project as generating to prevent concurrent requests
    sseSessionManager.startGeneration(projectId, {
      userId: req.user.id || req.user.userId,
      script: script.substring(0, 100) + '...',
      audioDuration
    });

    // Set up Server-Sent Events with production-ready headers and extended timeout for concurrent users
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL || 'tauri://localhost' : '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'Access-Control-Allow-Credentials': 'true',
      'X-Accel-Buffering': 'no', // Disable nginx buffering for real-time streaming
      'Keep-Alive': 'timeout=600' // 10 minute keep-alive for long-running generations
    });

    // ✅ PRODUCTION-READY: Extended timeout for SSE connection (15 minutes) to handle concurrent users
    // Complex OpenAI image generation can take 5-10 minutes per project with multiple users
    const connectionTimeout = setTimeout(() => {
      console.log('⏰ SSE connection timeout reached after 15 minutes, closing connection');
      sseSessionManager.finishGeneration(projectId); // Clean up
      
      if (!res.destroyed) {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: 'Connection timeout - server may be handling multiple concurrent requests'
        })}\n\n`);
        res.end();
      }
    }, 15 * 60 * 1000); // 15 minute timeout for production with concurrent users

    // ✅ CONCURRENT USER SUPPORT: Enhanced heartbeat with connection monitoring
    const heartbeat = setInterval(() => {
      if (!res.destroyed) {
        // Send heartbeat with connection info for debugging concurrent connections
        res.write(`data: ${JSON.stringify({
          type: 'heartbeat',
          timestamp: Date.now(),
          projectId: projectId,
          activeConnections: sseSessionManager.sessions.size,
          serverLoad: process.memoryUsage().heapUsed / 1024 / 1024 // MB
        })}\n\n`);
      } else {
        clearInterval(heartbeat);
        clearTimeout(connectionTimeout);
      }
    }, 45000); // Send heartbeat every 45 seconds (longer interval for better performance with concurrent users)

    // ✅ PRODUCTION: Enhanced connection cleanup for concurrent users
    const cleanup = () => {
      clearInterval(heartbeat);
      clearTimeout(connectionTimeout);
      sseSessionManager.finishGeneration(projectId);
      console.log(`🔗 SSE connection cleaned up for project: ${projectId} (active sessions: ${sseSessionManager.sessions.size})`);
    };

    // Clean up on various connection close events
    res.on('close', cleanup);
    res.on('finish', cleanup);
    res.on('error', (error) => {
      console.error(`❌ SSE connection error for project ${projectId}:`, error.message);
      cleanup();
    });

    // ✅ PRODUCTION: Handle client disconnect gracefully
    req.on('close', () => {
      console.log(`🔌 Client disconnected for project: ${projectId}`);
      cleanup();
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
      maxImagesPerMin,
      audioDuration // ✅ Pass audio duration for accurate estimation
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

    // Clean up heartbeat before ending
    clearInterval(heartbeat);
    res.end();

    console.log(`✅ Successfully streamed ${result.data.totalImages} images to frontend (${Math.round(result.data.metadata.totalSize / 1024)}KB total)`);

  } catch (error) {
    console.error('❌ Error streaming script images:', error);
    
    // Clean up heartbeat on error
    if (typeof heartbeat !== 'undefined') {
      clearInterval(heartbeat);
    }
    
    if (!res.destroyed) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      })}\n\n`);
      
      res.end();
    }
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
    projectId,
    audioDuration // ✅ Extract audio duration from request
  } = req.body;

  console.log('📝 Script-to-Images generation request:', {
    projectId,
    scriptLength: script?.length,
    duration,
    audioDuration, // ✅ Log audio duration
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
      maxImagesPerMin,
      audioDuration // ✅ Pass audio duration to estimation
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
      maxImagesPerMin,
      audioDuration // ✅ Pass audio duration for accurate estimation
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
        maxImagesPerMin,
        audioDuration // ✅ Pass audio duration for accurate estimation
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
