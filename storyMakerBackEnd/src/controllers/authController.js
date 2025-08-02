const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const emailService = require('../config/email');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

/**
 * Generate JWT token
 */
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

/**
 * Generate refresh token
 */
const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString('hex');
};

/**
 * Send token response
 */
const sendTokenResponse = async (user, statusCode, res, message = 'Success') => {
  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken();

  // Save refresh token to user
  user.refreshToken = refreshToken;
  user.refreshTokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await user.save();

  // Cookie options
  const cookieOptions = {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };

  res.cookie('refreshToken', refreshToken, cookieOptions);

  // Don't send password in response
  user.password = undefined;
  user.refreshToken = undefined;

  res.status(statusCode).json({
    success: true,
    message,
    token,
    data: {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        isActive: user.isActive,
        createdAt: user.createdAt
      }
    }
  });
};

/**
 * @desc    Register user
 * @route   POST /api/v1/auth/register
 * @access  Public
 */
const register = asyncHandler(async (req, res, next) => {
  const { firstName, lastName, email, password } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('User with this email already exists', 400));
  }

  // Create user
  const user = await User.create({
    firstName,
    lastName,
    email,
    password
  });

  // Generate email verification token
  const verifyToken = user.createEmailVerificationToken();
  await user.save();

  // Send verification email
  try {
    await emailService.sendVerificationEmail(user.email, user.firstName, verifyToken);
  } catch (error) {
    console.error('Error sending verification email:', error);
    // Continue with registration even if email fails
  }

  sendTokenResponse(user, 201, res, 'Registration successful. Please check your email to verify your account.');
});

/**
 * @desc    Login user
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res, next) => {
  const { email, password, rememberMe } = req.body;

  // Find user and include password for comparison
  const user = await User.findOne({ email }).select('+password');
  
  if (!user) {
    return next(new AppError('Invalid credentials', 401));
  }

  // Check if account is locked
  if (user.accountLockUntil && user.accountLockUntil > Date.now()) {
    return next(new AppError('Account is temporarily locked due to too many failed login attempts', 423));
  }

  // Check password
  const isPasswordCorrect = await user.comparePassword(password);
  
  if (!isPasswordCorrect) {
    // Increment failed login attempts
    await user.incLoginAttempts();
    return next(new AppError('Invalid credentials', 401));
  }

  // Check if account is active
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated. Please contact support.', 403));
  }

  // Reset failed login attempts
  if (user.loginAttempts > 0) {
    user.loginAttempts = 0;
    user.accountLockUntil = undefined;
    await user.save();
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  sendTokenResponse(user, 200, res, 'Login successful');
});

/**
 * @desc    Logout user
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
const logout = asyncHandler(async (req, res, next) => {
  // Clear refresh token from database
  req.user.refreshToken = undefined;
  req.user.refreshTokenExpiry = undefined;
  await req.user.save();

  // Clear refresh token cookie
  res.cookie('refreshToken', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * @desc    Get current logged in user
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
const getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        isActive: user.isActive,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    }
  });
});

/**
 * @desc    Update user profile
 * @route   PUT /api/v1/auth/profile
 * @access  Private
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName, email } = req.body;

  // Check if email is already used (if email is being changed)
  if (email && email.toLowerCase() !== req.user.email) {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new AppError('Email address is already registered', 400);
    }

    // If user is a subuser, also check subuser emails
    if (req.user.role === 'subuser') {
      const Subuser = require('../models/Subuser');
      const existingSubuser = await Subuser.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: req.user._id }
      });
      if (existingSubuser) {
        throw new AppError('Email address is already registered', 400);
      }
    }
  }

  // Update user
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    {
      firstName: firstName || req.user.firstName,
      lastName: lastName || req.user.lastName,
      email: email ? email.toLowerCase() : req.user.email
    },
    { new: true, runValidators: true }
  ).select('-password');

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: updatedUser
  });
});

/**
 * @desc    Change password
 * @route   PUT /api/v1/auth/change-password
 * @access  Private
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Get user with password
  const user = await User.findById(req.user._id).select('+password');

  // Check current password
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    throw new AppError('Current password is incorrect', 400);
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password changed successfully'
  });
});

/**
 * @desc    Forgot password
 * @route   POST /api/v1/auth/forgotpassword
 * @access  Public
 */
const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  
  if (!user) {
    return next(new AppError('No user found with that email address', 404));
  }

  // Generate reset token
  const resetToken = user.generatePasswordResetToken();
  await user.save();

  try {
    await emailService.sendPasswordResetEmail(user.email, user.firstName, resetToken);

    res.status(200).json({
      success: true,
      message: 'Password reset email sent successfully'
    });
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    console.error('Error sending password reset email:', error);
    return next(new AppError('Email could not be sent. Please try again later.', 500));
  }
});

/**
 * @desc    Reset password
 * @route   PUT /api/v1/auth/resetpassword/:resettoken
 * @access  Public
 */
const resetPassword = asyncHandler(async (req, res, next) => {
  const { password } = req.body;
  
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resettoken)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: resetPasswordToken,
    passwordResetExpires: { $gt: Date.now() }
  });

  if (!user) {
    return next(new AppError('Invalid or expired reset token', 400));
  }

  // Set new password
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.passwordChangedAt = new Date();
  await user.save();

  sendTokenResponse(user, 200, res, 'Password reset successful');
});

/**
 * @desc    Verify email
 * @route   GET /api/v1/auth/verify/:token
 * @access  Public
 */
const verifyEmail = asyncHandler(async (req, res, next) => {
  // Get hashed token
  const emailVerificationToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    emailVerificationToken,
    emailVerificationExpires: { $gt: Date.now() }
  });

  if (!user) {
    return next(new AppError('Invalid or expired verification token', 400));
  }

  // Update user
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Email verified successfully'
  });
});

/**
 * @desc    Resend email verification
 * @route   POST /api/v1/auth/resend-verification
 * @access  Private
 */
const resendVerification = asyncHandler(async (req, res, next) => {
  const user = req.user;

  if (user.isEmailVerified) {
    return next(new AppError('Email is already verified', 400));
  }

  // Generate new verification token
  const verifyToken = user.generateEmailVerificationToken();
  await user.save();

  try {
    await emailService.sendVerificationEmail(user.email, user.firstName, verifyToken);

    res.status(200).json({
      success: true,
      message: 'Verification email sent successfully'
    });
  } catch (error) {
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    console.error('Error sending verification email:', error);
    return next(new AppError('Email could not be sent. Please try again later.', 500));
  }
});

/**
 * @desc    Refresh token
 * @route   POST /api/v1/auth/refresh
 * @access  Public
 */
const refreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.cookies;

  if (!refreshToken) {
    return next(new AppError('No refresh token provided', 401));
  }

  const user = await User.findOne({
    refreshToken,
    refreshTokenExpiry: { $gt: Date.now() }
  });

  if (!user) {
    return next(new AppError('Invalid or expired refresh token', 401));
  }

  sendTokenResponse(user, 200, res, 'Token refreshed successfully');
});

module.exports = {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  refreshToken
};
