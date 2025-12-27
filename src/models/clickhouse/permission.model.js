const { clickhouse } = require('../../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'permissions';

/**
 * Initialize ClickHouse Permissions table
 * System permissions: VIEW_DATA, DOWNLOAD_RAW, DOWNLOAD_CLEAN, etc.
 */
async function initClickHousePermission() {
  try {
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.${TABLE_NAME} (
          id UInt32,
          name String,
          description Nullable(String),
          resource Nullable(String),
          createdAt DateTime,
          updatedAt DateTime
        ) 
        ENGINE = MergeTree()
        ORDER BY (id, name)
        SETTINGS index_granularity = 8192
      `
    });
    
    // Seed default permissions if they don't exist
    const existingPerms = await clickhouse.query({
      query: `SELECT COUNT(*) as count FROM ${DATABASE_NAME}.${TABLE_NAME}`,
      format: 'JSONEachRow'
    });
    const permsData = await existingPerms.json();
    const permCount = parseInt(permsData[0]?.count || 0);
    
    if (permCount === 0) {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await clickhouse.insert({
        table: `${DATABASE_NAME}.${TABLE_NAME}`,
        values: [
          { id: 1, name: 'VIEW_DATA', description: 'View pharmaceutical data', resource: 'data', createdAt: now, updatedAt: now },
          { id: 2, name: 'DOWNLOAD_RAW', description: 'Download raw data', resource: 'data', createdAt: now, updatedAt: now },
          { id: 3, name: 'DOWNLOAD_CLEAN', description: 'Download cleaned data', resource: 'data', createdAt: now, updatedAt: now },
          { id: 4, name: 'MANAGE_USERS', description: 'Manage users', resource: 'users', createdAt: now, updatedAt: now },
          { id: 5, name: 'MANAGE_COMPANIES', description: 'Manage companies', resource: 'companies', createdAt: now, updatedAt: now },
          { id: 6, name: 'MANAGE_SUBSCRIPTIONS', description: 'Manage subscriptions', resource: 'subscriptions', createdAt: now, updatedAt: now }
        ],
        format: 'JSONEachRow'
      });
      console.log('Default permissions seeded successfully');
    }
    
    console.log('permissions table created successfully in ClickHouse');
    return true;
  } catch (error) {
    console.error('Error initializing ClickHouse permissions table:', error);
    return false;
  }
}

module.exports = {
  initClickHousePermission
};

