const { clickhouse } = require('../../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'users';

async function initClickHouseUser() {
  try {
    // Create the users table
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.${TABLE_NAME} (
          id UInt32,
          userId String,
          partyName String,
          name String,
          email String,
          mobileNumber String,
          password String,
          role String,
          parentId Nullable(UInt32),
          createdBy Nullable(UInt32),
          subscriptionId Nullable(UInt32),
          companyId Nullable(UInt32),
          isVerified UInt8,
          verificationToken Nullable(String),
          verificationTokenExpiry Nullable(DateTime),
          isActive UInt8,
          lastLogin Nullable(DateTime),
          sessionId Nullable(String),
          createdAt DateTime,
          updatedAt DateTime
        ) 
        ENGINE = MergeTree()
        ORDER BY (id, email)
        PARTITION BY toYYYYMM(createdAt)
        SETTINGS index_granularity = 8192
      `
    });
    
    // Add companyId column if it doesn't exist (for existing tables)
    try {
      const tableInfo = await clickhouse.query({
        query: `DESCRIBE TABLE ${DATABASE_NAME}.${TABLE_NAME}`,
        format: 'JSONEachRow'
      });
      const columns = await tableInfo.json();
      const hasCompanyId = columns.some(col => col.name === 'companyId');
      
      if (!hasCompanyId) {
        await clickhouse.command({
          query: `
            ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME}
            ADD COLUMN companyId Nullable(UInt32)
          `
        });
        console.log('companyId column added to users table');
      }
    } catch (alterError) {
      console.warn('Note: Could not check/add companyId column:', alterError.message);
    }
    
    console.log('users table created successfully in ClickHouse');
    return true;
  } catch (error) {
    console.error('Error initializing ClickHouse users table:', error);
    return false;
  }
}

module.exports = {
  initClickHouseUser
};







