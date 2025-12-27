const { clickhouse } = require('../config/clickhouse');
const clickhouseUserService = require('./clickhouseUserService');
const clickhouseSubscriptionService = require('./clickhouseSubscriptionService');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';

/**
 * Subscription Validation Service
 * Validates subscription access based on various rules
 */

/**
 * Get effective subscription for a user
 * For children, returns parent's company subscription
 */
const getEffectiveSubscription = async (user) => {
  try {
    let companyId = user.companyId;
    
    // If user is a child, get parent's company
    if (user.role === 'CHILD' || user.role === 'child' && user.parentId) {
      const parent = await clickhouseUserService.getUserById(user.parentId);
      if (parent) {
        companyId = parent.companyId;
      }
    }
    
    if (!companyId) {
      return null;
    }
    
    // Get company's active subscription
    const subscription = await clickhouseSubscriptionService.getActiveSubscriptionByCompanyId(companyId);
    return subscription;
  } catch (error) {
    console.error('Error getting effective subscription:', error);
    return null;
  }
};

/**
 * Check if subscription allows access to a chapter
 */
const checkChapterAccess = (subscription, chapterNumber) => {
  if (!subscription || !subscription.chapterNumber) {
    return false;
  }
  
  try {
    const chapters = typeof subscription.chapterNumber === 'string' 
      ? JSON.parse(subscription.chapterNumber) 
      : subscription.chapterNumber;
    
    if (!Array.isArray(chapters)) {
      return false;
    }
    
    return chapters.includes(chapterNumber.toString());
  } catch (error) {
    console.error('Error checking chapter access:', error);
    return false;
  }
};

/**
 * Check product count limit for CLEAN data
 */
const checkProductCountLimit = (subscription, requestedCount) => {
  if (!subscription) {
    return false;
  }
  
  const limit = subscription.productCount || subscription.productlimit || 0;
  return requestedCount <= limit;
};

/**
 * Check if date is within allowed window
 */
const checkDateWindow = (subscription, action, requestedDate) => {
  if (!subscription) {
    return false;
  }
  
  const now = new Date();
  const requestDate = requestedDate ? new Date(requestedDate) : now;
  
  if (action === 'view') {
    if (subscription.viewStartDate && requestDate < new Date(subscription.viewStartDate)) {
      return false;
    }
    if (subscription.viewEndDate && requestDate > new Date(subscription.viewEndDate)) {
      return false;
    }
  } else if (action === 'download') {
    if (subscription.downloadStartDate && requestDate < new Date(subscription.downloadStartDate)) {
      return false;
    }
    if (subscription.downloadEndDate && requestDate > new Date(subscription.downloadEndDate)) {
      return false;
    }
  }
  
  return true;
};

/**
 * Validate subscription access for data operations
 */
const validateSubscriptionAccess = async (user, dataType, tradeType, action, dateRange = null) => {
  try {
    // Admin bypasses all checks
    if (user.role === 'ADMIN' || user.role === 'admin') {
      return { allowed: true };
    }
    
    // Get effective subscription
    const subscription = await getEffectiveSubscription(user);
    
    if (!subscription) {
      return { 
        allowed: false, 
        reason: 'No active subscription found' 
      };
    }
    
    // Check subscription status
    if (subscription.status !== 'active') {
      return { 
        allowed: false, 
        reason: 'Subscription is not active' 
      };
    }
    
    // Check subscription expiry
    if (subscription.endDate && new Date() > new Date(subscription.endDate)) {
      return { 
        allowed: false, 
        reason: 'Subscription has expired' 
      };
    }
    
    if (subscription.accessValidity && new Date() > new Date(subscription.accessValidity)) {
      return { 
        allowed: false, 
        reason: 'Subscription access validity has expired' 
      };
    }
    
    // Check data type
    if (dataType === 'RAW' && !subscription.dataTypeRaw) {
      return { 
        allowed: false, 
        reason: 'Raw data access not allowed in subscription' 
      };
    }
    
    if (dataType === 'CLEAN' && !subscription.dataTypeClean) {
      return { 
        allowed: false, 
        reason: 'Clean data access not allowed in subscription' 
      };
    }
    
    // Check trade type
    if (tradeType === 'E' && !subscription.subscriptionExport) {
      return { 
        allowed: false, 
        reason: 'Export data access not allowed in subscription' 
      };
    }
    
    if (tradeType === 'I' && !subscription.subscriptionImport) {
      return { 
        allowed: false, 
        reason: 'Import data access not allowed in subscription' 
      };
    }
    
    // Check date window
    const requestedDate = dateRange?.startDate || dateRange?.date || new Date();
    if (!checkDateWindow(subscription, action, requestedDate)) {
      return { 
        allowed: false, 
        reason: `Date ${requestedDate} is outside the allowed ${action} window` 
      };
    }
    
    // Check chapter access if chapter is specified
    if (dateRange?.chapter) {
      if (!checkChapterAccess(subscription, dateRange.chapter)) {
        return { 
          allowed: false, 
          reason: `Chapter ${dateRange.chapter} is not allowed in subscription` 
        };
      }
    }
    
    // Check product count for CLEAN data
    if (dataType === 'CLEAN' && dateRange?.productCount) {
      if (!checkProductCountLimit(subscription, dateRange.productCount)) {
        return { 
          allowed: false, 
          reason: `Product count ${dateRange.productCount} exceeds subscription limit` 
        };
      }
    }
    
    return { allowed: true, subscription };
  } catch (error) {
    console.error('Error validating subscription access:', error);
    return { 
      allowed: false, 
      reason: 'Error validating subscription access' 
    };
  }
};

module.exports = {
  getEffectiveSubscription,
  checkChapterAccess,
  checkProductCountLimit,
  checkDateWindow,
  validateSubscriptionAccess
};

