const User = require('../models/User');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

/**
 * @desc    Get all users (Admin only)
 * @route   GET /api/v1/users
 * @access  Private/Admin
 */
const getUsers = asyncHandler(async (req, res, next) => {
  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;

  // Filtering
  let filter = {};
  if (req.query.role) {
    filter.role = req.query.role;
  }
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === 'true';
  }
  if (req.query.isEmailVerified !== undefined) {
    filter.isEmailVerified = req.query.isEmailVerified === 'true';
  }

  // Sorting
  let sort = {};
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    sort = sortBy;
  } else {
    sort = '-createdAt';
  }

  // Search
  if (req.query.search) {
    filter.$or = [
      { firstName: { $regex: req.query.search, $options: 'i' } },
      { lastName: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } }
    ];
  }

  const total = await User.countDocuments(filter);
  const users = await User.find(filter)
    .sort(sort)
    .skip(startIndex)
    .limit(limit)
    .select('-password -refreshToken -passwordResetToken -emailVerificationToken');

  // Pagination result
  const pagination = {};
  const endIndex = page * limit;

  if (endIndex < total) {
    pagination.next = {
      page: page + 1,
      limit
    };
  }

  if (startIndex > 0) {
    pagination.prev = {
      page: page - 1,
      limit
    };
  }

  res.status(200).json({
    success: true,
    count: users.length,
    total,
    pagination,
    data: { users }
  });
});

/**
 * @desc    Get single user (Admin only)
 * @route   GET /api/v1/users/:id
 * @access  Private/Admin
 */
const getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('-password -refreshToken -passwordResetToken -emailVerificationToken');

  if (!user) {
    return next(new AppError(`User not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: { user }
  });
});

/**
 * @desc    Create user (Admin only)
 * @route   POST /api/v1/users
 * @access  Private/Admin
 */
const createUser = asyncHandler(async (req, res, next) => {
  const { firstName, lastName, email, password, role, isActive, isEmailVerified } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('User with this email already exists', 400));
  }

  const user = await User.create({
    firstName,
    lastName,
    email,
    password,
    role: role || 'user',
    isActive: isActive !== undefined ? isActive : true,
    isEmailVerified: isEmailVerified !== undefined ? isEmailVerified : false
  });

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: { user }
  });
});

/**
 * @desc    Update user (Admin only)
 * @route   PUT /api/v1/users/:id
 * @access  Private/Admin
 */
const updateUser = asyncHandler(async (req, res, next) => {
  const allowedUpdates = ['firstName', 'lastName', 'email', 'role', 'isActive', 'isEmailVerified'];
  const updates = {};

  // Only include allowed fields
  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  const user = await User.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true
  }).select('-password -refreshToken -passwordResetToken -emailVerificationToken');

  if (!user) {
    return next(new AppError(`User not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    message: 'User updated successfully',
    data: { user }
  });
});

/**
 * @desc    Delete user (Admin only)
 * @route   DELETE /api/v1/users/:id
 * @access  Private/Admin
 */
const deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new AppError(`User not found with id of ${req.params.id}`, 404));
  }

  // Prevent admin from deleting themselves
  if (user._id.toString() === req.user._id.toString()) {
    return next(new AppError('You cannot delete your own account', 400));
  }

  await User.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'User deleted successfully'
  });
});

/**
 * @desc    Deactivate user account (Admin only)
 * @route   PUT /api/v1/users/:id/deactivate
 * @access  Private/Admin
 */
const deactivateUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new AppError(`User not found with id of ${req.params.id}`, 404));
  }

  // Prevent admin from deactivating themselves
  if (user._id.toString() === req.user._id.toString()) {
    return next(new AppError('You cannot deactivate your own account', 400));
  }

  user.isActive = false;
  user.refreshToken = undefined;
  user.refreshTokenExpiry = undefined;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'User account deactivated successfully'
  });
});

/**
 * @desc    Activate user account (Admin only)
 * @route   PUT /api/v1/users/:id/activate
 * @access  Private/Admin
 */
const activateUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: true },
    { new: true, runValidators: true }
  ).select('-password -refreshToken -passwordResetToken -emailVerificationToken');

  if (!user) {
    return next(new AppError(`User not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    message: 'User account activated successfully',
    data: { user }
  });
});

/**
 * @desc    Get user statistics (Admin only)
 * @route   GET /api/v1/users/stats
 * @access  Private/Admin
 */
const getUserStats = asyncHandler(async (req, res, next) => {
  const stats = await User.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: {
          $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
        },
        verifiedUsers: {
          $sum: { $cond: [{ $eq: ['$isEmailVerified', true] }, 1, 0] }
        },
        adminUsers: {
          $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] }
        }
      }
    }
  ]);

  // Users registered in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentUsers = await User.countDocuments({
    createdAt: { $gte: thirtyDaysAgo }
  });

  // Users by month for the last 12 months
  const monthlyStats = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 }
    }
  ]);

  res.status(200).json({
    success: true,
    data: {
      overview: stats[0] || {
        totalUsers: 0,
        activeUsers: 0,
        verifiedUsers: 0,
        adminUsers: 0
      },
      recentUsers,
      monthlyStats
    }
  });
});

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  deactivateUser,
  activateUser,
  getUserStats
};
