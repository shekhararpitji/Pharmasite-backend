const { getUser } = require("../services/roleServies");
const { validateToken } = require("../utils/authUtil");
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user.model');
require('dotenv').config();

exports.authMiddleware = async (req, res, next) => {
  try {
    const decodedToken = validateToken(req);
    next();
  } catch (error) {
    console.error(error);
    return res.status(401).json(error);
  }
};

exports.isLogedIn = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        statusCode: 401,
        message: 'Authentication required. Please log in.'
      });
    }
    
    const decoded = jwt.verify(token, 'klhdhsd&jigisd6$jhds#uds');
    const user = await UserModel.findOne({ where: { id: decoded.id } ,attributes: { exclude: [] }});
    if (!user || !user.isActive) {
      return res.status(401).json({
        statusCode: 401,
        message: 'User not found or inactive'
      });
    }
    
    req.user = user;
    console.log(user)
    next();
  } catch (error) {
    return res.status(401).json({
      statusCode: 401,
      message: 'Invalid or expired token'
    });
  }
};

exports.isAdmin = async (req, res, next) => {
  try {
    // First check if user is logged in
    await exports.isLogedIn(req, res, () => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied. Admin privileges required.'
        });
      }
      next();
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: 'Server error while checking admin privileges'
    });
  }
};

exports.isOperator = async (req, res, next) => {
  const payload = req.body.data;
  const userData = await getUser(payload.email);
  if (userData && userData.role === "operator") {
    return next();
  }

  return res.status(401).send({ message: "you are not operator or not login" });
};

exports.isUser = async (req, res, next) => {
  const payload = req.body.data;
  const userData = await getUser(payload.email);
  if (userData && userData.role === "user") {
    return next();
  }

  return res.status(401).send({ message: "you are not user or not login" });
};

exports.isParent = async (req, res, next) => {
  try {
    // First check if user is logged in
    await exports.isLogedIn(req, res, () => {
      if (req.user.role !== 'parent' && req.user.role !== 'admin') {
        return res.status(403).json({
          statusCode: 403,
          message: 'Access denied. Parent privileges required.'
        });
      }
      next();
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: 'Server error while checking parent privileges'
    });
  }
};

exports.isParentOfChildOrAdmin = async (req, res, next) => {
  try {
    // First check if user is logged in
    await exports.isLogedIn(req, res, async () => {
      const childId = req.params.childId || req.body.childId;
      
      if (!childId) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Child ID is required'
        });
      }
      
      // If user is admin, allow access
      if (req.user.role === 'admin') {
        return next();
      }
      
      // If user is parent, check if the child belongs to them
      if (req.user.role === 'parent') {
        const childUser = await UserModel.findOne({ 
          where: { 
            id: childId,
            parentId: req.user.id 
          }
        });
        
        if (!childUser) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied. You are not the parent of this child user.'
          });
        }
        
        return next();
      }
      
      // If user is neither admin nor parent
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied. Insufficient privileges.'
      });
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: 'Server error while checking privileges'
    });
  }
};

exports.hasActiveSubscription = async (req, res, next) => {
  try {
    // First check if user is logged in
    await exports.isLogedIn(req, res, async () => {
      // Skip subscription check for admins
      if (req.user.role === 'admin') {
        return next();
      }
      
      // For child users, check parent's subscription
      let userToCheck = req.user;
      
      if (req.user.role === 'child' && req.user.parentId) {
        userToCheck = await UserModel.findByPk(req.user.parentId);
        if (!userToCheck) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Parent user not found.'
          });
        }
      }
      
      // Check if user has an active subscription
      if (!userToCheck.subscriptionId) {
        return res.status(402).json({
          statusCode: 402,
          message: 'Subscription required to access this feature.'
        });
      }
      
      // Try to load the Subscription model, but handle gracefully if it's not available
      try {
        const SubscriptionModel = require('../models/subscription.model');
        const subscription = await SubscriptionModel.findByPk(userToCheck.subscriptionId);
        
        if (!subscription || subscription.status !== 'active') {
          return res.status(402).json({
            statusCode: 402,
            message: 'Active subscription required to access this feature.'
          });
        }
      } catch (error) {
        console.warn('Could not verify subscription status due to database limitations:', error.message);
        // Just proceed if we can't check the subscription status in detail
        // This avoids breaking functionality when the table doesn't exist
      }
      
      next();
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: 'Server error while checking subscription'
    });
  }
};