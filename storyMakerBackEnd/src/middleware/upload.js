const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Configure multer for memory storage (we'll handle file saving manually)
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    // Video
    'video/mp4',
    'video/avi',
    'video/mov',
    'video/wmv',
    'video/webm',
    'video/quicktime',
    // Audio
    'audio/mp3',
    'audio/mpeg',
    'audio/wav',
    'audio/aac',
    'audio/ogg',
    'audio/flac',
    'audio/x-wav',
    'audio/x-mpeg',
    // Image
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error(`Unsupported file type: ${file.mimetype}`);
    error.status = 400;
    cb(error, false);
  }
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 5 // Maximum 5 files per request
  }
});

// Custom error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    let message;
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File size too large. Maximum size is 100MB.';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files. Maximum 5 files allowed.';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field.';
        break;
      default:
        message = 'File upload error.';
    }
    
    return res.status(400).json({
      success: false,
      error: message,
      code: error.code
    });
  }
  
  next(error);
};

// Single file upload middleware
const uploadSingle = (fieldName = 'file') => {
  return [
    upload.single(fieldName),
    handleMulterError
  ];
};

// Multiple files upload middleware
const uploadMultiple = (fieldName = 'files', maxCount = 5) => {
  return [
    upload.array(fieldName, maxCount),
    handleMulterError
  ];
};

// File validation middleware (additional validation beyond multer)
const validateUpload = (req, res, next) => {
  if (!req.file && !req.files) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded'
    });
  }

  // Additional file validation can be added here
  // e.g., virus scanning, content validation, etc.
  
  next();
};

// Middleware to extract file metadata
const extractFileInfo = (req, res, next) => {
  if (req.file) {
    req.fileInfo = {
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      buffer: req.file.buffer
    };
  } else if (req.files) {
    req.filesInfo = req.files.map(file => ({
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer
    }));
  }
  
  next();
};

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  validateUpload,
  extractFileInfo,
  handleMulterError
};
