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

// Create Express app
const app = express();

// Connect to database
database.connect();

// Trust proxy for accurate IP addresses (important for rate limiting)
app.set('trust proxy', 1);

// Security middleware
app.use(securityMiddleware);

// Development logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'StoryMaker API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.APP_VERSION || '1.0.0',
    database: database.getConnectionState()
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/stories', storyRoutes);
app.use('/api/v1/voice', voiceRoutes);
app.use('/api/v1/video', videoRoutes);
app.use('/api/v1/captions', captionRoutes);

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
        generateStory: 'POST /api/v1/stories/generate',
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
const server = app.listen(PORT, () => {
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