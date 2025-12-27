const express = require('express');
const router = express.Router();
const { isLogedIn, isParent } = require('../middlewares/roleMiddleware');
const clickhouseUserService = require('../services/clickhouseUserService');
const clickhouseSubscriptionService = require('../services/clickhouseSubscriptionService');
const clickhouseRbacService = require('../services/clickhouseRbacService');

/**
 * Parent Routes - Company account management
 * Parents can manage their children and view their subscription
 */

// Child User Management
router.post('/children', isLogedIn, isParent, async (req, res) => {
  try {
    // Ensure child is created under this parent
    const childData = {
      ...req.body,
      role: 'CHILD',
      parentId: req.user.id || req.user.userId,
      companyId: req.user.companyId
    };
    const child = await clickhouseUserService.createUser(childData, req.user.id);
    return res.status(201).json({
      statusCode: 201,
      message: 'Child user created successfully',
      data: child
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

router.get('/children', isLogedIn, isParent, async (req, res) => {
  try {
    const parentId = req.user.id || req.user.userId;
    const children = await clickhouseUserService.getAllUsers({
      ...req.query,
      parentId,
      role: 'CHILD'
    });
    return res.status(200).json({
      statusCode: 200,
      data: children
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

router.put('/children/:id', isLogedIn, isParent, async (req, res) => {
  try {
    const parentId = req.user.id || req.user.userId;
    // Verify child belongs to this parent
    const child = await clickhouseUserService.getUserById(req.params.id);
    if (!child || child.parentId !== parentId) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied. Child does not belong to you.'
      });
    }
    
    const updated = await clickhouseUserService.updateUser(req.params.id, req.body);
    return res.status(200).json({
      statusCode: 200,
      message: 'Child user updated successfully',
      data: updated
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

// View own subscription
router.get('/subscription', isLogedIn, isParent, async (req, res) => {
  try {
    const companyId = req.user.companyId;
    if (!companyId) {
      return res.status(404).json({
        statusCode: 404,
        message: 'No company associated with your account'
      });
    }
    
    const subscription = await clickhouseSubscriptionService.getActiveSubscriptionByCompanyId(companyId);
    if (!subscription) {
      return res.status(404).json({
        statusCode: 404,
        message: 'No active subscription found'
      });
    }
    
    return res.status(200).json({
      statusCode: 200,
      data: subscription
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

// Child Permission Management
router.get('/children/:childId/permissions', isLogedIn, isParent, async (req, res) => {
  try {
    const parentId = req.user.id || req.user.userId;
    // Verify child belongs to this parent
    const child = await clickhouseUserService.getUserById(req.params.childId);
    if (!child || child.parentId !== parentId) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied. Child does not belong to you.'
      });
    }
    
    const permissions = await clickhouseRbacService.getUserPermissions(req.params.childId);
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

router.post('/children/:childId/permissions', isLogedIn, isParent, async (req, res) => {
  try {
    const parentId = req.user.id || req.user.userId;
    // Verify child belongs to this parent
    const child = await clickhouseUserService.getUserById(req.params.childId);
    if (!child || child.parentId !== parentId) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied. Child does not belong to you.'
      });
    }
    
    const { permissionId, granted, notes } = req.body;
    if (granted) {
      await clickhouseRbacService.grantUserPermission(
        req.params.childId,
        permissionId,
        parentId,
        notes
      );
    } else {
      await clickhouseRbacService.revokeUserPermission(
        req.params.childId,
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

router.post('/children/:childId/permissions/bulk', isLogedIn, isParent, async (req, res) => {
  try {
    const parentId = req.user.id || req.user.userId;
    // Verify child belongs to this parent
    const child = await clickhouseUserService.getUserById(req.params.childId);
    if (!child || child.parentId !== parentId) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied. Child does not belong to you.'
      });
    }
    
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Permissions must be an array'
      });
    }
    
    for (const perm of permissions) {
      if (perm.granted) {
        await clickhouseRbacService.grantUserPermission(
          req.params.childId,
          perm.permissionId,
          parentId,
          perm.notes
        );
      } else {
        await clickhouseRbacService.revokeUserPermission(
          req.params.childId,
          perm.permissionId
        );
      }
    }
    
    return res.status(200).json({
      statusCode: 200,
      message: 'Permissions updated successfully'
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
});

router.put('/children/:childId/permissions/:permissionId', isLogedIn, isParent, async (req, res) => {
  try {
    const parentId = req.user.id || req.user.userId;
    // Verify child belongs to this parent
    const child = await clickhouseUserService.getUserById(req.params.childId);
    if (!child || child.parentId !== parentId) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied. Child does not belong to you.'
      });
    }
    
    const { granted, notes } = req.body;
    if (granted) {
      await clickhouseRbacService.grantUserPermission(
        req.params.childId,
        req.params.permissionId,
        parentId,
        notes
      );
    } else {
      await clickhouseRbacService.revokeUserPermission(
        req.params.childId,
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

router.delete('/children/:childId/permissions/:permissionId', isLogedIn, isParent, async (req, res) => {
  try {
    const parentId = req.user.id || req.user.userId;
    // Verify child belongs to this parent
    const child = await clickhouseUserService.getUserById(req.params.childId);
    if (!child || child.parentId !== parentId) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied. Child does not belong to you.'
      });
    }
    
    await clickhouseRbacService.revokeUserPermission(
      req.params.childId,
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

module.exports = router;

