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







