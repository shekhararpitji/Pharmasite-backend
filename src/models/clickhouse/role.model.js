const { clickhouse } = require('../../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'roles';

/**
 * Initialize ClickHouse Roles table
 * System roles: ADMIN, PARENT, CHILD
 */
async function initClickHouseRole() {
  try {
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.${TABLE_NAME} (
          id UInt32,
          name String,
          description Nullable(String),
          isSystemRole UInt8,
          createdAt DateTime,
          updatedAt DateTime
        ) 
        ENGINE = MergeTree()
        ORDER BY (id, name)
        SETTINGS index_granularity = 8192
      `
    });
    
    // Seed default roles if they don't exist
    const existingRoles = await clickhouse.query({
      query: `SELECT COUNT(*) as count FROM ${DATABASE_NAME}.${TABLE_NAME}`,
      format: 'JSONEachRow'
    });
    const rolesData = await existingRoles.json();
    const roleCount = parseInt(rolesData[0]?.count || 0);
    
    if (roleCount === 0) {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await clickhouse.insert({
        table: `${DATABASE_NAME}.${TABLE_NAME}`,
        values: [
          { id: 1, name: 'ADMIN', description: 'Full system access', isSystemRole: 1, createdAt: now, updatedAt: now },
          { id: 2, name: 'PARENT', description: 'Company account with subscription management', isSystemRole: 1, createdAt: now, updatedAt: now },
          { id: 3, name: 'CHILD', description: 'Child account under parent supervision', isSystemRole: 1, createdAt: now, updatedAt: now }
        ],
        format: 'JSONEachRow'
      });
      console.log('Default roles seeded successfully');
    }
    
    console.log('roles table created successfully in ClickHouse');
    return true;
  } catch (error) {
    console.error('Error initializing ClickHouse roles table:', error);
    return false;
  }
}

module.exports = {
  initClickHouseRole
};

