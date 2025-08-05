const express = require('express');
const router = express.Router();
const {
  subuserLogin,
  getSubuserMe,
  updateSubuserProfile,
  changeSubuserPassword,
  subuserUseCredits,
  subuserLogout
} = require('../controllers/subuserAuthController');

const { protect } = require('../middleware/auth');
const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');

// Validation rules
const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const profileValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('First name must contain only letters and spaces'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Last name must contain only letters and spaces')
];

const passwordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
];

const creditsValidation = [
  body('amount')
    .isInt({ min: 1 })
    .withMessage('Amount must be a positive integer')
];

// Subuser authentication routes
router.post('/login', loginValidation, handleValidationErrors, subuserLogin);
router.post('/logout', protect, subuserLogout);
router.get('/me', protect, getSubuserMe);
router.put('/profile', protect, profileValidation, handleValidationErrors, updateSubuserProfile);
router.put('/password', protect, passwordValidation, handleValidationErrors, changeSubuserPassword);
router.post('/credits/use', protect, creditsValidation, handleValidationErrors, subuserUseCredits);

module.exports = router;
