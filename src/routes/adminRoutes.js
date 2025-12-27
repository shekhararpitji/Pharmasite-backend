const express = require('express');
const router = express.Router();
const { isLogedIn, isAdmin, checkPermission } = require('../middlewares/roleMiddleware');
const clickhouseCompanyService = require('../services/clickhouseCompanyService');
const clickhouseUserService = require('../services/clickhouseUserService');
const clickhouseSubscriptionService = require('../services/clickhouseSubscriptionService');
const clickhouseRbacService = require('../services/clickhouseRbacService');

/**
 * Admin Routes - Full system access
 * All routes require admin authentication
 */

// Company Management
router.post('/companies', isLogedIn, isAdmin, async (req, res) => {
  try {
    const company = await clickhouseCompanyService.createCompany(req.body);
    return res.status(201).json({
      statusCode: 201,
      message: 'Company created successfully',
      data: company
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

router.get('/companies', isLogedIn, isAdmin, async (req, res) => {
  try {
    const companies = await clickhouseCompanyService.getAllCompanies(req.query);
    return res.status(200).json({
      statusCode: 200,
      data: companies
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

router.get('/companies/:id', isLogedIn, isAdmin, async (req, res) => {
  try {
    const company = await clickhouseCompanyService.getCompanyById(req.params.id);
    if (!company) {
      return res.status(404).json({
        statusCode: 404,
        message: 'Company not found'
      });
    }
    return res.status(200).json({
      statusCode: 200,
      data: company
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

router.put('/companies/:id', isLogedIn, isAdmin, async (req, res) => {
  try {
    const company = await clickhouseCompanyService.updateCompany(req.params.id, req.body);
    return res.status(200).json({
      statusCode: 200,
      message: 'Company updated successfully',
      data: company
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

// User Management
router.post('/users', isLogedIn, isAdmin, async (req, res) => {
  try {
    const user = await clickhouseUserService.createUser(req.body, req.user.id);
    return res.status(201).json({
      statusCode: 201,
      message: 'User created successfully',
      data: user
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

router.get('/users', isLogedIn, isAdmin, async (req, res) => {
  try {
    const users = await clickhouseUserService.getAllUsers(req.query);
    return res.status(200).json({
      statusCode: 200,
      data: users
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

// Subscription Management
router.post('/subscriptions', isLogedIn, isAdmin, async (req, res) => {
  try {
    const subscription = await clickhouseSubscriptionService.createSubscription(req.body);
    return res.status(201).json({
      statusCode: 201,
      message: 'Subscription created successfully',
      data: subscription
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

router.get('/subscriptions', isLogedIn, isAdmin, async (req, res) => {
  try {
    const subscriptions = await clickhouseSubscriptionService.getAllSubscriptions(req.query);
    return res.status(200).json({
      statusCode: 200,
      data: subscriptions
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

// Permission Management
router.get('/users/:userId/permissions', isLogedIn, isAdmin, async (req, res) => {
  try {
    const permissions = await clickhouseRbacService.getUserPermissions(req.params.userId);
    return res.status(200).json({
      statusCode: 200,
      data: permissions
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

router.post('/users/:userId/permissions', isLogedIn, isAdmin, async (req, res) => {
  try {
    const { permissionId, granted, notes } = req.body;
    if (granted) {
      await clickhouseRbacService.grantUserPermission(
        req.params.userId,
        permissionId,
        req.user.id,
        notes
      );
    } else {
      await clickhouseRbacService.revokeUserPermission(
        req.params.userId,
        permissionId
      );
    }
    return res.status(200).json({
      statusCode: 200,
      message: 'Permission updated successfully'
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

router.put('/users/:userId/permissions/:permissionId', isLogedIn, isAdmin, async (req, res) => {
  try {
    const { granted, notes } = req.body;
    if (granted) {
      await clickhouseRbacService.grantUserPermission(
        req.params.userId,
        req.params.permissionId,
        req.user.id,
        notes
      );
    } else {
      await clickhouseRbacService.revokeUserPermission(
        req.params.userId,
        req.params.permissionId
      );
    }
    return res.status(200).json({
      statusCode: 200,
      message: 'Permission updated successfully'
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

router.delete('/users/:userId/permissions/:permissionId', isLogedIn, isAdmin, async (req, res) => {
  try {
    await clickhouseRbacService.revokeUserPermission(
      req.params.userId,
      req.params.permissionId
    );
    return res.status(200).json({
      statusCode: 200,
      message: 'Permission revoked successfully'
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

// Get all permissions
router.get('/permissions', isLogedIn, isAdmin, async (req, res) => {
  try {
    const permissions = await clickhouseRbacService.getAllPermissions();
    return res.status(200).json({
      statusCode: 200,
      data: permissions
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

module.exports = router;

