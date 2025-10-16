const { clickhouse } = require('../config/clickhouse');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'users';

/**
 * ClickHouse User Service
 * Handles all user-related operations using ClickHouse instead of MySQL
 */

/**
 * Create a new user in ClickHouse
 */
const createUser = async (userData, createdById) => {
  try {
    const {
      partyName,
      name,
      email,
      mobileNumber,
      password,
      role,
      parentId
    } = userData;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Generate unique user ID
    const userId = `USER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Get next ID
    const maxIdResult = await clickhouse.query({
      query: `SELECT max(id) as maxId FROM ${DATABASE_NAME}.${TABLE_NAME}`,
      format: 'JSONEachRow'
    });
    const maxIdData = await maxIdResult.json();
    const nextId = (maxIdData[0]?.maxId || 0) + 1;

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Insert user into ClickHouse
    await clickhouse.insert({
      table: `${DATABASE_NAME}.${TABLE_NAME}`,
      values: [{
        id: nextId,
        userId: userId,
        partyName: partyName || '',
        name: name,
        email: email,
        mobileNumber: mobileNumber || '',
        password: hashedPassword,
        role: role,
        parentId: parentId || 0,
        createdBy: createdById || 0,
        isVerified: 0,
        verificationToken: verificationToken,
        verificationTokenExpiry: verificationTokenExpiry.toISOString().slice(0, 19).replace('T', ' '),
        isActive: 1,
        lastLogin: '1970-01-01 00:00:00',
        sessionId: '',
        createdAt: now,
        updatedAt: now
      }],
      format: 'JSONEachRow'
    });

    return {
      id: nextId,
      userId,
      name,
      email,
      role,
      verificationToken
    };
  } catch (error) {
    console.error('Error creating user in ClickHouse:', error);
    throw error;
  }
};

/**
 * Get user by email from ClickHouse
 */
const getUserByEmail = async (email) => {
  try {
    const result = await clickhouse.query({
      query: `
        SELECT *
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        WHERE email = '${email}'
        ORDER BY createdAt DESC
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });

    const users = await result.json();
    return users.length > 0 ? users[0] : null;
  } catch (error) {
    console.error('Error getting user by email:', error);
    throw error;
  }
};

/**
 * Get user by ID from ClickHouse
 */
const getUserById = async (userId) => {
  try {
    const result = await clickhouse.query({
      query: `
        SELECT *
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        WHERE id = ${userId}
        ORDER BY createdAt DESC
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });

    const users = await result.json();
    return users.length > 0 ? users[0] : null;
  } catch (error) {
    console.error('Error getting user by ID:', error);
    throw error;
  }
};

/**
 * Verify user email
 */
const verifyEmail = async (token) => {
  try {
    // ClickHouse doesn't support UPDATE, so we need to fetch the user first
    const result = await clickhouse.query({
      query: `
        SELECT *
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        WHERE verificationToken = '${token}'
        ORDER BY createdAt DESC
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });

    const users = await result.json();
    if (users.length === 0) {
      throw new Error('Invalid or expired verification token');
    }

    const user = users[0];
    
    // Check if token is expired
    if (new Date(user.verificationTokenExpiry) < new Date()) {
      throw new Error('Verification token has expired');
    }

    // Insert updated record (ClickHouse pattern)
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await clickhouse.insert({
      table: `${DATABASE_NAME}.${TABLE_NAME}`,
      values: [{
        ...user,
        isVerified: 1,
        verificationToken: '',
        updatedAt: now
      }],
      format: 'JSONEachRow'
    });

    return user;
  } catch (error) {
    console.error('Error verifying email:', error);
    throw error;
  }
};

/**
 * Login user
 */
