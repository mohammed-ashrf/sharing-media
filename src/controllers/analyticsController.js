const Story = require('../models/Story');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * @desc    Get dashboard statistics for authenticated user
 * @route   GET /api/v1/analytics/dashboard
 * @access  Private
 */
const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Parallel queries for better performance
    const [
      totalStories,
      storiesThisMonth,
      storiesThisWeek,
      storiesToday,
      totalDuration,
      averageWordCount,
      favoriteGenres,
      recentActivity
    ] = await Promise.all([
      // Total stories count
      Story.countDocuments({ userId }),
      
      // Stories this month
      Story.countDocuments({ 
        userId, 
        createdAt: { $gte: thirtyDaysAgo } 
      }),
      
      // Stories this week
      Story.countDocuments({ 
        userId, 
        createdAt: { $gte: sevenDaysAgo } 
      }),
      
      // Stories today
      Story.countDocuments({ 
        userId, 
        createdAt: { $gte: today } 
      }),
      
      // Total duration of all stories
      Story.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, totalDuration: { $sum: '$duration' } } }
      ]),
      
      // Average word count
      Story.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, avgWordCount: { $avg: '$wordCount' } } }
      ]),
      
      // Favorite genres
      Story.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(userId) } },
        { $group: { _id: '$genre', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      
      // Recent activity (last 5 stories)
      Story.find({ userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name genre createdAt status duration')
    ]);

    // Format duration in hours and minutes
    const formatDuration = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return { hours, minutes, total: seconds };
    };

    const totalDurationFormatted = formatDuration(
      totalDuration.length > 0 ? totalDuration[0].totalDuration : 0
    );

    res.status(200).json({
      success: true,
      message: 'Dashboard statistics retrieved successfully',
      data: {
        overview: {
          totalStories,
          storiesThisMonth,
          storiesThisWeek,
          storiesToday,
          totalDuration: totalDurationFormatted,
          averageWordCount: averageWordCount.length > 0 
            ? Math.round(averageWordCount[0].avgWordCount) 
            : 0
        },
        trends: {
          monthlyGrowth: storiesThisMonth,
          weeklyGrowth: storiesThisWeek,
          dailyActivity: storiesToday
        },
        preferences: {
          favoriteGenres: favoriteGenres.map(genre => ({
            name: genre._id || 'Unspecified',
            count: genre.count
          }))
        },
        recentActivity: recentActivity.map(story => ({
          id: story._id,
          name: story.name,
          genre: story.genre || 'Unspecified',
          status: story.status,
          duration: story.duration,
          createdAt: story.createdAt
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Get detailed story analytics for authenticated user
 * @route   GET /api/v1/analytics/stories
 * @access  Private
 */
const getStoryAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const { timeframe = '30d', genre, style } = req.query;

    // Calculate date range based on timeframe
    const getDateRange = (timeframe) => {
      const now = new Date();
      switch (timeframe) {
        case '7d':
          return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        case '30d':
          return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        case '90d':
          return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        case '1y':
          return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        default:
          return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
    };

    const fromDate = getDateRange(timeframe);

    // Build match criteria
    const matchCriteria = {
      userId: mongoose.Types.ObjectId(userId),
      createdAt: { $gte: fromDate }
    };

    if (genre) matchCriteria.genre = genre;
    if (style) matchCriteria.style = style;

    const [
      storiesByDay,
      storiesByGenre,
      storiesByStyle,
      durationAnalysis,
      wordCountAnalysis
    ] = await Promise.all([
      // Stories created by day
      Story.aggregate([
        { $match: matchCriteria },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            count: { $sum: 1 },
            totalDuration: { $sum: '$duration' }
          }
        },
        { $sort: { '_id': 1 } }
      ]),

      // Stories by genre
      Story.aggregate([
        { $match: matchCriteria },
        { $group: { _id: '$genre', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // Stories by style
      Story.aggregate([
        { $match: matchCriteria },
        { $group: { _id: '$style', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // Duration analysis
      Story.aggregate([
        { $match: matchCriteria },
        {
          $group: {
            _id: null,
            avgDuration: { $avg: '$duration' },
            minDuration: { $min: '$duration' },
            maxDuration: { $max: '$duration' },
            totalDuration: { $sum: '$duration' }
          }
        }
      ]),

      // Word count analysis
      Story.aggregate([
        { $match: matchCriteria },
        {
          $group: {
            _id: null,
            avgWordCount: { $avg: '$wordCount' },
            minWordCount: { $min: '$wordCount' },
            maxWordCount: { $max: '$wordCount' },
            totalWordCount: { $sum: '$wordCount' }
          }
        }
      ])
    ]);

    res.status(200).json({
      success: true,
      message: 'Story analytics retrieved successfully',
      data: {
        timeframe,
        dailyActivity: storiesByDay,
        genreDistribution: storiesByGenre,
        styleDistribution: storiesByStyle,
        durationStats: durationAnalysis[0] || {},
        wordCountStats: wordCountAnalysis[0] || {},
        filters: { genre, style }
      }
    });

  } catch (error) {
    console.error('Error fetching story analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching story analytics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Get user activity patterns
 * @route   GET /api/v1/analytics/activity
 * @access  Private
 */
const getUserActivity = async (req, res) => {
  try {
    const userId = req.user.id;

    const [
      hourlyActivity,
      weeklyActivity,
      monthlyActivity
    ] = await Promise.all([
      // Activity by hour of day
      Story.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: { $hour: '$createdAt' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ]),

      // Activity by day of week
      Story.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: { $dayOfWeek: '$createdAt' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ]),

      // Activity by month
      Story.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 }
      ])
    ]);

    // Map day numbers to names
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    res.status(200).json({
      success: true,
      message: 'User activity patterns retrieved successfully',
      data: {
        hourlyActivity: hourlyActivity.map(item => ({
          hour: item._id,
          count: item.count
        })),
        weeklyActivity: weeklyActivity.map(item => ({
          day: dayNames[item._id - 1],
          dayNumber: item._id,
          count: item.count
        })),
        monthlyActivity: monthlyActivity.map(item => ({
          period: `${monthNames[item._id.month - 1]} ${item._id.year}`,
          year: item._id.year,
          month: item._id.month,
          count: item.count
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user activity',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Get system usage metrics (Admin only)
 * @route   GET /api/v1/analytics/usage
 * @access  Private (Admin)
 */
const getUsageMetrics = async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalStories,
      storiesThisMonth,
      topUsers,
      systemStats
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      Story.countDocuments(),
      Story.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }),
      Story.aggregate([
        {
          $group: {
            _id: '$userId',
            storyCount: { $sum: 1 },
            totalDuration: { $sum: '$duration' }
          }
        },
        { $sort: { storyCount: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        }
      ]),
      Story.aggregate([
        {
          $group: {
            _id: null,
            totalDuration: { $sum: '$duration' },
            avgDuration: { $avg: '$duration' },
            totalWordCount: { $sum: '$wordCount' },
            avgWordCount: { $avg: '$wordCount' }
          }
        }
      ])
    ]);

    res.status(200).json({
      success: true,
      message: 'Usage metrics retrieved successfully',
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactivePercent: Math.round(((totalUsers - activeUsers) / totalUsers) * 100)
        },
        stories: {
          total: totalStories,
          thisMonth: storiesThisMonth,
          monthlyGrowth: Math.round((storiesThisMonth / totalStories) * 100)
        },
        topUsers: topUsers.map(item => ({
          user: item.user[0] ? {
            id: item.user[0]._id,
            firstName: item.user[0].firstName,
            lastName: item.user[0].lastName,
            email: item.user[0].email
          } : null,
          storyCount: item.storyCount,
          totalDuration: item.totalDuration
        })),
        systemStats: systemStats[0] || {}
      }
    });

  } catch (error) {
    console.error('Error fetching usage metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching usage metrics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Get popular content analysis
 * @route   GET /api/v1/analytics/popular
 * @access  Private
 */
const getPopularContent = async (req, res) => {
  try {
    const userId = req.user.id;

    const [
      popularGenres,
      popularStyles,
      popularDurations,
      trendingTopics
    ] = await Promise.all([
      // Most popular genres
      Story.aggregate([
        { $group: { _id: '$genre', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),

      // Most popular styles
      Story.aggregate([
        { $group: { _id: '$style', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // Popular duration ranges
      Story.aggregate([
        {
          $bucket: {
            groupBy: '$duration',
            boundaries: [0, 60, 180, 300, 600, 1800, 3600, 10800],
            default: 'Other',
            output: { count: { $sum: 1 } }
          }
        }
      ]),

      // Trending topics (based on recent story topics)
      Story.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: '$topic', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
    ]);

    // Format duration ranges
    const formatDurationRange = (boundary) => {
      if (boundary === 0) return '0-1 min';
      if (boundary === 60) return '1-3 min';
      if (boundary === 180) return '3-5 min';
      if (boundary === 300) return '5-10 min';
      if (boundary === 600) return '10-30 min';
      if (boundary === 1800) return '30-60 min';
      if (boundary === 3600) return '1-3 hours';
      return '3+ hours';
    };

    res.status(200).json({
      success: true,
      message: 'Popular content analysis retrieved successfully',
      data: {
        popularGenres: popularGenres.map(item => ({
          genre: item._id || 'Unspecified',
          count: item.count
        })),
        popularStyles: popularStyles.map(item => ({
          style: item._id,
          count: item.count
        })),
        popularDurations: popularDurations.map(item => ({
          range: formatDurationRange(item._id),
          count: item.count
        })),
        trendingTopics: trendingTopics.map(item => ({
          topic: item._id.substring(0, 100) + (item._id.length > 100 ? '...' : ''),
          count: item.count
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching popular content:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching popular content',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Get performance metrics
 * @route   GET /api/v1/analytics/performance
 * @access  Private
 */
const getPerformanceMetrics = async (req, res) => {
  try {
    const userId = req.user.id;

    const [
      averageGenerationTime,
      successRate,
      tokenUsage
    ] = await Promise.all([
      // Average story generation time (if we track this)
      Story.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, avgCreationTime: { $avg: '$generationTimeMs' } } }
      ]),

      // Success rate of story generation
      Story.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),

      // OpenAI token usage
      Story.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            totalPromptTokens: { $sum: '$openaiUsage.promptTokens' },
            totalCompletionTokens: { $sum: '$openaiUsage.completionTokens' },
            totalTokens: { $sum: '$openaiUsage.totalTokens' },
            totalCost: { $sum: '$openaiUsage.cost' }
          }
        }
      ])
    ]);

    res.status(200).json({
      success: true,
      message: 'Performance metrics retrieved successfully',
      data: {
        averageGenerationTime: averageGenerationTime[0]?.avgCreationTime || 0,
        successRate: successRate,
        tokenUsage: tokenUsage[0] || {
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalTokens: 0,
          totalCost: 0
        }
      }
    });

  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching performance metrics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  getDashboardStats,
  getStoryAnalytics,
  getUserActivity,
  getUsageMetrics,
  getPopularContent,
  getPerformanceMetrics
};
