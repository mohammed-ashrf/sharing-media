// Load environment variables - prioritize .env.local for development
require('dotenv').config({ path: '.env.local' });
require('dotenv').config(); // fallback to .env if .env.local doesn't exist

const express = require('express');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');

// Import configurations
const database = require('./config/database');
const { 
  generalLimiter, 
  authLimiter, 
  passwordResetLimiter,
  securityMiddleware 
} = require('./config/security');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const storyRoutes = require('./routes/stories');
const voiceRoutes = require('./routes/voice');
const videoRoutes = require('./routes/video');
const captionRoutes = require('./routes/captions');
const analyticsRoutes = require('./routes/analytics');
const templateRoutes = require('./routes/templates');
const mediaRoutes = require('./routes/media');
const elevenLabsVoicesRoutes = require('./routes/voices'); // New ElevenLabs voices route
const subscriptionRoutes = require('./routes/subscription'); // Subscription management
const subuserAuthRoutes = require('./routes/subuserAuth'); // Subuser authentication
const subuserRoutes = require('./routes/subusers'); // Subuser management
const scriptImagesRoutes = require('./routes/scriptImages'); // Script-to-Images functionality

// Create Express app
const app = express();

// Connect to database
database.connect();

// Trust proxy for accurate IP addresses (important for rate limiting)
app.set('trust proxy', 1);

// Security middleware
app.use(securityMiddleware);

// Block access to sensitive files and directories
app.use((req, res, next) => {
  const sensitivePatterns = [
    /^\/\.env/,           // .env files
    /^\/\.git/,           // Git directory
    /^\/node_modules/,    // Node modules
    /^\/package\.json/,   // Package.json
    /^\/package-lock\.json/, // Package-lock.json
    /^\/yarn\.lock/,      // Yarn lock
    /^\/\.npmrc/,         // NPM config
    /^\/\.dockerignore/,  // Docker ignore
    /^\/Dockerfile/,      // Dockerfile
    /^\/docker-compose/,  // Docker compose files
    /^\/\.github/,        // GitHub directory
    /^\/config\//,        // Config directory
    /^\/src\/config\//,   // Source config directory
    /^\/logs\//,          // Logs directory
    /^\/tmp\//,           // Temp directory
    /^\/backup\//         // Backup directory
  ];

  const requestPath = req.path;
  
  // Check if the request matches any sensitive pattern
  const isSensitive = sensitivePatterns.some(pattern => pattern.test(requestPath));
  
  if (isSensitive) {
    const securityAlert = {
      timestamp: new Date().toISOString(),
      type: 'SENSITIVE_FILE_ACCESS_ATTEMPT',
      path: requestPath,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      headers: {
        origin: req.get('Origin'),
        referer: req.get('Referer'),
        host: req.get('Host')
      },
      method: req.method
    };
    
    console.log(`🚨 SECURITY ALERT: Blocked access to sensitive file`);
    console.log(`   📁 Path: ${requestPath}`);
    console.log(`   🌐 IP: ${req.ip}`);
    console.log(`   🔍 User-Agent: ${req.get('User-Agent') || 'Not provided'}`);
    console.log(`   📍 Origin: ${req.get('Origin') || 'Not provided'}`);
    console.log(`   🔗 Referer: ${req.get('Referer') || 'Not provided'}`);
    console.log(`   ⏰ Time: ${securityAlert.timestamp}`);
    
    // Log to file if in production
    if (process.env.NODE_ENV === 'production') {
      // In production, you might want to log this to a security log file
      // or send to a security monitoring service
      console.log('🔒 Security event logged for monitoring');
    }
    
    return res.status(403).json({
      success: false,
      message: 'Access denied',
      error: {
        statusCode: 403,
        isOperational: true,
        status: 'fail'
      }
    });
  }
  
  next();
});

// Development logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
  
  // Enhanced CORS debugging middleware
  app.use((req, res, next) => {
    if (req.headers.origin || req.headers.referer) {
      console.log(`\n🔍 Request Debug [${new Date().toISOString()}]:`);
      console.log(`   📝 Method: ${req.method}`);
      console.log(`   🎯 URL: ${req.url}`);
      console.log(`   🌍 Origin: ${req.headers.origin || 'Not provided'}`);
      console.log(`   🔗 Referer: ${req.headers.referer || 'Not provided'}`);
      console.log(`   📱 User-Agent: ${req.headers['user-agent']?.substring(0, 50) || 'Not provided'}...`);
      console.log(`   🔑 Authorization: ${req.headers.authorization ? 'Present' : 'Not provided'}`);
    }
    next();
  });
}

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Rate limiting
app.use('/api/', generalLimiter);
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/auth/forgotpassword', passwordResetLimiter);
app.use('/api/v1/auth/resetpassword', passwordResetLimiter);

