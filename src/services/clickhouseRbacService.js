const { clickhouse } = require('../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';

/**
 * ClickHouse RBAC Service
 * Handles role, permission, and user permission operations
 */

/**
 * Get user's role with permissions
 */
const getUserRolePermissions = async (userId) => {
  try {
    // Get user's role
    const userResult = await clickhouse.query({
      query: `
        SELECT role FROM ${DATABASE_NAME}.users
        WHERE id = '${userId}' OR userId = '${userId}'
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });
    const users = await userResult.json();
    if (users.length === 0) return null;
    
    const userRole = users[0].role;
    
    // Get role ID
    const roleResult = await clickhouse.query({
      query: `
        SELECT id FROM ${DATABASE_NAME}.roles
        WHERE name = '${userRole}'
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });
    const roles = await roleResult.json();
    if (roles.length === 0) return null;
    
    const roleId = roles[0].id;
    
    // Get role permissions
    const permResult = await clickhouse.query({
      query: `
        SELECT p.id, p.name, p.description, p.resource
        FROM ${DATABASE_NAME}.role_permissions rp
        JOIN ${DATABASE_NAME}.permissions p ON rp.permissionId = p.id
        WHERE rp.roleId = ${roleId}
      `,
      format: 'JSONEachRow'
    });
    
    const rolePermissions = await permResult.json();
    
    // Get user-specific permissions
    const userPermResult = await clickhouse.query({
      query: `
        SELECT p.id, p.name, p.description, p.resource, up.granted
        FROM ${DATABASE_NAME}.user_permissions up
        JOIN ${DATABASE_NAME}.permissions p ON up.permissionId = p.id
        WHERE up.userId = '${userId}'
      `,
      format: 'JSONEachRow'
    });
    
    const userPermissions = await userPermResult.json();
    
    return {
      role: userRole,
      roleId,
      rolePermissions,
      userPermissions
    };
  } catch (error) {
    console.error('Error getting user role permissions:', error);
    throw error;
  }
};

/**
 * Check if user has a specific permission
 */
const hasPermission = async (userId, permissionName) => {
  try {
    // Admin always has all permissions
    const userResult = await clickhouse.query({
      query: `
        SELECT role FROM ${DATABASE_NAME}.users
        WHERE id = '${userId}' OR userId = '${userId}'
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });
    const users = await userResult.json();
    if (users.length === 0) return false;
    
    if (users[0].role === 'ADMIN' || users[0].role === 'admin') {
      return true;
    }
    
    // Check user-specific permission first (overrides role)
    const userPermResult = await clickhouse.query({
      query: `
        SELECT up.granted
        FROM ${DATABASE_NAME}.user_permissions up
        JOIN ${DATABASE_NAME}.permissions p ON up.permissionId = p.id
        WHERE up.userId = '${userId}' AND p.name = '${permissionName}'
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });
    const userPerms = await userPermResult.json();
    
    if (userPerms.length > 0) {
      return userPerms[0].granted === 1;
    }
    
    // Get user's role
    const userRole = users[0].role;
    
    // Get role ID
    const roleIdResult = await clickhouse.query({
      query: `
        SELECT id FROM ${DATABASE_NAME}.roles
        WHERE name = '${userRole}'
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });
    const roles = await roleIdResult.json();
    if (roles.length === 0) return false;
    
    const roleId = roles[0].id;
    
    // Check role permission
    const rolePermResult = await clickhouse.query({
      query: `
        SELECT 1
        FROM ${DATABASE_NAME}.role_permissions rp
        JOIN ${DATABASE_NAME}.permissions p ON rp.permissionId = p.id
        WHERE rp.roleId = ${roleId} AND p.name = '${permissionName}'
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });
    const rolePerms = await rolePermResult.json();
    
    return rolePerms.length > 0;
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
};

/**
 * Grant permission to user
 */
const grantUserPermission = async (userId, permissionId, grantedBy, notes = null) => {
  try {
    // Get next ID
    const idResult = await clickhouse.query({
      query: `SELECT MAX(id) as maxId FROM ${DATABASE_NAME}.user_permissions`,
      format: 'JSONEachRow'
    });
    const idData = await idResult.json();
    const nextId = (parseInt(idData[0]?.maxId || 0) + 1);

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Check if permission already exists
    const existingResult = await clickhouse.query({
      query: `
        SELECT id FROM ${DATABASE_NAME}.user_permissions
        WHERE userId = '${userId}' AND permissionId = ${permissionId}
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });
    const existing = await existingResult.json();
    
    if (existing.length > 0) {
      // Update existing
      await clickhouse.command({
        query: `
          ALTER TABLE ${DATABASE_NAME}.user_permissions
          UPDATE granted = 1, grantedBy = '${grantedBy}', notes = ${notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL'}, updatedAt = '${now}'
          WHERE userId = '${userId}' AND permissionId = ${permissionId}
        `
      });
    } else {
      // Insert new
      await clickhouse.insert({
        table: `${DATABASE_NAME}.user_permissions`,
        values: [{
          id: nextId,
          userId,
          permissionId,
          granted: 1,
          grantedBy,
          notes: notes || null,
          createdAt: now,
          updatedAt: now
        }],
        format: 'JSONEachRow'
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error granting user permission:', error);
    throw error;
  }
};

/**
 * Revoke permission from user
 */
const revokeUserPermission = async (userId, permissionId) => {
  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await clickhouse.command({
      query: `
        ALTER TABLE ${DATABASE_NAME}.user_permissions
        UPDATE granted = 0, updatedAt = '${now}'
        WHERE userId = '${userId}' AND permissionId = ${permissionId}
      `
    });

    return { success: true };
  } catch (error) {
    console.error('Error revoking user permission:', error);
    throw error;
  }
};

/**
 * Get user's permissions (role + user-specific)
 */
const getUserPermissions = async (userId) => {
  try {
    const rolePerms = await getUserRolePermissions(userId);
    if (!rolePerms) return [];
    
    // Combine role and user permissions, user permissions override
    const permissionMap = {};
    
    // Add role permissions
    rolePerms.rolePermissions.forEach(perm => {
      permissionMap[perm.name] = {
        id: perm.id,
        name: perm.name,
        description: perm.description,
        resource: perm.resource,
        granted: true,
        source: 'role'
      };
    });
    
    // Override with user-specific permissions
    rolePerms.userPermissions.forEach(perm => {
      permissionMap[perm.name] = {
        id: perm.id,
        name: perm.name,
        description: perm.description,
        resource: perm.resource,
        granted: perm.granted === 1,
        source: 'user'
      };
    });
    
    return Object.values(permissionMap);
  } catch (error) {
    console.error('Error getting user permissions:', error);
    throw error;
  }
};

/**
 * Get all permissions
 */
const getAllPermissions = async () => {
  try {
    const result = await clickhouse.query({
      query: `SELECT * FROM ${DATABASE_NAME}.permissions ORDER BY id`,
      format: 'JSONEachRow'
    });
    return await result.json();
  } catch (error) {
    console.error('Error getting all permissions:', error);
    throw error;
  }
};

module.exports = {
  getUserRolePermissions,
  hasPermission,
  grantUserPermission,
  revokeUserPermission,
  getUserPermissions,
  getAllPermissions
};

