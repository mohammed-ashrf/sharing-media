const Subuser = require('../models/Subuser');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/asyncHandler');
const jwt = require('jsonwebtoken');

// Generate JWT Token
const generateToken = (id, type = 'user') => {
  return jwt.sign({ id, type }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

// Send token response
const sendTokenResponse = (user, statusCode, res, type = 'user') => {
  const token = generateToken(user._id, type);
  
  const options = {
    expires: new Date(
      Date.now() + (process.env.JWT_COOKIE_EXPIRE || 30) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true
  };
  
  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }
  
  res.status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      token,
      data: user,
      userType: type
    });
};

// @desc    Login subuser
// @route   POST /api/auth/subuser/login
// @access  Public
exports.subuserLogin = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return next(new ErrorResponse('Please provide email and password', 400));
  }
  
  // Find subuser by email
  const subuser = await Subuser.findByEmail(email).select('+password');
  
  if (!subuser) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }
  
  // Check if subuser is active
  if (subuser.status !== 'active') {
    return next(new ErrorResponse('Account is not active', 401));
  }
  
  // Check password
  const isMatch = await subuser.comparePassword(password);
  
  if (!isMatch) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }
  
  // Check if owner account is active and has valid subscription
  const owner = await User.findById(subuser.ownerId);
  
  if (!owner || !owner.isActive || owner.subscription.status !== 'active') {
    return next(new ErrorResponse('Owner account is not active or subscription expired', 401));
  }
  
  // Update last login
  subuser.lastLogin = new Date();
  await subuser.save();
  
  sendTokenResponse(subuser, 200, res, 'subuser');
});

// @desc    Get current logged in subuser
// @route   GET /api/auth/subuser/me
// @access  Private (Subuser)
exports.getSubuserMe = asyncHandler(async (req, res, next) => {
  const subuser = await Subuser.findById(req.user.id).populate({
    path: 'ownerId',
    select: 'firstName lastName subscription'
  });
  
  if (!subuser) {
    return next(new ErrorResponse('Subuser not found', 404));
  }
  
  res.status(200).json({
    success: true,
    data: subuser
  });
});

// @desc    Update subuser profile
// @route   PUT /api/auth/subuser/profile
// @access  Private (Subuser)
exports.updateSubuserProfile = asyncHandler(async (req, res, next) => {
  const fieldsToUpdate = {
    firstName: req.body.firstName,
    lastName: req.body.lastName
  };
  
  // Remove undefined fields
  Object.keys(fieldsToUpdate).forEach(key => 
    fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
  );
  
  const subuser = await Subuser.findByIdAndUpdate(
    req.user.id,
    fieldsToUpdate,
    {
      new: true,
      runValidators: true
    }
  );
  
  res.status(200).json({
    success: true,
    data: subuser
  });
});

// @desc    Change subuser password
// @route   PUT /api/auth/subuser/password
// @access  Private (Subuser)
exports.changeSubuserPassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return next(new ErrorResponse('Please provide current and new password', 400));
  }
  
  // Get subuser with password
  const subuser = await Subuser.findById(req.user.id).select('+password');
  
  // Check current password
  const isMatch = await subuser.comparePassword(currentPassword);
  
  if (!isMatch) {
    return next(new ErrorResponse('Current password is incorrect', 401));
  }
  
  // Set new password
  subuser.password = newPassword;
  await subuser.save();
  
  res.status(200).json({
    success: true,
    message: 'Password updated successfully'
  });
});

// @desc    Use credits as subuser
// @route   POST /api/auth/subuser/credits/use
// @access  Private (Subuser)
exports.subuserUseCredits = asyncHandler(async (req, res, next) => {
  const { amount } = req.body;
  
  if (!amount || amount <= 0) {
    return next(new ErrorResponse('Please provide valid credit amount', 400));
  }
  
  const subuser = await Subuser.findById(req.user.id);
  
  if (!subuser) {
    return next(new ErrorResponse('Subuser not found', 404));
  }
  
  try {
    await subuser.useOwnerCredits(amount);
    
    res.status(200).json({
      success: true,
      message: 'Credits used successfully',
      data: {
        creditsUsed: amount,
        totalUsage: subuser.creditUsage.used
      }
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

// @desc    Logout subuser
// @route   POST /api/auth/subuser/logout
// @access  Private (Subuser)
exports.subuserLogout = asyncHandler(async (req, res, next) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  
  res.status(200).json({
    success: true,
    message: 'Subuser logged out successfully'
  });
});
