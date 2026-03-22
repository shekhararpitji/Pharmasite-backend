const { clickhouse } = require('../config/clickhouse');
const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';

/**
 * Analytics Service - ClickHouse-based analytics for User, Subscription, and Activity data
 * 
 * This service provides fast analytics queries on ClickHouse for:
 * - User analytics (signups, activity patterns)
 * - Subscription analytics (revenue, retention)
 * - Activity analytics (usage patterns, engagement)
 */

/**
 * Get user analytics summary
 */
exports.getUserAnalytics = async (filters = {}) => {
  try {
    const { startDate, endDate, role } = filters;
    
    let whereClause = 'WHERE 1=1';
    if (startDate) {
      whereClause += ` AND createdAt >= '${startDate}'`;
    }
    if (endDate) {
      whereClause += ` AND createdAt <= '${endDate}'`;
    }
    if (role) {
      whereClause += ` AND role = '${role}'`;
    }

    // Total users by role
    const usersByRoleResult = await clickhouse.query({
      query: `
        SELECT 
          role,
          count(*) as count,
          countIf(isActive = 1) as active_count,
          countIf(isVerified = 1) as verified_count
        FROM ${DATABASE_NAME}.users
        ${whereClause}
        GROUP BY role
        ORDER BY count DESC
      `,
      format: 'JSONEachRow'
    });
    const usersByRole = await usersByRoleResult.json();

    // User signups over time (monthly)
    const signupsOverTimeResult = await clickhouse.query({
      query: `
        SELECT 
          toYYYYMM(createdAt) as month,
          count(*) as signups,
          countIf(role = 'parent') as parent_signups,
          countIf(role = 'kid') as kid_signups
        FROM ${DATABASE_NAME}.users
        ${whereClause}
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `,
      format: 'JSONEachRow'
    });
    const signupsOverTime = await signupsOverTimeResult.json();

    // Last login patterns
    const loginPatternsResult = await clickhouse.query({
      query: `
        SELECT 
          if(lastLogin IS NULL, 'never', 
            if(dateDiff('day', lastLogin, now()) > 30, 'inactive_30d', 
              if(dateDiff('day', lastLogin, now()) > 7, 'inactive_7d', 'active'))) as status,
          count(*) as count
        FROM ${DATABASE_NAME}.users
        ${whereClause}
        GROUP BY status
        ORDER BY count DESC
      `,
      format: 'JSONEachRow'
    });
    const loginPatterns = await loginPatternsResult.json();

    return {
      usersByRole,
      signupsOverTime,
      loginPatterns
    };
  } catch (error) {
    console.error('Error getting user analytics:', error);
    throw error;
  }
};

/**
 * Get subscription analytics summary
 */
exports.getSubscriptionAnalytics = async (filters = {}) => {
  try {
    const { startDate, endDate, status } = filters;
    
    let whereClause = 'WHERE 1=1';
    if (startDate) {
      whereClause += ` AND startDate >= '${startDate}'`;
    }
    if (endDate) {
      whereClause += ` AND startDate <= '${endDate}'`;
    }
    if (status) {
      whereClause += ` AND status = '${status}'`;
    }

    // Subscriptions by status
    const subscriptionsByStatusResult = await clickhouse.query({
      query: `
        SELECT 
          status,
          count(*) as count,
          sum(subscriptionCost) as total_revenue,
          avg(subscriptionCost) as avg_revenue
        FROM ${DATABASE_NAME}.subscriptions
        ${whereClause}
        GROUP BY status
        ORDER BY count DESC
      `,
      format: 'JSONEachRow'
    });
    const subscriptionsByStatus = await subscriptionsByStatusResult.json();

    // Monthly revenue trends
    const revenueOverTimeResult = await clickhouse.query({
      query: `
        SELECT 
          toYYYYMM(startDate) as month,
          count(*) as subscription_count,
          sum(subscriptionCost) as total_revenue,
          avg(subscriptionCost) as avg_revenue
        FROM ${DATABASE_NAME}.subscriptions
        ${whereClause}
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `,
      format: 'JSONEachRow'
    });
    const revenueOverTime = await revenueOverTimeResult.json();

    // Subscription features analysis
    const featuresAnalysisResult = await clickhouse.query({
      query: `
        SELECT 
          if(subscriptionExport = 1, 'export', 'no_export') as export_status,
          if(subscriptionImport = 1, 'import', 'no_import') as import_status,
          count(*) as count,
          sum(subscriptionCost) as total_revenue
        FROM ${DATABASE_NAME}.subscriptions
        ${whereClause}
        GROUP BY export_status, import_status
        ORDER BY count DESC
      `,
      format: 'JSONEachRow'
    });
    const featuresAnalysis = await featuresAnalysisResult.json();

    // Expiring subscriptions (next 30 days)
    const expiringSubscriptionsResult = await clickhouse.query({
      query: `
        SELECT 
          count(*) as expiring_count,
          sum(subscriptionCost) as potential_lost_revenue
        FROM ${DATABASE_NAME}.subscriptions
        WHERE endDate IS NOT NULL 
          AND endDate >= now() 
          AND endDate <= addDays(now(), 30)
          AND autoRenew = 0
      `,
      format: 'JSONEachRow'
    });
    const expiringSubscriptions = await expiringSubscriptionsResult.json();

    return {
      subscriptionsByStatus,
      revenueOverTime,
      featuresAnalysis,
      expiringSubscriptions: expiringSubscriptions[0] || { expiring_count: 0, potential_lost_revenue: 0 }
    };
  } catch (error) {
    console.error('Error getting subscription analytics:', error);
    throw error;
  }
};

