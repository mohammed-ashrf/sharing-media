const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cors = require('cors');

// Rate limiting configurations
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message,
      statusCode: 429
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Store in memory for development, use Redis for production
    ...(process.env.NODE_ENV === 'production' && {
      // Add Redis store configuration here when deploying
    })
  });
};

// General rate limiter
const generalLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // limit each IP to 100 requests per windowMs
  'Too many requests from this IP, please try again later.'
);

// Strict rate limiter for authentication endpoints
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // limit each IP to 5 requests per windowMs for auth
  'Too many authentication attempts, please try again later.'
);

// Password reset rate limiter
const passwordResetLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  3, // limit each IP to 3 password reset requests per hour
  'Too many password reset attempts, please try again later.'
);

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Parse multiple origins from environment variable
    const frontendUrls = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : [];
    
    const allowedOrigins = [
      ...frontendUrls.map(url => url.trim()),
      process.env.FRONTEND_URL_PRODUCTION,
      'http://localhost:4200',
      'http://localhost:3000',
      // Tauri specific origins
      'tauri://localhost',
      'https://tauri.localhost',
      // Add your production domains here
    ].filter(Boolean);

    // Allow requests with no origin (mobile apps, desktop apps, Tauri apps, etc.)
    if (!origin) return callback(null, true);
    
    // Check if the origin starts with tauri:// for Tauri desktop apps
    if (origin.startsWith('tauri://')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // 24 hours
};

// Helmet configuration for security headers
const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for API
};

module.exports = {
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  corsOptions,
  helmetConfig,
  
  // Security middleware stack
  securityMiddleware: [
    helmet(helmetConfig),
    cors(corsOptions),
    mongoSanitize(), // Prevent NoSQL injection attacks
    xss(), // Clean user input from malicious HTML
    hpp(), // Prevent HTTP Parameter Pollution
  ]
};
