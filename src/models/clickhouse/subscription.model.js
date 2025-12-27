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
          companyId UInt32,
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
          viewStartDate Nullable(DateTime),
          viewEndDate Nullable(DateTime),
          downloadStartDate Nullable(DateTime),
          downloadEndDate Nullable(DateTime),
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
    
    // Add companyId and date range columns if they don't exist (for existing tables)
    try {
      const tableInfo = await clickhouse.query({
        query: `DESCRIBE TABLE ${DATABASE_NAME}.${TABLE_NAME}`,
        format: 'JSONEachRow'
      });
      const columns = await tableInfo.json();
      const columnNames = columns.map(col => col.name);
      
      if (!columnNames.includes('companyId')) {
        await clickhouse.command({
          query: `
            ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME}
            ADD COLUMN companyId UInt32 DEFAULT 0
          `
        });
        console.log('companyId column added to subscriptions table');
      }
      
      if (!columnNames.includes('viewStartDate')) {
        await clickhouse.command({
          query: `
            ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME}
            ADD COLUMN viewStartDate Nullable(DateTime),
            ADD COLUMN viewEndDate Nullable(DateTime),
            ADD COLUMN downloadStartDate Nullable(DateTime),
            ADD COLUMN downloadEndDate Nullable(DateTime)
          `
        });
        console.log('Date range columns added to subscriptions table');
      }
    } catch (alterError) {
      console.warn('Note: Could not check/add columns:', alterError.message);
    }
    
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







