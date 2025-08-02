const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Subuser = require('../models/Subuser');

/**
 * Middleware to authenticate JWT tokens for both users and subusers
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No valid token provided.'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      let user;
      let userType = decoded.type || 'user';
      
      if (userType === 'subuser') {
        // Handle subuser authentication
        user = await Subuser.findById(decoded.userId || decoded.id).populate({
          path: 'ownerId',
          select: 'isActive subscription'
        });
        
        if (!user) {
          return res.status(401).json({
            success: false,
            message: 'Access denied. Subuser not found.'
          });
        }
        
        if (user.status !== 'active') {
          return res.status(401).json({
            success: false,
            message: 'Access denied. Subuser account is inactive.'
          });
        }
        
        // Check if owner account is active
        if (!user.ownerId || !user.ownerId.isActive || user.ownerId.subscription.status !== 'active') {
          return res.status(401).json({
            success: false,
            message: 'Access denied. Owner account is inactive or subscription expired.'
          });
        }
      } else {
        // Handle regular user authentication
        user = await User.findById(decoded.userId || decoded.id).select('-password');
        
        if (!user) {
          return res.status(401).json({
            success: false,
            message: 'Access denied. User not found.'
          });
        }

        if (!user.isActive) {
          return res.status(401).json({
            success: false,
            message: 'Access denied. Account is inactive.'
          });
        }

        // Check if account is locked
        if (user.lockUntil && user.lockUntil > Date.now()) {
          return res.status(423).json({
            success: false,
            message: 'Account is temporarily locked due to too many failed login attempts.'
          });
        }

        // Check if token was issued before password was changed
        if (user.passwordChangedAt && decoded.iat < user.passwordChangedAt.getTime() / 1000) {
          return res.status(401).json({
            success: false,
            message: 'Access denied. Password was changed recently. Please log in again.'
          });
        }
      }

      req.user = user;
      req.userType = userType;
      next();
    } catch (tokenError) {
      if (tokenError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Token has expired.',
          tokenExpired: true
        });
      }
      
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token.'
      });
    }
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.'
    });
  }
};

/**
 * Middleware to ensure only main users (not subusers) can access
 */
const requireMainUser = (req, res, next) => {
  if (req.userType !== 'user') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Main account required.'
    });
  }
  next();
};

/**
 * Middleware to check if user has admin role
 */
const requireAdmin = (req, res, next) => {
  if (req.userType !== 'user') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges not available for subusers.'
    });
  }
  
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
};

/**
 * Middleware to check if user account is verified
 */
const requireVerified = (req, res, next) => {
  if (req.userType === 'subuser') {
    // Subusers inherit verification status from owner
    if (req.user.ownerId && req.user.ownerId.isEmailVerified) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Owner account email not verified.'
      });
    }
  } else {
    if (req.user && req.user.isEmailVerified) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Please verify your email address first.'
      });
    }
  }
};

/**
 * Check specific subuser permissions
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (req.userType === 'user') {
      // Main users have all permissions
      return next();
    }
    
    if (req.userType === 'subuser') {
      if (req.user.permissions && req.user.permissions[permission]) {
        return next();
      } else {
        return res.status(403).json({
          success: false,
          message: `Access denied. Permission '${permission}' required.`
        });
      }
    }
    
    return res.status(403).json({
      success: false,
      message: 'Access denied. Invalid user type.'
    });
  };
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userType = decoded.type || 'user';
      
      let user;
      if (userType === 'subuser') {
        user = await Subuser.findById(decoded.id);
      } else {
        user = await User.findById(decoded.id).select('-password');
      }
      
      if (user && (userType === 'subuser' ? user.status === 'active' : user.isActive)) {
        req.user = user;
        req.userType = userType;
      }
    } catch (error) {
      // Silently fail for optional auth
    }
    
    next();
  } catch (error) {
    next();
  }
};

// For backward compatibility
const protect = authenticate;

module.exports = {
  authenticate,
  protect,
  requireMainUser,
  requireAdmin,
  requireVerified,
  requirePermission,
  optionalAuth
};
