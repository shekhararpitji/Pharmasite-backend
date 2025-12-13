const { clickhouse } = require('../../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'subscriptions';

async function initClickHouseSubscription() {
  try {
    // Create the subscriptions table
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.${TABLE_NAME} (
          id UInt32,
          clientName String,
          contactPerson String,
          email String,
          subscriptionExport UInt8,
          subscriptionImport UInt8,
          dataTypeRaw UInt8,
          dataTypeClean UInt8,
          chapterNumber String,
          productCount Nullable(UInt32),
          productlimit Nullable(UInt32),
          subscribedDurationDownload Nullable(UInt32),
          subscribedDurationView Nullable(UInt32),
          accessValidity Nullable(DateTime),
          subscriptionExpiryNotification Nullable(String),
          accessExpiryNotification Nullable(String),
          subscriptionCost Decimal64(2),
          status String,
          startDate DateTime,
          endDate Nullable(DateTime),
          paymentMethod Nullable(String),
          paymentId Nullable(String),
          autoRenew UInt8,
          createdAt DateTime,
          updatedAt DateTime
        ) 
        ENGINE = MergeTree()
        ORDER BY (id, startDate)
        PARTITION BY toYYYYMM(startDate)
        SETTINGS index_granularity = 8192
      `
    });
    
    console.log('subscriptions table created successfully in ClickHouse');
    return true;
  } catch (error) {
    console.error('Error initializing ClickHouse subscriptions table:', error);
    return false;
  }
}

module.exports = {
  initClickHouseSubscription
};







