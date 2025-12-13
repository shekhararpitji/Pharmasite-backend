const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { verifyRole, isAdmin, isLogedIn } = require('../middlewares/roleMiddleware');

/**
 * Analytics Routes
 * 
 * These routes provide ClickHouse-based analytics endpoints
 * All routes require authentication and admin role
 */

// Dashboard metrics
router.get('/dashboard', isLogedIn ,isAdmin, analyticsController.getDashboardMetrics);

// User analytics
router.get('/users', isLogedIn ,isAdmin, analyticsController.getUserAnalytics);

// Subscription analytics
router.get('/subscriptions', isLogedIn ,isAdmin, analyticsController.getSubscriptionAnalytics);

// Activity analytics
router.get('/activities', isLogedIn ,isAdmin, analyticsController.getActivityAnalytics);

// User activities (specific user)
router.get('/user-activities/:userId', isLogedIn ,isAdmin, analyticsController.getUserActivities);

// Churn analysis
router.get('/churn', isLogedIn ,isAdmin, analyticsController.getChurnAnalysis);

// User engagement scores
router.get('/engagement', isLogedIn ,isAdmin, analyticsController.getUserEngagementScores);

module.exports = router;





