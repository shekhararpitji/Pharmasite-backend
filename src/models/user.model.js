const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

/**
 * User Model - Core Authentication and User Management
 * 
 * This model handles three types of users:
 * 1. Admin - Full system access, can manage all users
 * 2. Parent - Company accounts with subscription management
 * 3. Kid - Child accounts under parent supervision
 * 
 * Features:
 * - Multi-tier user hierarchy
 * - Email verification system
 * - Session management
 * - Activity tracking
 * - Account status management
 */
const UserModel = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      unique: true,
      comment: 'Unique identifier for external references'
    },
    partyName: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Company/Organization name'
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'User full name'
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      },
      comment: 'User email address (must be unique)'
    },
    mobileNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      validate: {
        is: /^[0-9]{10}$/
      },
      comment: 'Indian mobile number (10 digits)'
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Hashed password using bcrypt'
    },
    role: {
      type: DataTypes.ENUM('admin', 'parent', 'kid'),
      allowNull: false,
      comment: 'User role: admin (full access), parent (company), kid (child account)'
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'For kid accounts - references parent user ID'
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'ID of the admin who created this account'
    },
    
    // Email verification fields
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Email verification status'
    },
    verificationToken: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Token for email verification'
    },
    verificationTokenExpiry: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Expiry time for verification token'
    },
    
    // Account status and session management
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Account activation status'
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last login timestamp'
    },
    sessionId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Current session identifier'
    }
},
{
  tableName: 'Users',
  timestamps: true,
  
  // Add indexes for performance optimization
  indexes: [
    {
      unique: true,
      fields: ['email']
    },
    {
      unique: true,
      fields: ['mobileNumber']
    },
    {
      fields: ['role']
    },
    {
      fields: ['parentId']
    },
    {
      fields: ['isActive']
    },
    {
      fields: ['isVerified']
    }
  ]
});

module.exports = UserModel;