const login = async (email, password, ipAddress, userAgent) => {
  try {
    const user = await getUserByEmail(email);
    
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.isVerified) {
      throw new Error('Please verify your email before logging in');
    }

    if (!user.isActive) {
      throw new Error('Your account has been deactivated');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    // Generate session ID
    const sessionId = crypto.randomBytes(32).toString('hex');
    
    // Generate JWT token
    const access_token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        role: user.role,
        sessionId
      },
      process.env.SECRET,
      { expiresIn: '7d' }
    );

    // Update last login and session (insert new record in ClickHouse)
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await clickhouse.insert({
      table: `${DATABASE_NAME}.${TABLE_NAME}`,
      values: [{
        ...user,
        lastLogin: now,
        sessionId: sessionId,
        updatedAt: now
      }],
      format: 'JSONEachRow'
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        partyName: user.partyName
      },
      access_token,
      sessionId
    };
  } catch (error) {
    console.error('Error during login:', error);
    throw error;
  }
};

/**
 * Get all users with filters
 */
const getAllUsers = async (filters = {}) => {
  try {
    let whereConditions = [];
    
    if (filters.role) {
      whereConditions.push(`role = '${filters.role}'`);
    }
    if (filters.parentId) {
      whereConditions.push(`parentId = ${filters.parentId}`);
    }
    if (filters.isActive !== undefined) {
      whereConditions.push(`isActive = ${filters.isActive ? 1 : 0}`);
    }
    if (filters.isVerified !== undefined) {
      whereConditions.push(`isVerified = ${filters.isVerified ? 1 : 0}`);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const result = await clickhouse.query({
      query: `
        SELECT 
          id, userId, partyName, name, email, mobileNumber, role, 
          parentId, createdBy, isVerified, isActive, lastLogin, 
          createdAt, updatedAt
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        ${whereClause}
        ORDER BY createdAt DESC
      `,
      format: 'JSONEachRow'
    });

    return await result.json();
  } catch (error) {
    console.error('Error getting all users:', error);
    throw error;
  }
};

/**
 * Update user access (activate/deactivate)
 */
const updateUserAccess = async (userId, isActive) => {
  try {
    const user = await getUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await clickhouse.insert({
      table: `${DATABASE_NAME}.${TABLE_NAME}`,
      values: [{
        ...user,
        isActive: isActive ? 1 : 0,
        updatedAt: now
      }],
      format: 'JSONEachRow'
    });

    return { ...user, isActive: isActive ? 1 : 0 };
  } catch (error) {
    console.error('Error updating user access:', error);
    throw error;
  }
};

/**
 * Update user details
 */
const updateUser = async (userId, updateData) => {
  try {
    const user = await getUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const updatedUser = {
      ...user,
      ...updateData,
      updatedAt: now
    };

    // Don't allow updating certain fields
    delete updatedUser.id;
    delete updatedUser.userId;
    delete updatedUser.createdAt;

    await clickhouse.insert({
      table: `${DATABASE_NAME}.${TABLE_NAME}`,
      values: [{
        ...user,
        ...updateData,
        updatedAt: now
      }],
      format: 'JSONEachRow'
    });

    return updatedUser;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
};

/**
 * Delete user (soft delete by marking inactive)
 */
const deleteUser = async (userId) => {
  try {
    return await updateUserAccess(userId, false);
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
};

/**
 * Get user activities (for backward compatibility)
 */
const getUserActivities = async (userId, requestingUserId) => {
  try {
    const user = await getUserById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    // Get activities from activities table
    const result = await clickhouse.query({
      query: `
        SELECT *
        FROM ${DATABASE_NAME}.activities
        WHERE userId = ${userId}
        ORDER BY createdAt DESC
        LIMIT 100
      `,
      format: 'JSONEachRow'
    });

    return await result.json();
  } catch (error) {
    console.error('Error getting user activities:', error);
    throw error;
  }
};

/**
 * Export user data for reporting
 */
const exportUserData = async (filters = {}) => {
  try {
    const users = await getAllUsers(filters);
    return users;
  } catch (error) {
    console.error('Error exporting user data:', error);
    throw error;
  }
};

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  verifyEmail,
  login,
  getAllUsers,
  updateUserAccess,
  updateUser,
  deleteUser,
  getUserActivities,
  exportUserData
};

