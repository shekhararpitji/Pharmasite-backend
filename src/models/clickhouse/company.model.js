const { clickhouse } = require('../../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'companies';

/**
 * Initialize ClickHouse Companies table
 * Companies own subscriptions and have multiple users
 */
async function initClickHouseCompany() {
  try {
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.${TABLE_NAME} (
          id UInt32,
          name String,
          email String,
          contactPerson Nullable(String),
          address Nullable(String),
          phone Nullable(String),
          status String,
          createdAt DateTime,
          updatedAt DateTime
        ) 
        ENGINE = MergeTree()
        ORDER BY (id, email)
        PARTITION BY toYYYYMM(createdAt)
        SETTINGS index_granularity = 8192
      `
    });
    
    console.log('companies table created successfully in ClickHouse');
    return true;
  } catch (error) {
    console.error('Error initializing ClickHouse companies table:', error);
    return false;
  }
}

module.exports = {
  initClickHouseCompany
};

