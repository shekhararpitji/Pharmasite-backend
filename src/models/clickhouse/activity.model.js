const { clickhouse } = require('../../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'activities';

async function initClickHouseActivity() {
  try {
    // Create the activities table
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.${TABLE_NAME} (
          id UInt32,
          userId UInt32,
          activityType String,
          details String,
          ipAddress Nullable(String),
          userAgent Nullable(String),
          createdAt DateTime,
          updatedAt DateTime
        ) 
        ENGINE = MergeTree()
        ORDER BY (userId, createdAt)
        PARTITION BY toYYYYMM(createdAt)
        SETTINGS index_granularity = 8192
      `
    });
    
    console.log('activities table created successfully in ClickHouse');
    return true;
  } catch (error) {
    console.error('Error initializing ClickHouse activities table:', error);
    return false;
  }
}

module.exports = {
  initClickHouseActivity
};