// Performance monitoring middleware
app.use((req, res, next) => {
  req.startTime = Date.now();
  
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - req.startTime;
    
    // Log slow requests (> 1 second)
    if (duration > 1000) {
      console.log(`⚠️ Slow Request [${new Date().toISOString()}]:`);
      console.log(`   📍 ${req.method} ${req.url}`);
      console.log(`   ⏱️ Duration: ${duration}ms`);
      console.log(`   📊 Status: ${res.statusCode}`);
    }
    
    // Add performance headers
    res.setHeader('X-Response-Time', `${duration}ms`);
    res.setHeader('X-Timestamp', new Date().toISOString());
    
    return originalSend.call(this, data);
  };
  
  next();
});

// Enhanced health check endpoint
app.get('/health', async (req, res) => {
  const healthcheck = {
    success: true,
    message: 'StoryMaker API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.APP_VERSION || '1.0.0',
    uptime: process.uptime(),
    database: database.getConnectionState(),
    services: {
      openai: !!process.env.OPENAI_API_KEY,
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
      mongodb: database.getConnectionState() === 'connected'
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024)
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid
    }
  };

  // Check if critical services are down
  if (!healthcheck.services.mongodb) {
    healthcheck.success = false;
    healthcheck.message = 'Database connection issue';
    return res.status(503).json(healthcheck);
  }

  res.status(200).json(healthcheck);
});

// CORS test endpoint
app.get('/cors-test', (req, res) => {
  const frontendUrls = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : [];
  res.status(200).json({
    success: true,
    message: 'CORS test endpoint',
    timestamp: new Date().toISOString(),
    requestOrigin: req.headers.origin || 'No origin header',
    allowedOrigins: [
      ...frontendUrls.map(url => url.trim()),
      process.env.FRONTEND_URL_PRODUCTION,
      'http://localhost:4200',
      'http://localhost:3000',
      'tauri://localhost',
      'https://tauri.localhost'
    ].filter(Boolean),
    corsHeaders: {
      'Access-Control-Allow-Origin': res.getHeader('Access-Control-Allow-Origin'),
      'Access-Control-Allow-Methods': res.getHeader('Access-Control-Allow-Methods'),
      'Access-Control-Allow-Headers': res.getHeader('Access-Control-Allow-Headers')
    }
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/stories', storyRoutes);
app.use('/api/v1/voice', voiceRoutes);
app.use('/api/v1/video', videoRoutes);
app.use('/api/v1/captions', captionRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/templates', templateRoutes);
app.use('/api/v1/media', mediaRoutes);
app.use('/api/v1/voices', elevenLabsVoicesRoutes); // New ElevenLabs voices endpoint
app.use('/api/v1/subscription', subscriptionRoutes); // Subscription management
app.use('/api/v1/subuser', subuserAuthRoutes); // Subuser authentication
app.use('/api/v1/subusers', subuserRoutes); // Subuser management
app.use('/api/v1/script-images', scriptImagesRoutes); // Script-to-Images functionality

// Security monitoring endpoint (admin only in production)
app.get('/api/v1/security/status', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    // In production, this should require admin authentication
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }
  
  res.status(200).json({
    success: true,
    message: 'Security status',
    timestamp: new Date().toISOString(),
    protectedPaths: [
      '/.env*',
      '/.git/*',
      '/node_modules/*',
      '/package.json',
      '/config/*',
      '/src/config/*',
      '/logs/*'
    ],
    securityHeaders: {
      helmet: true,
      cors: true,
      xss: true,
      mongoSanitize: true,
      hpp: true
    }
  });
});

// Welcome route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to StoryMaker API',
    version: process.env.APP_VERSION || '1.0.0',
    documentation: '/api/v1/docs',
    health: '/health'
  });
});

