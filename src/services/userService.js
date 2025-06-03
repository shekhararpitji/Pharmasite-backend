const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createToken } = require('../utils/authUtil');
const UserModel = require('../models/user.model');
const ActivityModel = require('../models/activity.model');
const { sendVerificationEmail } = require('../utils/emailUtil');
const { Op } = require('sequelize');

// Helper function to generate verification token
const generateVerificationToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + 24); // Token valid for 24 hours
  return { token, expiry };
};

// Create user account (admin only)
exports.createUser = async (userData, adminId) => {
  const { email, mobileNumber, role } = userData;

  // Check if email or mobile already exists
  const existingUser = await UserModel.findOne({
    where: {
      [Op.or]: [{ email }, { mobileNumber }]
    }
  });

  if (existingUser) {
    throw new Error('User with this email or mobile number already exists');
  }

  // Generate verification token
  const { token, expiry } = generateVerificationToken();

  // Create user
  const user = await UserModel.create({
    ...userData,
    password: await bcrypt.hash(userData.password, 10),
    createdBy: adminId,
    verificationToken: token,
    verificationTokenExpiry: expiry
  });

  // Send verification email
  await sendVerificationEmail(user.email, token);

  return user;
};

// Verify user email
exports.verifyEmail = async (token) => {
  const user = await UserModel.findOne({
    where: {
      verificationToken: token,
      verificationTokenExpiry: { [Op.gt]: new Date() }
    }
  });

  if (!user) {
    throw new Error('Invalid or expired verification token');
  }

  await user.update({
    isVerified: true,
    verificationToken: null,
    verificationTokenExpiry: null
  });

  return user;
};

// Login user
exports.login = async (email, password, ipAddress, userAgent) => {
  const user = await UserModel.findOne({ where: { email } });

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.isVerified) {
    throw new Error('Please verify your email before logging in');
  }

  if (!user.isActive) {
    throw new Error('Your account has been deactivated');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new Error('Invalid password');
  }

  // Generate session token
  const sessionId = crypto.randomBytes(32).toString('hex');
  const access_token = createToken({ ...user.toJSON(), sessionId });

  // Update user session
  await user.update({
    sessionId,
    lastLogin: new Date()
  });

  // Log activity
  await ActivityModel.create({
    userId: user.id,
    activityType: 'login',
    ipAddress,
    userAgent
  });

  return { user, access_token, sessionId };
};

// Get user activities
exports.getUserActivities = async (userId, viewerId) => {
  const viewer = await UserModel.findByPk(viewerId);
  const targetUser = await UserModel.findByPk(userId);

  if (!targetUser) {
    throw new Error('User not found');
  }

  // Check permissions
  if (viewer.role !== 'admin' && 
      viewer.id !== userId && 
      !(viewer.role === 'parent' && targetUser.parentId === viewer.id)) {
    throw new Error('Unauthorized to view these activities');
  }

  return ActivityModel.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    include: [{
      model: UserModel,
      attributes: ['id', 'name', 'email', 'role']
    }]
  });
};

// Log activity
exports.logActivity = async (userId, activityType, details, ipAddress, userAgent) => {
  return ActivityModel.create({
    userId,
    activityType,
    details,
    ipAddress,
    userAgent
  });
};

// Get all users (admin only)
exports.getAllUsers = async (filters = {}) => {
  const whereClause = {};
  
  if (filters.role) whereClause.role = filters.role;
  if (filters.partyName) whereClause.partyName = { [Op.like]: `%${filters.partyName}%` };
  if (filters.isVerified !== undefined) whereClause.isVerified = filters.isVerified;
  if (filters.isActive !== undefined) whereClause.isActive = filters.isActive;

  return UserModel.findAll({
    where: whereClause,
    include: [
      {
        model: UserModel,
        as: 'parent',
        attributes: ['id', 'name', 'email']
      },
      {
        model: UserModel,
        as: 'creator',
        attributes: ['id', 'name', 'email']
      }
    ],
    order: [['createdAt', 'DESC']]
  });
};

// Update user access (admin only)
exports.updateUserAccess = async (userId, isActive) => {
  const user = await UserModel.findByPk(userId);
  if (!user) {
    throw new Error('User not found');
  }

  await user.update({ isActive });
  return user;
};

// Export user data (admin only)
exports.exportUserData = async (filters = {}) => {
  const users = await this.getAllUsers(filters);
  
  return users.map(user => ({
    id: user.id,
    partyName: user.partyName,
    name: user.name,
    email: user.email,
    mobileNumber: user.mobileNumber,
    role: user.role,
    parentName: user.parent?.name,
    parentEmail: user.parent?.email,
    createdBy: user.creator?.name,
    isVerified: user.isVerified,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin
  }));
}; 