const clickhouseSubscriptionService = require('../services/clickhouseSubscriptionService');

exports.getAllSubscriptions = async (req, res) => {
  try {
    const { clientName, contactPerson, email } = req.query;
    
    const subscriptions = await clickhouseSubscriptionService.getAllSubscriptions({
      clientName,
      contactPerson,
      email
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
  try {
    const subscription = await clickhouseSubscriptionService.getSubscriptionById(req.params.id);
    
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
      productlimit,
      subscribedDurationDownload,
      subscribedDurationView,
      accessValidity,
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
    
    const subscription = await clickhouseSubscriptionService.createSubscription({
      clientName,
      contactPerson,
      email,
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
      subscriptionCost,
      paymentMethod,
      paymentId,
      autoRenew
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
      productlimit,
      subscribedDurationDownload,
      subscribedDurationView,
      subscriptionCost,
      paymentMethod,
      paymentId,
      autoRenew,
      status
    } = req.body;
    
    // Validate chapterNumber is an array if provided
    if (chapterNumber && !Array.isArray(chapterNumber)) {
      return res.status(400).json({
        statusCode: 400,
        message: 'chapterNumber must be an array of numbers'
      });
    }
    
    const subscription = await clickhouseSubscriptionService.updateSubscription(req.params.id, {
      clientName,
      contactPerson,
      email,
      subscriptionExport,
      subscriptionImport,
      dataTypeRaw,
      dataTypeClean,
      chapterNumber,
      productCount,
      productlimit,
      subscribedDurationDownload,
      subscribedDurationView,
      subscriptionCost,
      paymentMethod,
      paymentId,
      autoRenew,
      status
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
  try {
    const result = await clickhouseSubscriptionService.deleteSubscription(req.params.id);
    
    res.status(200).json({
      statusCode: 200,
      message: result.message
    });
  } catch (err) {
    console.error('Error deleting subscription:', err);
    const statusCode = err.message.includes('not found') ? 404 : 
                      err.message.includes('currently used') ? 400 : 500;
    res.status(statusCode).json({ 
      statusCode,
      error: err.message 
    });
  }
};

exports.assignSubscription = async (req, res) => {
  try {
    const { userId, subscriptionId } = req.body;
    
    const result = await clickhouseSubscriptionService.assignSubscription(userId, subscriptionId);
    
    res.status(200).json({
      statusCode: 200,
      message: result.message,
      data: {
        userId: result.userId,
        subscriptionId: result.subscriptionId
      }
    });
  } catch (err) {
    console.error('Error assigning subscription:', err);
    const statusCode = err.message.includes('not found') ? 404 : 
                      err.message.includes('Only parent') ? 400 : 500;
    res.status(statusCode).json({ 
      statusCode,
      error: err.message 
    });
  }
};

exports.getUserSubscription = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    
    const subscription = await clickhouseSubscriptionService.getUserSubscription(userId);
    
    if (!subscription) {
      return res.status(404).json({
        statusCode: 404,
        message: 'User does not have an active subscription'
      });
    }
    
    // Check if requesting user is authorized to view this information
    // Note: Authorization checks should ideally be in middleware
    
    res.status(200).json({
      statusCode: 200,
      data: subscription
    });
  } catch (err) {
    console.error('Error fetching user subscription:', err);
    res.status(500).json({ error: err.message });
  }
}; 