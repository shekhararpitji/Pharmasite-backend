const { clickhouse } = require('../../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'user_permissions';

/**
 * Initialize ClickHouse User_Permissions table
 * Allows granular, per-user permission control
 * User-specific permissions override role-based permissions
 */
async function initClickHouseUserPermission() {
  try {
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.${TABLE_NAME} (
          id UInt32,
          userId String,
          permissionId UInt32,
          granted UInt8,
          grantedBy Nullable(String),
          notes Nullable(String),
          createdAt DateTime,
          updatedAt DateTime
        ) 
        ENGINE = MergeTree()
        ORDER BY (userId, permissionId)
        SETTINGS index_granularity = 8192
      `
    });
    
    console.log('user_permissions table created successfully in ClickHouse');
    return true;
  } catch (error) {
    console.error('Error initializing ClickHouse user_permissions table:', error);
    return false;
  }
}

module.exports = {
  initClickHouseUserPermission
};