// API documentation placeholder
app.get('/api/v1/docs', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'StoryMaker API Documentation',
    version: process.env.APP_VERSION || '1.0.0',
    endpoints: {
      authentication: {
        register: 'POST /api/v1/auth/register',
        login: 'POST /api/v1/auth/login',
        logout: 'POST /api/v1/auth/logout',
        me: 'GET /api/v1/auth/me',
        updateProfile: 'PUT /api/v1/auth/updateprofile',
        changePassword: 'PUT /api/v1/auth/changepassword',
        forgotPassword: 'POST /api/v1/auth/forgotpassword',
        resetPassword: 'PUT /api/v1/auth/resetpassword/:token',
        verifyEmail: 'GET /api/v1/auth/verify/:token',
        resendVerification: 'POST /api/v1/auth/resend-verification',
        refreshToken: 'POST /api/v1/auth/refresh'
      },
      users: {
        getUsers: 'GET /api/v1/users',
        getUser: 'GET /api/v1/users/:id',
        createUser: 'POST /api/v1/users',
        updateUser: 'PUT /api/v1/users/:id',
        deleteUser: 'DELETE /api/v1/users/:id',
        deactivateUser: 'PUT /api/v1/users/:id/deactivate',
        activateUser: 'PUT /api/v1/users/:id/activate',
        getUserStats: 'GET /api/v1/users/stats'
      },
      stories: {
        getAllStories: 'GET /api/v1/stories',
        getStory: 'GET /api/v1/stories/:id',
        createStory: 'POST /api/v1/stories',
        updateStory: 'PUT /api/v1/stories/:id',
        deleteStory: 'DELETE /api/v1/stories/:id',
        generateStory: 'POST /api/v1/stories/generate',
        searchStories: 'GET /api/v1/stories/search',
        exportStory: 'GET /api/v1/stories/export/:id',
        duplicateStory: 'POST /api/v1/stories/duplicate/:id',
        generateSummary: 'POST /api/v1/stories/:id/summary',
        getStatus: 'GET /api/v1/stories/status'
      },
      voice: {
        getVoices: 'GET /api/v1/voice/voices',
        getVoice: 'GET /api/v1/voice/voices/:id',
        generateSpeech: 'POST /api/v1/voice/generate',
        generateStoryVoice: 'POST /api/v1/voice/story/:storyId',
        cloneVoice: 'POST /api/v1/voice/clone',
        uploadAudio: 'POST /api/v1/voice/upload',
        getSubscription: 'GET /api/v1/voice/subscription'
      },
      video: {
        generateTimeline: 'POST /api/v1/video/generate-timeline',
        getTimeline: 'GET /api/v1/video/timeline/:storyId',
        deleteTimeline: 'DELETE /api/v1/video/timeline/:storyId',
        searchPreview: 'POST /api/v1/video/search-preview',
        getStatus: 'GET /api/v1/video/status'
      },
      captions: {
        fromAudio: 'POST /api/v1/captions/from-audio',
        fromText: 'POST /api/v1/captions/from-text',
        forStory: 'POST /api/v1/captions/story/:storyId',
        getStoryCaptions: 'GET /api/v1/captions/story/:storyId',
        deleteStoryCaptions: 'DELETE /api/v1/captions/story/:storyId',
        getStatus: 'GET /api/v1/captions/status'
      },
      analytics: {
        getDashboardStats: 'GET /api/v1/analytics/dashboard',
        getStoryStats: 'GET /api/v1/analytics/stories',
        getUserActivity: 'GET /api/v1/analytics/activity',
        getUsageMetrics: 'GET /api/v1/analytics/usage',
        getPopularContent: 'GET /api/v1/analytics/popular'
      },
      templates: {
        getTemplates: 'GET /api/v1/templates',
        getTemplate: 'GET /api/v1/templates/:id',
        createTemplate: 'POST /api/v1/templates',
        updateTemplate: 'PUT /api/v1/templates/:id',
        deleteTemplate: 'DELETE /api/v1/templates/:id',
        useTemplate: 'POST /api/v1/templates/:id/use'
      }
    }
  });
});

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Unhandled Rejection: ${err.message}`);
  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  server.close(async () => {
    console.log('HTTP server closed.');
    
    try {
      await database.disconnect();
      console.log('Database connection closed.');
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  });

  // Force close server after 30 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 StoryMaker API Server is running!
📍 Environment: ${process.env.NODE_ENV}
🌐 Server: http://localhost:${PORT}
📊 Health Check: http://localhost:${PORT}/health
📚 Documentation: http://localhost:${PORT}/api/v1/docs
🗄️ Database: ${database.getConnectionState()}
  `);
});

module.exports = app;