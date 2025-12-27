const { clickhouse } = require('../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'subscriptions';

/**
 * ClickHouse Subscription Service
 * Handles all subscription-related operations using ClickHouse instead of MySQL
 */

/**
 * Helper function to calculate notification dates
 */
const calculateNotificationDates = (endDate, subscriptionDuration) => {
  const notificationDate = new Date(endDate);
  if (subscriptionDuration >= 3) {
    notificationDate.setMonth(notificationDate.getMonth() - 1); // 1 month before
  } else {
    notificationDate.setDate(notificationDate.getDate() - 15); // 15 days before
  }
  return notificationDate.toISOString().slice(0, 19).replace('T', ' ');
};

/**
 * Get all subscriptions with optional filters
 */
const getAllSubscriptions = async (filters = {}) => {
  try {
    let whereConditions = [];
    
    if (filters.clientName) {
      whereConditions.push(`clientName ILIKE '%${filters.clientName}%'`);
    }
    if (filters.contactPerson) {
      whereConditions.push(`contactPerson ILIKE '%${filters.contactPerson}%'`);
    }
    if (filters.email) {
      whereConditions.push(`email ILIKE '%${filters.email}%'`);
    }
    if (filters.status) {
      whereConditions.push(`status = '${filters.status}'`);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const result = await clickhouse.query({
      query: `
        SELECT *
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        ${whereClause}
        ORDER BY updatedAt DESC, createdAt DESC
      `,
      format: 'JSONEachRow'
    });

    return await result.json();
  } catch (error) {
    console.error('Error getting all subscriptions:', error);
    throw error;
  }
};

/**
 * Get subscription by ID
 */
const getSubscriptionById = async (subscriptionId) => {
  try {
    const result = await clickhouse.query({
      query: `
        SELECT *
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        WHERE id = ${subscriptionId}
        ORDER BY updatedAt DESC, createdAt DESC
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });

    const subscriptions = await result.json();
    return subscriptions.length > 0 ? subscriptions[0] : null;
  } catch (error) {
    console.error('Error getting subscription by ID:', error);
    throw error;
  }
};

/**
 * Create a new subscription
 */
const createSubscription = async (subscriptionData) => {
  try {
    const {
      companyId,
      subscriptionExport,
      subscriptionImport,
      dataTypeRaw,
      dataTypeClean,
      chapterNumber,
      productCount,
      productlimit,
      subscribedDurationDownload,
      subscribedDurationView,
      accessValidity,
      viewStartDate,
      viewEndDate,
      downloadStartDate,
      downloadEndDate,
      subscriptionCost,
      paymentMethod,
      paymentId,
      autoRenew
    } = subscriptionData;

    // Calculate dates
    const startDate = new Date();
    const endDate = new Date();
    if (subscribedDurationDownload) {
      endDate.setMonth(endDate.getMonth() + subscribedDurationDownload);
    }

    // Calculate notification dates
    const subscriptionExpiryNotification = calculateNotificationDates(endDate, subscribedDurationDownload);
    const accessExpiryNotification = calculateNotificationDates(endDate, subscribedDurationView);

    // Get next ID
    const maxIdResult = await clickhouse.query({
      query: `SELECT max(id) as maxId FROM ${DATABASE_NAME}.${TABLE_NAME}`,
      format: 'JSONEachRow'
    });
    const maxIdData = await maxIdResult.json();
    const nextId = (maxIdData[0]?.maxId || 0) + 1;

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const startDateStr = startDate.toISOString().slice(0, 19).replace('T', ' ');
    const endDateStr = endDate.toISOString().slice(0, 19).replace('T', ' ');
    const accessValidityStr = accessValidity 
      ? new Date(accessValidity).toISOString().slice(0, 19).replace('T', ' ')
      : endDateStr;

    // Calculate date ranges if not provided
    const viewStart = viewStartDate ? new Date(viewStartDate).toISOString().slice(0, 19).replace('T', ' ') : startDateStr;
    const viewEnd = viewEndDate ? new Date(viewEndDate).toISOString().slice(0, 19).replace('T', ' ') : endDateStr;
    const downloadStart = downloadStartDate ? new Date(downloadStartDate).toISOString().slice(0, 19).replace('T', ' ') : startDateStr;
    const downloadEnd = downloadEndDate ? new Date(downloadEndDate).toISOString().slice(0, 19).replace('T', ' ') : endDateStr;

    // Insert subscription
    await clickhouse.insert({
      table: `${DATABASE_NAME}.${TABLE_NAME}`,
      values: [{
        id: nextId,
        companyId: companyId || 0,
        subscriptionExport: subscriptionExport ? 1 : 0,
        subscriptionImport: subscriptionImport ? 1 : 0,
        dataTypeRaw: dataTypeRaw ? 1 : 0,
        dataTypeClean: dataTypeClean ? 1 : 0,
        chapterNumber: Array.isArray(chapterNumber) ? JSON.stringify(chapterNumber) : (typeof chapterNumber === 'string' ? chapterNumber : '[]'),
        productCount: productCount || 0,
        productlimit: productlimit || 0,
        subscribedDurationDownload: subscribedDurationDownload || 0,
        subscribedDurationView: subscribedDurationView || 0,
        accessValidity: accessValidityStr,
        viewStartDate: viewStart,
        viewEndDate: viewEnd,
        downloadStartDate: downloadStart,
        downloadEndDate: downloadEnd,
        subscriptionExpiryNotification: subscriptionExpiryNotification || '',
        accessExpiryNotification: accessExpiryNotification || '',
        subscriptionCost: subscriptionCost || 0,
        status: 'active',
        startDate: startDateStr,
        endDate: endDateStr,
        paymentMethod: paymentMethod || '',
        paymentId: paymentId || '',
        autoRenew: autoRenew ? 1 : 0,
        createdAt: now,
        updatedAt: now
      }],
      format: 'JSONEachRow'
    });

    return {
      id: nextId,
      clientName,
      contactPerson,
      email,
      status: 'active',
      startDate: startDateStr,
      endDate: endDateStr
    };
  } catch (error) {
    console.error('Error creating subscription:', error);
    throw error;
  }
};

/**
 * Update subscription
 */
const updateSubscription = async (subscriptionId, updateData) => {
  try {
    const subscription = await getSubscriptionById(subscriptionId);
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Calculate new end date if duration is updated
    let endDate = subscription.endDate;
    if (updateData.subscribedDurationDownload) {
      endDate = new Date(subscription.startDate);
      endDate.setMonth(endDate.getMonth() + updateData.subscribedDurationDownload);
    }

    // Recalculate notification dates
    const subscriptionExpiryNotification = calculateNotificationDates(
      endDate, 
      updateData.subscribedDurationDownload || subscription.subscribedDurationDownload
    );
    const accessExpiryNotification = calculateNotificationDates(
      endDate, 
      updateData.subscribedDurationView || subscription.subscribedDurationView
    );

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const endDateStr = typeof endDate === 'string' ? endDate : endDate.toISOString().slice(0, 19).replace('T', ' ');

    // Prepare updated data
    const updatedSubscription = {
      ...subscription,
      clientName: updateData.clientName || subscription.clientName,
      contactPerson: updateData.contactPerson || subscription.contactPerson,
      email: updateData.email || subscription.email,
      subscriptionExport: updateData.subscriptionExport !== undefined ? (updateData.subscriptionExport ? 1 : 0) : subscription.subscriptionExport,
      subscriptionImport: updateData.subscriptionImport !== undefined ? (updateData.subscriptionImport ? 1 : 0) : subscription.subscriptionImport,
      dataTypeRaw: updateData.dataTypeRaw !== undefined ? (updateData.dataTypeRaw ? 1 : 0) : subscription.dataTypeRaw,
      dataTypeClean: updateData.dataTypeClean !== undefined ? (updateData.dataTypeClean ? 1 : 0) : subscription.dataTypeClean,
      chapterNumber: updateData.chapterNumber ? (Array.isArray(updateData.chapterNumber) ? updateData.chapterNumber.join(',') : updateData.chapterNumber) : subscription.chapterNumber,
      productCount: updateData.productCount || subscription.productCount,
      productlimit: updateData.productlimit || subscription.productlimit,
      subscribedDurationDownload: updateData.subscribedDurationDownload || subscription.subscribedDurationDownload,
      subscribedDurationView: updateData.subscribedDurationView || subscription.subscribedDurationView,
      subscriptionCost: updateData.subscriptionCost || subscription.subscriptionCost,
      endDate: endDateStr,
      accessValidity: endDateStr,
      subscriptionExpiryNotification: subscriptionExpiryNotification,
      accessExpiryNotification: accessExpiryNotification,
      paymentMethod: updateData.paymentMethod || subscription.paymentMethod,
      paymentId: updateData.paymentId || subscription.paymentId,
      autoRenew: updateData.autoRenew !== undefined ? (updateData.autoRenew ? 1 : 0) : subscription.autoRenew,
      status: updateData.status || subscription.status,
      updatedAt: now
    };

    // Check if status is being updated (status is in ORDER BY, so we need delete-then-insert)
    const isStatusUpdate = updateData.status && updateData.status !== subscription.status;
    
    if (isStatusUpdate) {
      // If status is being updated, use delete-then-insert pattern
      // Delete old records for this subscription
      await clickhouse.command({
        query: `
          ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME}
          DELETE WHERE id = ${subscriptionId}
        `
      });

      // Insert updated record
      await clickhouse.insert({
        table: `${DATABASE_NAME}.${TABLE_NAME}`,
        values: [updatedSubscription],
        format: 'JSONEachRow'
      });
    } else {
      // Build UPDATE statement dynamically (excluding status if it's not changing)
      const updateFields = [];
      Object.keys(updatedSubscription).forEach(key => {
        if (key !== 'id' && key !== 'createdAt' && key !== 'status') {
          const value = updatedSubscription[key];
          if (value === null || value === undefined) {
            updateFields.push(`${key} = NULL`);
          } else if (typeof value === 'string') {
            updateFields.push(`${key} = '${value.replace(/'/g, "''")}'`);
          } else if (typeof value === 'boolean') {
            updateFields.push(`${key} = ${value ? 1 : 0}`);
          } else {
            updateFields.push(`${key} = ${value}`);
          }
        }
      });

      // Update subscription record using ALTER TABLE UPDATE (status not included)
      if (updateFields.length > 0) {
        await clickhouse.command({
          query: `
            ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME}
            UPDATE ${updateFields.join(', ')}
            WHERE id = ${subscriptionId}
          `
        });
      }
    }

    return updatedSubscription;
  } catch (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }
};

