const { clickhouse } = require('../config/clickhouse');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'users';

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
      parentId,
      subscriptionId,
      companyId
    } = userData;

    const hashedPassword = await bcrypt.hash(password, 10);

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const userId = uuidv4();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const idResult = await clickhouse.query({
      query: `SELECT coalesce(max(id), 0) + 1 AS nextId FROM ${DATABASE_NAME}.${TABLE_NAME}`,
      format: 'JSONEachRow'
    });
    const idRows = await idResult.json();
    const nextId = idRows[0]?.nextId ?? 1;

    const row = {
      id: nextId,
      userId,
      partyName: String(partyName || ''),
      name: String(name),
      email: String(email),
      mobileNumber: String(mobileNumber || ''),
      password: String(hashedPassword),
      role: String(role),
      parentId: typeof parentId === 'number' ? parentId : 0,
      createdBy: typeof createdById === 'number' ? createdById : 0,
      subscriptionId: subscriptionId ?? null,
      companyId: companyId ?? null,
      isVerified: 0,
      verificationToken: String(verificationToken),
      verificationTokenExpiry: verificationTokenExpiry.toISOString().slice(0, 19).replace('T', ' '),
      isActive: 1,
      lastLogin: '1970-01-01 00:00:00',
      sessionId: '',
      createdAt: now,
      updatedAt: now
    };

    await clickhouse.insert({
      table: `${DATABASE_NAME}.${TABLE_NAME}`,
      values: [row],
      format: 'JSONEachRow'
    });

    return {
      id: nextId,
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
        ORDER BY updatedAt DESC, createdAt DESC
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
 * Get user by numeric ID from ClickHouse
 */
const getUserById = async (id) => {
  try {
    const result = await clickhouse.query({
      query: `
        SELECT *
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        WHERE id = ${parseInt(id)}
        ORDER BY updatedAt DESC, createdAt DESC
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
    const result = await clickhouse.query({
      query: `
        SELECT *
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        WHERE verificationToken = '${token}'
        ORDER BY updatedAt DESC, createdAt DESC
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });

    const users = await result.json();
    if (users.length === 0) {
      throw new Error('Invalid or expired verification token');
    }

    const user = users[0];

    if (new Date(user.verificationTokenExpiry) < new Date()) {
      throw new Error('Verification token has expired');
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await clickhouse.command({
      query: `
        ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME}
        UPDATE 
          isVerified = 1,
          verificationToken = '',
          updatedAt = '${now.replace(/'/g, "''")}'
        WHERE id = ${user.id}
      `
    });

    return { ...user, isVerified: 1, verificationToken: '', updatedAt: now };
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

    if (!user.isActive) {
      throw new Error('Your account has been deactivated');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    const sessionId = crypto.randomBytes(32).toString('hex');

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

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await clickhouse.command({
      query: `
        ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME}
        UPDATE 
          lastLogin = '${now.replace(/'/g, "''")}',
          sessionId = '${sessionId.replace(/'/g, "''")}',
          updatedAt = '${now.replace(/'/g, "''")}'
        WHERE id = ${user.id}
      `
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
      whereConditions.push(`parentId = ${parseInt(filters.parentId)}`);
    }
    if (filters.companyId) {
      whereConditions.push(`companyId = ${filters.companyId}`);
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
          parentId, createdBy, subscriptionId, companyId, isVerified, isActive, lastLogin, 
          createdAt, updatedAt
        FROM (
          SELECT *,
            ROW_NUMBER() OVER (PARTITION BY id ORDER BY updatedAt DESC, createdAt DESC) as rn
          FROM ${DATABASE_NAME}.${TABLE_NAME}
          ${whereClause}
        ) AS ranked
        WHERE rn = 1
        ORDER BY updatedAt DESC
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

    await clickhouse.command({
      query: `
        ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME}
        UPDATE 
          isActive = ${isActive ? 1 : 0},
          updatedAt = '${now.replace(/'/g, "''")}'
        WHERE id = ${parseInt(userId)}
      `
    });

    return { ...user, isActive: isActive ? 1 : 0, updatedAt: now };
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

    delete updatedUser.id;
    delete updatedUser.userId;
    delete updatedUser.createdAt;

    const updateFields = [];
    const protectedKeys = ['id', 'userId', 'createdAt'];
    Object.keys(updateData).forEach(key => {
      if (!protectedKeys.includes(key)) {
        const value = updateData[key];
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
    updateFields.push(`updatedAt = '${now}'`);

    await clickhouse.command({
      query: `
        ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME}
        UPDATE ${updateFields.join(', ')}
        WHERE id = ${parseInt(userId)}
      `
    });

    return { ...updatedUser, id: user.id };
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

    const result = await clickhouse.query({
      query: `
        SELECT *
        FROM ${DATABASE_NAME}.activities
        WHERE userId = ${parseInt(userId)}
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
