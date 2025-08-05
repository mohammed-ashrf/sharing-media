const express = require('express');
const {
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
  refreshToken,
  getVerificationConfig
} = require('../controllers/authController');

const { authenticate } = require('../middleware/auth');
const {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
  validateUpdateProfile
} = require('../middleware/validation');

const router = express.Router();

// Public routes
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.post('/forgotpassword', validateForgotPassword, forgotPassword);
router.put('/resetpassword/:resettoken', validateResetPassword, resetPassword);
router.get('/verify/:token', verifyEmail);
router.post('/refresh', refreshToken);
router.get('/verification-config', getVerificationConfig);

// Protected routes
router.use(authenticate); // All routes after this middleware are protected

router.post('/logout', logout);
router.get('/me', getMe);
router.put('/profile', validateUpdateProfile, updateProfile);
router.put('/change-password', validateChangePassword, changePassword);
router.post('/resend-verification', resendVerification);

module.exports = router;