/**
 * Delete subscription (mark as cancelled)
 */
const deleteSubscription = async (subscriptionId) => {
  try {
    const subscription = await getSubscriptionById(subscriptionId);
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Check if any users are using this subscription
    const usersResult = await clickhouse.query({
      query: `
        SELECT count(*) as count
        FROM ${DATABASE_NAME}.users
        WHERE subscriptionId = ${subscriptionId}
      `,
      format: 'JSONEachRow'
    });

    const usersData = await usersResult.json();
    const userCount = usersData[0]?.count || 0;

    if (userCount > 0) {
      throw new Error(`Cannot delete subscription. It is currently used by ${userCount} users.`);
    }

    // Mark as cancelled
    // Note: Since 'status' is in the ORDER BY (primary key), we can't use ALTER TABLE UPDATE
    // We need to use delete-then-insert pattern for status updates
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    // Delete old records for this subscription
    await clickhouse.command({
      query: `
        ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME}
        DELETE WHERE id = ${subscriptionId}
      `
    });

    // Insert updated record with cancelled status
    await clickhouse.insert({
      table: `${DATABASE_NAME}.${TABLE_NAME}`,
      values: [{
        ...subscription,
        status: 'cancelled',
        updatedAt: now
      }],
      format: 'JSONEachRow'
    });

    return { success: true, message: 'Subscription cancelled successfully' };
  } catch (error) {
    console.error('Error deleting subscription:', error);
    throw error;
  }
};