/**
 * Get activity analytics summary
 */
exports.getActivityAnalytics = async (filters = {}) => {
  try {
    const { startDate, endDate, activityType, userId } = filters;
    
    let whereClause = 'WHERE 1=1';
    if (startDate) {
      whereClause += ` AND createdAt >= '${startDate}'`;
    }
    if (endDate) {
      whereClause += ` AND createdAt <= '${endDate}'`;
    }
    if (activityType) {
      whereClause += ` AND activityType = '${activityType}'`;
    }
    if (userId) {
      whereClause += ` AND userId = ${parseInt(userId)}`;
    }

    // Activity by type
    const activityByTypeResult = await clickhouse.query({
      query: `
        SELECT 
          activityType,
          count(*) as count,
          uniq(userId) as unique_users
        FROM ${DATABASE_NAME}.activities
        ${whereClause}
        GROUP BY activityType
        ORDER BY count DESC
      `,
      format: 'JSONEachRow'
    });
    const activityByType = await activityByTypeResult.json();

    // Daily activity trends
    const dailyActivityResult = await clickhouse.query({
      query: `
        SELECT 
          toDate(createdAt) as date,
          count(*) as total_activities,
          uniq(userId) as unique_users,
          countIf(activityType = 'login') as logins,
          countIf(activityType = 'download') as downloads,
          countIf(activityType = 'search') as searches,
          countIf(activityType = 'view') as views
        FROM ${DATABASE_NAME}.activities
        ${whereClause}
        GROUP BY date
        ORDER BY date DESC
        LIMIT 30
      `,
      format: 'JSONEachRow'
    });
    const dailyActivity = await dailyActivityResult.json();

    // Most active users
    const mostActiveUsersResult = await clickhouse.query({
      query: `
        SELECT 
          userId,
          count(*) as activity_count,
          countIf(activityType = 'login') as login_count,
          countIf(activityType = 'download') as download_count,
          countIf(activityType = 'search') as search_count,
          countIf(activityType = 'view') as view_count,
          max(createdAt) as last_activity
        FROM ${DATABASE_NAME}.activities
        ${whereClause}
        GROUP BY userId
        ORDER BY activity_count DESC
        LIMIT 20
      `,
      format: 'JSONEachRow'
    });
    const mostActiveUsers = await mostActiveUsersResult.json();

    // Hourly activity patterns (what hours are most active)
    const hourlyPatternsResult = await clickhouse.query({
      query: `
        SELECT 
          toHour(createdAt) as hour,
          count(*) as activity_count,
          uniq(userId) as unique_users
        FROM ${DATABASE_NAME}.activities
        ${whereClause}
        GROUP BY hour
        ORDER BY hour ASC
      `,
      format: 'JSONEachRow'
    });
    const hourlyPatterns = await hourlyPatternsResult.json();

    return {
      activityByType,
      dailyActivity,
      mostActiveUsers,
      hourlyPatterns
    };
  } catch (error) {
    console.error('Error getting activity analytics:', error);
    throw error;
  }
};

/**
 * Get user activities for a specific user (faster than MySQL for large datasets)
 */
