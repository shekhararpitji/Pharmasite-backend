const jwt = require('jsonwebtoken');
const UserModel = require('../models/user.model');
const SubscriptionModel = require('../models/subscription.model');
const dotenv = require('dotenv');
dotenv.config();

/**
 * Authentication Middleware - Verify JWT Token
 * 
 * This middleware validates the JWT token and ensures user is authenticated
 * Checks for valid token, user existence, and account status
 * 
 * Token can be provided via:
 * - Authorization header: Bearer <token>
 * - Session-ID header: <token>
 * - Cookie: access_token=<token>
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const isLogedIn = async (req, res, next) => {
  try {
    // Extract token from multiple sources
    let token = req.headers.authorization?.split(' ')[1] || 
                req.headers['session-id'] || 
                req.cookies.access_token;

    if (!token) {
      return res.status(401).json({ 
        message: 'Access denied. No token provided.',
        statusCode: 401 
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.SECRET);
    
    // Check if user exists and is active
    const user = await UserModel.findByPk(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        message: 'Invalid token or user not found.',
        statusCode: 401 
      });
    }

    // Check if user's email is verified
    if (!user.isVerified) {
      return res.status(401).json({ 
        message: 'Please verify your email before accessing this resource.',
        statusCode: 401 
      });
    }

    // Attach user to request object for use in subsequent middleware/routes
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ 
      message: 'Invalid token.',
      statusCode: 401 
    });
  }
};

/**
 * Admin Authorization Middleware
 * 
 * Ensures that only admin users can access certain routes
 * Must be used after isLogedIn middleware
 * 
 * Admin privileges:
 * - Full system access
 * - User management
 * - System configuration
 * - Data uploads
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      message: 'Access denied. Admin privileges required.',
      statusCode: 403 
    });
  }
  next();
};

/**
 * Parent Authorization Middleware
 * 
 * Ensures that only parent-level users can access certain routes
 * Parent users are company accounts with subscription management
 * 
 * Parent privileges:
 * - Company data access
 * - Child account management
 * - Subscription features
 * - Data downloads
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const isParent = (req, res, next) => {
  if (req.user.role !== 'parent' && req.user.role !== 'admin') {
    return res.status(403).json({ 
      message: 'Access denied. Parent-level access required.',
      statusCode: 403 
    });
  }
  next();
};

/**
 * Active Subscription Middleware
 * 
 * Verifies that the user has an active subscription
 * Required for premium features like data downloads
 * 
 * Checks:
 * - Subscription exists
 * - Subscription is active
 * - Subscription hasn't expired
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const hasActiveSubscription = async (req, res, next) => {
  try {
    const subscription = await SubscriptionModel.findOne({
      where: { 
        userId: req.user.id,
        isActive: true 
      }
    });

    if (!subscription) {
      return res.status(403).json({ 
        message: 'Access denied. Active subscription required.',
        statusCode: 403 
      });
    }

    // Check if subscription has expired
    if (subscription.endDate && new Date() > new Date(subscription.endDate)) {
      return res.status(403).json({ 
        message: 'Access denied. Subscription has expired.',
        statusCode: 403 
      });
    }

    // Attach subscription to request for use in routes
    req.subscription = subscription;
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({ 
      message: 'Error checking subscription status.',
      statusCode: 500 
    });
  }
};

/**
 * Combined middleware for common authentication patterns
 * Usage: [isLogedIn, isParent, hasActiveSubscription]
 */
module.exports = {
  isLogedIn,
  isAdmin,
  isParent,
  hasActiveSubscription
};