/**
 * Assign subscription to user
 */
const assignSubscription = async (userId, subscriptionId) => {
  try {
    // Check if subscription exists
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Get user
    const userResult = await clickhouse.query({
      query: `
        SELECT *
        FROM ${DATABASE_NAME}.users
        WHERE id = ${userId}
        ORDER BY updatedAt DESC, createdAt DESC
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });

    const users = await userResult.json();
    if (users.length === 0) {
      throw new Error('User not found');
    }

    const user = users[0];

    // Check if user is a parent user
    if (user.role !== 'parent') {
      throw new Error('Only parent users can be assigned subscriptions');
    }

    // Update user with subscription ID using ALTER TABLE UPDATE
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    await clickhouse.command({
      query: `
        ALTER TABLE ${DATABASE_NAME}.users
        UPDATE 
          subscriptionId = ${subscriptionId},
          updatedAt = '${now.replace(/'/g, "''")}'
        WHERE id = '${userId.replace(/'/g, "''")}'
      `
    });

    return {
      userId: user.id,
      subscriptionId: subscription.id,
      message: 'Subscription assigned successfully'
    };
  } catch (error) {
    console.error('Error assigning subscription:', error);
    throw error;
  }
};

/**
 * Get user's subscription
 */
const getUserSubscription = async (userId) => {
  try {
    const result = await clickhouse.query({
      query: `
        SELECT u.subscriptionId, s.*
        FROM ${DATABASE_NAME}.users u
        LEFT JOIN ${DATABASE_NAME}.subscriptions s ON u.subscriptionId = s.id
        WHERE u.id = ${userId}
        ORDER BY u.updatedAt DESC, u.createdAt DESC
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });

    const data = await result.json();
    return data.length > 0 && data[0].subscriptionId ? data[0] : null;
  } catch (error) {
    console.error('Error getting user subscription:', error);
    throw error;
  }
};

