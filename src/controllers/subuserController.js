const User = require('../models/User');
const Subuser = require('../models/Subuser');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const crypto = require('crypto');

/**
 * @desc    Get all subusers for the authenticated user
 * @route   GET /api/v1/subusers
 * @access  Private
 */
const getSubusers = asyncHandler(async (req, res) => {
  // Only main users can manage subusers
  if (req.user.role === 'subuser') {
    throw new AppError('Sub-users cannot manage other sub-users', 403);
  }

  const subusers = await Subuser.find({ owner: req.user._id })
    .select('-password')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: subusers.length,
    data: subusers
  });
});

/**
 * @desc    Create a new subuser
 * @route   POST /api/v1/subusers
 * @access  Private
 */
const createSubuser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, permissions } = req.body;

  // Only main users can create subusers
  if (req.user.role === 'subuser') {
    throw new AppError('Sub-users cannot create other sub-users', 403);
  }

  // Check if user has multi-user access
  if (!req.user.subscription.features.multiUserAccess || req.user.subscription.features.multiUserAccess === 0) {
    throw new AppError('Your subscription plan does not include sub-user access', 403);
  }

  // Check if user has reached their subuser limit
  const existingSubusers = await Subuser.countDocuments({ owner: req.user._id });
  if (existingSubusers >= req.user.subscription.features.multiUserAccess) {
    throw new AppError(`You have reached your sub-user limit of ${req.user.subscription.features.multiUserAccess}`, 400);
  }

  // Check if email is already used
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new AppError('Email address is already registered', 400);
  }

  const existingSubuser = await Subuser.findOne({ email: email.toLowerCase() });
  if (existingSubuser) {
    throw new AppError('Email address is already registered as a sub-user', 400);
  }

  // Generate a temporary password
  const tempPassword = crypto.randomBytes(8).toString('hex');

  // Create subuser
  const subuser = await Subuser.create({
    firstName,
    lastName,
    email: email.toLowerCase(),
    password: tempPassword,
    owner: req.user._id,
    permissions: permissions || {
      canCreateStories: true,
      canEditStories: true,
      canDeleteStories: false,
      canManageMedia: true,
      canExportVideos: true
    }
  });

  // Remove password from response
  const subuserResponse = subuser.toObject();
  delete subuserResponse.password;

  // TODO: Send email with login credentials to the subuser
  console.log(`Sub-user created with temporary password: ${tempPassword}`);

  res.status(201).json({
    success: true,
    message: 'Sub-user created successfully',
    data: subuserResponse,
    tempPassword: tempPassword // In production, this should be sent via email
  });
});

/**
 * @desc    Update a subuser
 * @route   PUT /api/v1/subusers/:id
 * @access  Private
 */
const updateSubuser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, permissions } = req.body;

  // Only main users can update subusers
  if (req.user.role === 'subuser') {
    throw new AppError('Sub-users cannot manage other sub-users', 403);
  }

  // Find subuser and verify ownership
  const subuser = await Subuser.findOne({ 
    _id: req.params.id, 
    owner: req.user._id 
  });

  if (!subuser) {
    throw new AppError('Sub-user not found', 404);
  }

  // Check if email is already used (if email is being changed)
  if (email && email.toLowerCase() !== subuser.email) {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new AppError('Email address is already registered', 400);
    }

    const existingSubuser = await Subuser.findOne({ 
      email: email.toLowerCase(),
      _id: { $ne: req.params.id }
    });
    if (existingSubuser) {
      throw new AppError('Email address is already registered as a sub-user', 400);
    }
  }

  // Update subuser
  const updatedSubuser = await Subuser.findByIdAndUpdate(
    req.params.id,
    {
      firstName: firstName || subuser.firstName,
      lastName: lastName || subuser.lastName,
      email: email ? email.toLowerCase() : subuser.email,
      permissions: permissions || subuser.permissions
    },
    { new: true, runValidators: true }
  ).select('-password');

  res.status(200).json({
    success: true,
    message: 'Sub-user updated successfully',
    data: updatedSubuser
  });
});

/**
 * @desc    Toggle subuser status (active/inactive)
 * @route   PATCH /api/v1/subusers/:id/status
 * @access  Private
 */
const toggleSubuserStatus = asyncHandler(async (req, res) => {
  const { isActive } = req.body;

  // Only main users can toggle subuser status
  if (req.user.role === 'subuser') {
    throw new AppError('Sub-users cannot manage other sub-users', 403);
  }

  // Find subuser and verify ownership
  const subuser = await Subuser.findOne({ 
    _id: req.params.id, 
    owner: req.user._id 
  });

  if (!subuser) {
    throw new AppError('Sub-user not found', 404);
  }

  // Update status
  subuser.isActive = isActive;
  await subuser.save();

  // Remove password from response
  const subuserResponse = subuser.toObject();
  delete subuserResponse.password;

  res.status(200).json({
    success: true,
    message: `Sub-user ${isActive ? 'activated' : 'deactivated'} successfully`,
    data: subuserResponse
  });
});

/**
 * @desc    Delete a subuser
 * @route   DELETE /api/v1/subusers/:id
 * @access  Private
 */
const deleteSubuser = asyncHandler(async (req, res) => {
  // Only main users can delete subusers
  if (req.user.role === 'subuser') {
    throw new AppError('Sub-users cannot manage other sub-users', 403);
  }

  // Find subuser and verify ownership
  const subuser = await Subuser.findOne({ 
    _id: req.params.id, 
    owner: req.user._id 
  });

  if (!subuser) {
    throw new AppError('Sub-user not found', 404);
  }

  // Delete subuser
  await Subuser.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Sub-user deleted successfully'
  });
});

module.exports = {
  getSubusers,
  createSubuser,
  updateSubuser,
  toggleSubuserStatus,
  deleteSubuser
};