exports.getUserActivitiesFromClickHouse = async (userId, limit = 100, offset = 0) => {
  try {
    const result = await clickhouse.query({
      query: `
        SELECT 
          id,
          userId,
          activityType,
          details,
          ipAddress,
          userAgent,
          createdAt,
          updatedAt
        FROM ${DATABASE_NAME}.activities
        WHERE userId = ${parseInt(userId)}
        ORDER BY createdAt DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      format: 'JSONEachRow'
    });
    
    const activities = await result.json();
    return activities.map(activity => ({
      ...activity,
      details: activity.details ? JSON.parse(activity.details) : {}
    }));
  } catch (error) {
    console.error('Error getting user activities from ClickHouse:', error);
    throw error;
  }
};

/**
 * Get comprehensive dashboard metrics
 */
exports.getDashboardMetrics = async (filters = {}) => {
  try {
    const { startDate, endDate } = filters;
    
    let dateFilter = '';
    if (startDate) {
      dateFilter += ` AND createdAt >= '${startDate}'`;
    }
    if (endDate) {
      dateFilter += ` AND createdAt <= '${endDate}'`;
    }

    // Get user metrics
    const userMetricsResult = await clickhouse.query({
      query: `
        SELECT 
          count(*) as total_users,
          countIf(isActive = 1) as active_users,
          countIf(isVerified = 1) as verified_users,
          countIf(role = 'parent') as parent_users,
          countIf(role = 'kid') as kid_users,
          countIf(lastLogin IS NOT NULL AND dateDiff('day', lastLogin, now()) <= 7) as active_last_7_days
        FROM ${DATABASE_NAME}.users
        WHERE 1=1 ${dateFilter}
      `,
      format: 'JSONEachRow'
    });
    const userMetrics = await userMetricsResult.json();

    // Get subscription metrics
    const subscriptionMetricsResult = await clickhouse.query({
      query: `
        SELECT 
          count(*) as total_subscriptions,
          countIf(status = 'active') as active_subscriptions,
          countIf(status = 'expired') as expired_subscriptions,
          sum(subscriptionCost) as total_revenue,
          avg(subscriptionCost) as avg_subscription_cost
        FROM ${DATABASE_NAME}.subscriptions
        WHERE 1=1 ${dateFilter.replace('createdAt', 'startDate')}
      `,
      format: 'JSONEachRow'
    });
    const subscriptionMetrics = await subscriptionMetricsResult.json();

    // Get activity metrics
    const activityMetricsResult = await clickhouse.query({
      query: `
        SELECT 
          count(*) as total_activities,
          uniq(userId) as unique_active_users,
          countIf(activityType = 'login') as total_logins,
          countIf(activityType = 'download') as total_downloads,
          countIf(activityType = 'search') as total_searches,
          countIf(activityType = 'view') as total_views
        FROM ${DATABASE_NAME}.activities
        WHERE 1=1 ${dateFilter}
      `,
      format: 'JSONEachRow'
    });
    const activityMetrics = await activityMetricsResult.json();

    return {
      users: userMetrics[0] || {},
      subscriptions: subscriptionMetrics[0] || {},
      activities: activityMetrics[0] || {}
    };
  } catch (error) {
    console.error('Error getting dashboard metrics:', error);
    throw error;
  }
};

/**
 * Get subscription churn analysis
 */
exports.getChurnAnalysis = async (months = 12) => {
  try {
    const result = await clickhouse.query({
      query: `
        WITH monthly_data AS (
          SELECT 
            toYYYYMM(startDate) as month,
            count(*) as new_subscriptions,
            countIf(status = 'cancelled' OR status = 'expired') as churned_subscriptions,
            sum(subscriptionCost) as revenue
          FROM ${DATABASE_NAME}.subscriptions
          WHERE startDate >= subtractMonths(now(), ${months})
          GROUP BY month
        )
        SELECT 
          month,
          new_subscriptions,
          churned_subscriptions,
          if(new_subscriptions > 0, (churned_subscriptions * 100.0 / new_subscriptions), 0) as churn_rate,
          revenue
        FROM monthly_data
        ORDER BY month DESC
      `,
      format: 'JSONEachRow'
    });
    
    return await result.json();
  } catch (error) {
    console.error('Error getting churn analysis:', error);
    throw error;
  }
};

/**
 * Get user engagement score
 */
exports.getUserEngagementScores = async (limit = 100) => {
  try {
    const result = await clickhouse.query({
      query: `
        SELECT 
          userId,
          count(*) as total_activities,
          countIf(activityType = 'login') as logins,
          countIf(activityType = 'download') as downloads,
          countIf(activityType = 'search') as searches,
          countIf(activityType = 'view') as views,
          dateDiff('day', min(createdAt), max(createdAt)) as active_days,
          max(createdAt) as last_activity,
          -- Engagement score: weighted sum of activities
          (countIf(activityType = 'login') * 1 +
           countIf(activityType = 'download') * 5 +
           countIf(activityType = 'search') * 2 +
           countIf(activityType = 'view') * 1) as engagement_score
        FROM ${DATABASE_NAME}.activities
        WHERE createdAt >= subtractMonths(now(), 3)
        GROUP BY userId
        ORDER BY engagement_score DESC
        LIMIT ${limit}
      `,
      format: 'JSONEachRow'
    });
    
    return await result.json();
  } catch (error) {
    console.error('Error getting user engagement scores:', error);
    throw error;
  }
};

module.exports = exports;





