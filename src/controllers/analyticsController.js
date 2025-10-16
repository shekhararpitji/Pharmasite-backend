const analyticsService = require('../services/analyticsService');

/**
 * Analytics Controller - Endpoints for ClickHouse-based analytics
 * 
 * Provides fast analytics queries for:
 * - User analytics
 * - Subscription analytics
 * - Activity analytics
 * - Dashboard metrics
 */

/**
 * Get user analytics
 * GET /api/analytics/users
 * Query params: startDate, endDate, role
 */
exports.getUserAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, role } = req.query;
    
    const analytics = await analyticsService.getUserAnalytics({
      startDate,
      endDate,
      role
    });
    
    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error getting user analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user analytics',
      message: error.message
    });
  }
};

/**
 * Get subscription analytics
 * GET /api/analytics/subscriptions
 * Query params: startDate, endDate, status
 */
exports.getSubscriptionAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    
    const analytics = await analyticsService.getSubscriptionAnalytics({
      startDate,
      endDate,
      status
    });
    
    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error getting subscription analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription analytics',
      message: error.message
    });
  }
};

/**
 * Get activity analytics
 * GET /api/analytics/activities
 * Query params: startDate, endDate, activityType, userId
 */
exports.getActivityAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, activityType, userId } = req.query;
    
    const analytics = await analyticsService.getActivityAnalytics({
      startDate,
      endDate,
      activityType,
      userId: userId ? parseInt(userId) : undefined
    });
    
    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error getting activity analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activity analytics',
      message: error.message
    });
  }
};

/**
 * Get user activities from ClickHouse (faster for large datasets)
 * GET /api/analytics/user-activities/:userId
 * Query params: limit, offset
 */
exports.getUserActivities = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    
    const activities = await analyticsService.getUserActivitiesFromClickHouse(
      parseInt(userId),
      parseInt(limit),
      parseInt(offset)
    );
    
    res.status(200).json({
      success: true,
      data: activities,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Error getting user activities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user activities',
      message: error.message
    });
  }
};

/**
 * Get comprehensive dashboard metrics
 * GET /api/analytics/dashboard
 * Query params: startDate, endDate
 */
exports.getDashboardMetrics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const metrics = await analyticsService.getDashboardMetrics({
      startDate,
      endDate
    });
    
    res.status(200).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error getting dashboard metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard metrics',
      message: error.message
    });
  }
};

/**
 * Get subscription churn analysis
 * GET /api/analytics/churn
 * Query params: months (default: 12)
 */
exports.getChurnAnalysis = async (req, res) => {
  try {
    const { months = 12 } = req.query;
    
    const churnData = await analyticsService.getChurnAnalysis(parseInt(months));
    
    res.status(200).json({
      success: true,
      data: churnData
    });
  } catch (error) {
    console.error('Error getting churn analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get churn analysis',
      message: error.message
    });
  }
};

/**
 * Get user engagement scores
 * GET /api/analytics/engagement
 * Query params: limit (default: 100)
 */
exports.getUserEngagementScores = async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    const engagementData = await analyticsService.getUserEngagementScores(parseInt(limit));
    
    res.status(200).json({
      success: true,
      data: engagementData
    });
  } catch (error) {
    console.error('Error getting engagement scores:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get engagement scores',
      message: error.message
    });
  }
};

module.exports = exports;





