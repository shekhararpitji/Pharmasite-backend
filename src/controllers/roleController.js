const db = require("../config/db");
const jwt = require('jsonwebtoken');

const { validateToken } = require("../utils/authUtil");
const { sendAccountCreationNotification, sendAccessUpdateNotification } = require('../utils/emailUtil');

// Use ClickHouse services instead of MySQL
const clickhouseUserService = require('../services/clickhouseUserService');

exports.registerCtrl = async (req, res) => {
  try {
    const user = await clickhouseUserService.createUser(req.body, req.user.id);
    // await sendAccountCreationNotification(user.email, req.user.name, user.role);
    
    return res.status(201).json({
      statusCode: 201,
      message: `${user.role} account created successfully. Verification email sent.`,
      data: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
};

exports.createChildUserCtrl = async (req, res) => {
  try {
    const userData = {
      ...req.body,
      role: 'kid',
      parentId: req.user.id,
      partyName: req.user.partyName
    };

    const user = await clickhouseUserService.createUser(userData, req.user.id);
    // await sendAccountCreationNotification(user.email, req.user.name, user.role);
    
    return res.status(201).json({
      statusCode: 201,
      message: 'Child account created successfully. Verification email sent.',
      data: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
};

exports.getChildUsersCtrl = async (req, res) => {
  try {
    const users = await clickhouseUserService.getAllUsers({
      parentId: req.user.id,
      role: 'kid'
    });
    
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
};

exports.updateChildUserCtrl = async (req, res) => {
  try {
    const childUser = await clickhouseUserService.getUserById(req.params.id);

    if (!childUser || childUser.parentId !== req.user.id || childUser.role !== 'kid') {
      return res.status(404).json({
        statusCode: 404,
        message: 'Child user not found'
      });
    }

    const updatedUser = await clickhouseUserService.updateUser(req.params.id, req.body);
    
    return res.status(200).json({
      statusCode: 200,
      message: 'Child user updated successfully',
      data: updatedUser
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
};

exports.deleteChildUserCtrl = async (req, res) => {
  try {
    const childUser = await clickhouseUserService.getUserById(req.params.id);

    if (!childUser || childUser.parentId !== req.user.id || childUser.role !== 'kid') {
      return res.status(404).json({
        statusCode: 404,
        message: 'Child user not found'
      });
    }

    await clickhouseUserService.deleteUser(req.params.id);
    
    return res.status(200).json({
      statusCode: 200,
      message: 'Child user deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
};

exports.verifyEmailCtrl = async (req, res) => {
  try {
    const user = await clickhouseUserService.verifyEmail(req.query.token);
    return res.status(200).json({
      statusCode: 200,
      message: 'Email verified successfully'
    });
  } catch (error) {
    return res.status(400).json({
      statusCode: 400,
      message: error.message
    });
  }
};

exports.loginCtrl = async (req, res) => {
  try {
    const { user, access_token, sessionId } = await clickhouseUserService.login(
      req.body.email,
      req.body.password,
      req.ip,
      req.headers['user-agent']
    );
    return res.status(200).json({
      statusCode: 200,
      message: 'Login successful',
      data: {
        token: access_token,
        sessionId,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          partyName: user.partyName
        }
      }
    });
  } catch (error) {
    const statusCode = error.message === 'User not found' ? 404 :
                      error.message === 'Invalid password' ? 401 :
                      error.message.includes('verify') ? 403 : 500;
    
    return res.status(statusCode).json({
      statusCode,
      message: error.message
    });
  }
};

exports.getUserActivitiesCtrl = async (req, res) => {
  try {
    const activities = await clickhouseUserService.getUserActivities(req.params.userId, req.user.id);
    return res.status(200).json({
      statusCode: 200,
      data: activities
    });
  } catch (error) {
    return res.status(403).json({
      statusCode: 403,
      message: error.message
    });
  }
};

exports.getAllCtrl = async (req, res) => {
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
};

exports.getDecodedUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        statusCode: 401,
        message: 'Authentication required. Please log in.'
      });
    }
    
    const decoded = jwt.verify(token, process.env.SECRET);
    
    // Get the latest user data from database
    const user = await clickhouseUserService.getUserById(decoded.id);
    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message: 'User data retrieved successfully',
      data: {
        token,
        sessionId: decoded.sessionId,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          partyName: user.partyName
        }
      }
    });
  } catch (error) {
    return res.status(401).json({
      statusCode: 401,
      message: 'Invalid or expired token'
    });
  }
};

exports.updateUserAccessCtrl = async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await clickhouseUserService.updateUserAccess(req.params.id, isActive);
    // await sendAccessUpdateNotification(user.email, isActive);
    
    return res.status(200).json({
      statusCode: 200,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
};

exports.exportUserDataCtrl = async (req, res) => {
  try {
    const data = await clickhouseUserService.exportUserData(req.query);
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
    
    // Convert data to CSV
    const csv = [
      // Headers
      ['ID', 'Party Name', 'Name', 'Email', 'Mobile', 'Role', 'Parent ID', 'Created By', 'Verified', 'Active', 'Created At', 'Last Login'].join(','),
      // Data rows
      ...data.map(user => [
        user.id,
        user.partyName || '',
        user.name,
        user.email,
        user.mobileNumber || '',
        user.role,
        user.parentId || '',
        user.createdBy || '',
        user.isVerified,
        user.isActive,
        user.createdAt,
        user.lastLogin
      ].join(','))
    ].join('\n');
    
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
};

exports.get1Ctrl = async (req, res) => {
  try {
    const user = await clickhouseUserService.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.deleteCtrl = async (req, res) => {
  try {
    await clickhouseUserService.deleteUser(req.params.id);
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
};