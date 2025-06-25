const SubscriptionModel = require('../models/subscription.model');
const UserModel = require('../models/user.model');
const { Op } = require('sequelize');

// Check if we have proper database access before exposing functionality
let hasDbPermissions = true;

// Test database permissions
(async () => {
  try {
    await SubscriptionModel.findOne();
  } catch (error) {
    console.warn('Subscription functionality is limited due to database permissions:', error.message);
    hasDbPermissions = false;
  }
})();

// Helper function to check DB access
const checkDbAccess = (res) => {
  if (!hasDbPermissions) {
    res.status(503).json({
      statusCode: 503,
      message: "This functionality is unavailable due to database permission restrictions. Please contact your administrator."
    });
    return false;
  }
  return true;
};

// Helper function to calculate notification dates
const calculateNotificationDates = (endDate, subscriptionDuration) => {
  const notificationDate = new Date(endDate);
  if (subscriptionDuration >= 3) {
    notificationDate.setMonth(notificationDate.getMonth() - 1); // 1 month before
  } else {
    notificationDate.setDate(notificationDate.getDate() - 15); // 15 days before
  }
  return notificationDate.toString();
};

exports.getAllSubscriptions = async (req, res) => {
  if (!checkDbAccess(res)) return;
  
  try {
    const { clientName, contactPerson, email } = req.query;
    const whereClause = {};
    
    if (clientName) whereClause.clientName = { [Op.like]: `%${clientName}%` };
    if (contactPerson) whereClause.contactPerson = { [Op.like]: `%${contactPerson}%` };
    if (email) whereClause.email = { [Op.like]: `%${email}%` };
    
    const subscriptions = await SubscriptionModel.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });
    
    res.status(200).json({
      statusCode: 200,
      data: subscriptions
    });
  } catch (err) {
    console.error('Error fetching subscriptions:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getSubscription = async (req, res) => {
  if (!checkDbAccess(res)) return;
  
  try {
    const subscription = await SubscriptionModel.findByPk(req.params.id);
    
    if (!subscription) {
      return res.status(404).json({
        statusCode: 404,
        message: 'Subscription not found'
      });
    }
    
    res.status(200).json({
      statusCode: 200,
      data: subscription
    });
  } catch (err) {
    console.error('Error fetching subscription:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.createSubscription = async (req, res) => {
  if (!checkDbAccess(res)) return;
  
  try {
    const {
      clientName,
      contactPerson,
      email,
      subscriptionExport,
      subscriptionImport,
      dataTypeRaw,
      dataTypeClean,
      chapterNumber,
      productCount,
      subscribedDurationDownload,
      subscribedDurationView,
      subscriptionCost,
      paymentMethod,
      paymentId,
      autoRenew
    } = req.body;
    
    // Validate chapterNumber is an array
    if (chapterNumber && !Array.isArray(chapterNumber)) {
      return res.status(400).json({
        statusCode: 400,
        message: 'chapterNumber must be an array of numbers'
      });
    }
    
    // Calculate end date based on subscription duration
    const startDate = new Date();
    const endDate = new Date();
    if (subscribedDurationDownload) {
      endDate.setMonth(endDate.getMonth() + subscribedDurationDownload);
    }
    
    // Calculate notification dates
    const subscriptionExpiryNotification = calculateNotificationDates(endDate, subscribedDurationDownload);
    const accessExpiryNotification = calculateNotificationDates(endDate, subscribedDurationView);
    
    const subscription = await SubscriptionModel.create({
      clientName,
      contactPerson,
      email,
      subscriptionExport,
      subscriptionImport,
      dataTypeRaw,
      dataTypeClean,
      chapterNumber,
      productCount,
      subscribedDurationDownload,
      subscribedDurationView,
      subscriptionCost,
      startDate,
      endDate,
      accessValidity: endDate,
      subscriptionExpiryNotification,
      accessExpiryNotification,
      paymentMethod,
      paymentId,
      autoRenew,
      status: 'active'
    });
    
    res.status(201).json({
      statusCode: 201,
      message: 'Subscription created successfully',
      data: subscription
    });
  } catch (err) {
    console.error('Error creating subscription:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateSubscription = async (req, res) => {
  if (!checkDbAccess(res)) return;
  
  try {
    const subscription = await SubscriptionModel.findByPk(req.params.id);
    
    if (!subscription) {
      return res.status(404).json({
        statusCode: 404,
        message: 'Subscription not found'
      });
    }
    
    const {
      clientName,
      contactPerson,
      email,
      subscriptionExport,
      subscriptionImport,
      dataTypeRaw,
      dataTypeClean,
      chapterNumber,
      productCount,
      subscribedDurationDownload,
      subscribedDurationView,
      subscriptionCost,
      paymentMethod,
      paymentId,
      autoRenew
    } = req.body;
    
    // Validate chapterNumber is an array if provided
    if (chapterNumber && !Array.isArray(chapterNumber)) {
      return res.status(400).json({
        statusCode: 400,
        message: 'chapterNumber must be an array of numbers'
      });
    }
    
    // Calculate new end date if duration is updated
    let endDate = subscription.endDate;
    if (subscribedDurationDownload) {
      endDate = new Date(subscription.startDate);
      endDate.setMonth(endDate.getMonth() + subscribedDurationDownload);
    }
    
    // Recalculate notification dates
    const subscriptionExpiryNotification = calculateNotificationDates(endDate, subscribedDurationDownload || subscription.subscribedDurationDownload);
    const accessExpiryNotification = calculateNotificationDates(endDate, subscribedDurationView || subscription.subscribedDurationView);
    
    await subscription.update({
      clientName: clientName || subscription.clientName,
      contactPerson: contactPerson || subscription.contactPerson,
      email: email || subscription.email,
      subscriptionExport: subscriptionExport !== undefined ? subscriptionExport : subscription.subscriptionExport,
      subscriptionImport: subscriptionImport !== undefined ? subscriptionImport : subscription.subscriptionImport,
      dataTypeRaw: dataTypeRaw !== undefined ? dataTypeRaw : subscription.dataTypeRaw,
      dataTypeClean: dataTypeClean !== undefined ? dataTypeClean : subscription.dataTypeClean,
      chapterNumber: chapterNumber || subscription.chapterNumber,
      productCount: productCount || subscription.productCount,
      subscribedDurationDownload: subscribedDurationDownload || subscription.subscribedDurationDownload,
      subscribedDurationView: subscribedDurationView || subscription.subscribedDurationView,
      subscriptionCost: subscriptionCost || subscription.subscriptionCost,
      endDate,
      accessValidity: endDate,
      subscriptionExpiryNotification,
      accessExpiryNotification,
      paymentMethod: paymentMethod || subscription.paymentMethod,
      paymentId: paymentId || subscription.paymentId,
      autoRenew: autoRenew !== undefined ? autoRenew : subscription.autoRenew
    });
    
    res.status(200).json({
      statusCode: 200,
      message: 'Subscription updated successfully',
      data: subscription
    });
  } catch (err) {
    console.error('Error updating subscription:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteSubscription = async (req, res) => {
  if (!checkDbAccess(res)) return;
  
  try {
    const subscription = await SubscriptionModel.findByPk(req.params.id);
    
    if (!subscription) {
      return res.status(404).json({
        statusCode: 404,
        message: 'Subscription not found'
      });
    }
    
    // Check if any users are using this subscription
    const usersWithSubscription = await UserModel.count({
      where: { subscriptionId: req.params.id }
    });
    
    if (usersWithSubscription > 0) {
      return res.status(400).json({
        statusCode: 400,
        message: `Cannot delete subscription. It is currently used by ${usersWithSubscription} users.`
      });
    }
    
    await subscription.destroy();
    
    res.status(200).json({
      statusCode: 200,
      message: 'Subscription deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting subscription:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.assignSubscription = async (req, res) => {
  if (!checkDbAccess(res)) return;
  
  try {
    const { userId, subscriptionId } = req.body;
    
    const user = await UserModel.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: 'User not found'
      });
    }
    
    const subscription = await SubscriptionModel.findByPk(subscriptionId);
    if (!subscription) {
      return res.status(404).json({
        statusCode: 404,
        message: 'Subscription not found'
      });
    }
    
    // Check if the user is a parent user
    if (user.role !== 'parent') {
      return res.status(400).json({
        statusCode: 400,
        message: 'Only parent users can be assigned subscriptions'
      });
    }
    
    // Update the user's subscription
    await user.update({ subscriptionId });
    
    res.status(200).json({
      statusCode: 200,
      message: 'Subscription assigned successfully',
      data: {
        userId: user.id,
        subscriptionId: subscription.id,
        subscriptionType: subscription.subscriptionType
      }
    });
  } catch (err) {
    console.error('Error assigning subscription:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getUserSubscription = async (req, res) => {
  if (!checkDbAccess(res)) return;
  
  try {
    const userId = req.params.userId || req.user.id;
    
    const user = await UserModel.findByPk(userId, {
      include: [{ model: SubscriptionModel }]
    });
    
    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: 'User not found'
      });
    }
    
    // Check if requesting user is authorized to view this information
    if (req.user.role !== 'admin' && req.user.id !== userId && 
        !(req.user.role === 'parent' && user.parentId === req.user.id)) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Unauthorized to view this subscription information'
      });
    }
    
    if (!user.Subscription) {
      return res.status(404).json({
        statusCode: 404,
        message: 'User does not have an active subscription'
      });
    }
    
    res.status(200).json({
      statusCode: 200,
      data: user.Subscription
    });
  } catch (err) {
    console.error('Error fetching user subscription:', err);
    res.status(500).json({ error: err.message });
  }
}; 