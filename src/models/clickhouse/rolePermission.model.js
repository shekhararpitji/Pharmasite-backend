const { clickhouse } = require('../../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'role_permissions';

/**
 * Initialize ClickHouse Role_Permissions table
 * Many-to-many relationship between Roles and Permissions
 */
async function initClickHouseRolePermission() {
  try {
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.${TABLE_NAME} (
          id UInt32,
          roleId UInt32,
          permissionId UInt32,
          createdAt DateTime,
          updatedAt DateTime
        ) 
        ENGINE = MergeTree()
        ORDER BY (roleId, permissionId)
        SETTINGS index_granularity = 8192
      `
    });
    
    // Seed default role-permission mappings if they don't exist
    const existingMappings = await clickhouse.query({
      query: `SELECT COUNT(*) as count FROM ${DATABASE_NAME}.${TABLE_NAME}`,
      format: 'JSONEachRow'
    });
    const mappingsData = await existingMappings.json();
    const mappingCount = parseInt(mappingsData[0]?.count || 0);
    
    if (mappingCount === 0) {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      // ADMIN gets all permissions (1-6)
      // PARENT gets VIEW_DATA, DOWNLOAD_RAW, DOWNLOAD_CLEAN (1, 2, 3)
      // CHILD gets VIEW_DATA (1)
      await clickhouse.insert({
        table: `${DATABASE_NAME}.${TABLE_NAME}`,
        values: [
          // ADMIN - all permissions
          { id: 1, roleId: 1, permissionId: 1, createdAt: now, updatedAt: now }, // VIEW_DATA
          { id: 2, roleId: 1, permissionId: 2, createdAt: now, updatedAt: now }, // DOWNLOAD_RAW
          { id: 3, roleId: 1, permissionId: 3, createdAt: now, updatedAt: now }, // DOWNLOAD_CLEAN
          { id: 4, roleId: 1, permissionId: 4, createdAt: now, updatedAt: now }, // MANAGE_USERS
          { id: 5, roleId: 1, permissionId: 5, createdAt: now, updatedAt: now }, // MANAGE_COMPANIES
          { id: 6, roleId: 1, permissionId: 6, createdAt: now, updatedAt: now }, // MANAGE_SUBSCRIPTIONS
          // PARENT - data access permissions
          { id: 7, roleId: 2, permissionId: 1, createdAt: now, updatedAt: now }, // VIEW_DATA
          { id: 8, roleId: 2, permissionId: 2, createdAt: now, updatedAt: now }, // DOWNLOAD_RAW
          { id: 9, roleId: 2, permissionId: 3, createdAt: now, updatedAt: now }, // DOWNLOAD_CLEAN
          // CHILD - base view permission
          { id: 10, roleId: 3, permissionId: 1, createdAt: now, updatedAt: now } // VIEW_DATA
        ],
        format: 'JSONEachRow'
      });
      console.log('Default role-permission mappings seeded successfully');
    }
    
    console.log('role_permissions table created successfully in ClickHouse');
    return true;
  } catch (error) {
    console.error('Error initializing ClickHouse role_permissions table:', error);
    return false;
  }
}

module.exports = {
  initClickHouseRolePermission
};

