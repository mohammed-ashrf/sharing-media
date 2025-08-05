const express = require('express');
const { 
  getDashboardStats,
  getStoryAnalytics,
  getUserActivity,
  getUsageMetrics,
  getPopularContent,
  getPerformanceMetrics
} = require('../controllers/analyticsController');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Dashboard statistics (user-specific)
router.get('/dashboard', authenticate, getDashboardStats);

// Story analytics (user-specific)
router.get('/stories', authenticate, getStoryAnalytics);

// User activity tracking
router.get('/activity', authenticate, getUserActivity);

// Usage metrics (admin only)
router.get('/usage', authenticate, requireAdmin, getUsageMetrics);

// Popular content analysis
router.get('/popular', authenticate, getPopularContent);

// Performance metrics
router.get('/performance', authenticate, getPerformanceMetrics);

module.exports = router;
