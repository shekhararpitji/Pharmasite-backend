const cron = require('node-cron');
const Redis = require('ioredis');
const { clickhouse } = require('../config/clickhouse');
const redis = require('../config/chached-config')

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';

redis.on('connect', () => {
    console.log('Connected to Redis');
});

redis.on('error', (err) => {
    console.error('Redis error:', err);
});


const fetchAndCacheData = async () => {
  try {

    // Fetch unique products from import_data table
    const importResult = await clickhouse.query({
      query: `
        SELECT DISTINCT H_S_Code, productName, productDescription
        FROM ${DATABASE_NAME}.import_data
        WHERE H_S_Code IS NOT NULL AND productName IS NOT NULL
        ORDER BY productName
        LIMIT 10000
      `,
      format: 'JSONEachRow'
    });
    
    const importData = await importResult.json();

    // Fetch unique products from export_data table
    const exportResult = await clickhouse.query({
      query: `
        SELECT DISTINCT H_S_Code, productName, productDescription
        FROM ${DATABASE_NAME}.export_data
        WHERE H_S_Code IS NOT NULL AND productName IS NOT NULL
        ORDER BY productName
        LIMIT 10000
      `,
      format: 'JSONEachRow'
    });
    
    const exportData = await exportResult.json();

    // Cache data with 24-hour expiry (86400 seconds)
    await redis.setex('import_suggested_data', 86400, JSON.stringify(importData));
    await redis.setex('export_suggested_data', 86400, JSON.stringify(exportData));

    console.log('Data cached successfully');
  } catch (error) {
    console.error('Error fetching and caching data:', error);
  }
};


// cron.schedule('0 0 * * *', () => {
//   console.log('Running the cron job to fetch and cache data...');
//   fetchAndCacheData();
// });


fetchAndCacheData();