/**
 * Get active subscription by company ID
 * Used by authentication middleware to check subscription status
 */
const getActiveSubscriptionByCompanyId = async (companyId) => {
  try {
    if (!companyId) {
      return null;
    }

    const result = await clickhouse.query({
      query: `
        SELECT *
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        WHERE companyId = ${companyId}
        AND status = 'active'
        ORDER BY updatedAt DESC, createdAt DESC
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });

    const subscriptions = await result.json();
    return subscriptions.length > 0 ? subscriptions[0] : null;
  } catch (error) {
    console.error('Error getting active subscription for company:', error);
    throw error;
  }
};

/**
 * Get active subscription by user ID (for backward compatibility)
 * Gets user's company and returns company's subscription
 */
const getActiveSubscriptionByUserId = async (userId) => {
  try {
    // Get user's company
    const userResult = await clickhouse.query({
      query: `
        SELECT companyId FROM ${DATABASE_NAME}.users
        WHERE id = '${userId}' OR userId = '${userId}'
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });
    const users = await userResult.json();
    
    if (users.length === 0 || !users[0].companyId) {
      return null;
    }

    return await getActiveSubscriptionByCompanyId(users[0].companyId);
  } catch (error) {
    console.error('Error getting active subscription for user:', error);
    throw error;
  }
};

module.exports = {
  getAllSubscriptions,
  getSubscriptionById,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  assignSubscription,
  getUserSubscription,
  getActiveSubscriptionByUserId,
  getActiveSubscriptionByCompanyId
};




