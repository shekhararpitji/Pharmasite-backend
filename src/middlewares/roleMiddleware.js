const jwt = require('jsonwebtoken');
const clickhouseUserService = require('../services/clickhouseUserService');
const clickhouseSubscriptionService = require('../services/clickhouseSubscriptionService');
const clickhouseRbacService = require('../services/clickhouseRbacService');
const subscriptionValidationService = require('../services/subscriptionValidationService');
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
    
    // Check if user exists and is active using ClickHouse
    const user = await clickhouseUserService.getUserById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        message: 'Invalid token or user not found.',
        statusCode: 401 
      });
    }

    // Check if user's email is verified
    // if (!user.isVerified) {
    //   return res.status(401).json({ 
    //     message: 'Please verify your email before accessing this resource.',
    //     statusCode: 401 
    //   });
    // }

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
  const userRole = req.user.role?.toUpperCase() || req.user.role;
  if (userRole !== 'ADMIN' && userRole !== 'admin') {
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
  const userRole = req.user.role?.toUpperCase() || req.user.role;
  if (userRole !== 'PARENT' && userRole !== 'parent' && userRole !== 'ADMIN' && userRole !== 'admin') {
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
    // Get effective subscription (handles child users getting parent's subscription)
    const subscription = await subscriptionValidationService.getEffectiveSubscription(req.user);

    if (!subscription) {
      return res.status(403).json({ 
        message: 'Access denied. Active subscription required.',
        statusCode: 403 
      });
    }

    // Check if subscription has expired
    if (subscription.accessValidity && new Date() > new Date(subscription.accessValidity)) {
      return res.status(403).json({ 
        message: 'Access denied. Subscription has expired.',
        statusCode: 403 
      });
    }

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
 * Resolve user's role with permissions
 */
const resolveUserRole = async (req, res, next) => {
  try {
    const roleData = await clickhouseRbacService.getUserRolePermissions(req.user.id);
    req.userRole = roleData;
    next();
  } catch (error) {
    console.error('Error resolving user role:', error);
    next(); // Continue even if role resolution fails
  }
};

/**
 * Resolve company subscription
 */
const resolveCompanySubscription = async (req, res, next) => {
  try {
    const subscription = await subscriptionValidationService.getEffectiveSubscription(req.user);
    req.subscription = subscription;
    next();
  } catch (error) {
    console.error('Error resolving company subscription:', error);
    next(); // Continue even if subscription resolution fails
  }
};

/**
 * Check if user has a specific permission
 */
const checkPermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      // Admin bypasses all permission checks
      const userRole = req.user.role?.toUpperCase() || req.user.role;
      if (userRole === 'ADMIN' || userRole === 'admin') {
        return next();
      }

      const hasPerm = await clickhouseRbacService.hasPermission(
        req.user.id,
        permissionName
      );

      if (!hasPerm) {
        return res.status(403).json({ 
          message: `Access denied. Permission '${permissionName}' required.`,
          statusCode: 403 
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ 
        message: 'Error checking permission.',
        statusCode: 500 
      });
    }
  };
};

/**
 * Validate subscription access for data operations
 */
const validateSubscriptionAccess = (dataType, tradeType, action) => {
  return async (req, res, next) => {
    try {
      // Admin bypasses all checks
      const userRole = req.user.role?.toUpperCase() || req.user.role;
      if (userRole === 'ADMIN' || userRole === 'admin') {
        return next();
      }

      const dateRange = {
        startDate: req.query.startDate || req.body.startDate,
        endDate: req.query.endDate || req.body.endDate,
        date: req.query.date || req.body.date,
        chapter: req.query.chapter || req.body.chapter,
        productCount: req.query.productCount || req.body.productCount
      };

      const validation = await subscriptionValidationService.validateSubscriptionAccess(
        req.user,
        dataType,
        tradeType,
        action,
        dateRange
      );

      if (!validation.allowed) {
        return res.status(403).json({ 
          message: validation.reason || 'Access denied. Subscription validation failed.',
          statusCode: 403 
        });
      }

      req.subscription = validation.subscription;
      next();
    } catch (error) {
      console.error('Subscription validation error:', error);
      res.status(500).json({ 
        message: 'Error validating subscription access.',
        statusCode: 500 
      });
    }
  };
};

/**
 * Check if user can view data
 */
const canViewData = async (req, res, next) => {
  try {
    // Admin bypasses
    const userRole = req.user.role?.toUpperCase() || req.user.role;
    if (userRole === 'ADMIN' || userRole === 'admin') {
      return next();
    }

    // Check VIEW_DATA permission
    const hasPerm = await clickhouseRbacService.hasPermission(
      req.user.id,
      'VIEW_DATA'
    );

    if (!hasPerm) {
      return res.status(403).json({ 
        message: 'Access denied. VIEW_DATA permission required.',
        statusCode: 403 
      });
    }

    // Validate subscription for view access
    const dateRange = {
      startDate: req.query.startDate || req.body.startDate,
      date: req.query.date || req.body.date
    };

    const validation = await subscriptionValidationService.validateSubscriptionAccess(
      req.user,
      req.query.dataType || req.body.dataType || 'RAW',
      req.query.tradeType || req.body.tradeType || 'E',
      'view',
      dateRange
    );

    if (!validation.allowed) {
      return res.status(403).json({ 
        message: validation.reason || 'Access denied. Subscription validation failed.',
        statusCode: 403 
      });
    }

    req.subscription = validation.subscription;
    next();
  } catch (error) {
    console.error('View data check error:', error);
    res.status(500).json({ 
      message: 'Error checking view data access.',
      statusCode: 500 
    });
  }
};

/**
 * Check if user can download data
 */
const canDownloadData = (dataType) => {
  return async (req, res, next) => {
    try {
      // Admin bypasses
      const userRole = req.user.role?.toUpperCase() || req.user.role;
      if (userRole === 'ADMIN' || userRole === 'admin') {
        return next();
      }

      // Check download permission based on data type
      const permissionName = dataType === 'CLEAN' ? 'DOWNLOAD_CLEAN' : 'DOWNLOAD_RAW';
      const hasPerm = await clickhouseRbacService.hasPermission(
        req.user.id,
        permissionName
      );

      if (!hasPerm) {
        return res.status(403).json({ 
          message: `Access denied. ${permissionName} permission required.`,
          statusCode: 403 
        });
      }

      // Validate subscription for download access
      const dateRange = {
        startDate: req.query.startDate || req.body.startDate,
        date: req.query.date || req.body.date,
        chapter: req.query.chapter || req.body.chapter,
        productCount: req.query.productCount || req.body.productCount
      };

      const validation = await subscriptionValidationService.validateSubscriptionAccess(
        req.user,
        dataType,
        req.query.tradeType || req.body.tradeType || 'E',
        'download',
        dateRange
      );

      if (!validation.allowed) {
        return res.status(403).json({ 
          message: validation.reason || 'Access denied. Subscription validation failed.',
          statusCode: 403 
        });
      }

      req.subscription = validation.subscription;
      next();
    } catch (error) {
      console.error('Download data check error:', error);
      res.status(500).json({ 
        message: 'Error checking download data access.',
        statusCode: 500 
      });
    }
  };
};

/**
 * Combined middleware for common authentication patterns
 * Usage: [isLogedIn, isParent, hasActiveSubscription]
 */
module.exports = {
  isLogedIn,
  isAdmin,
  isParent,
  hasActiveSubscription,
  resolveUserRole,
  resolveCompanySubscription,
  checkPermission,
  validateSubscriptionAccess,
  canViewData,
  canDownloadData
};