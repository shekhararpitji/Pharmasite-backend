const cron = require('node-cron');
const { populateAggregationTables } = require('../models/clickhouse/export.model');
const { clickhouse } = require('../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';

/**
 * Incremental aggregation update - only process new data
 */
async function updateAggregationTables() {
  try {
    console.log('Starting incremental aggregation update...');
    
    // Get the last update time from aggregation tables
    const lastUpdateResult = await clickhouse.query({
      query: `
        SELECT max(created_at) as last_update
        FROM ${DATABASE_NAME}.export_monthly_agg
      `
    }).exec();
    
    const lastUpdate = lastUpdateResult[0]?.last_update || '2020-01-01 00:00:00';
    
    // Update monthly aggregation with new data
    await clickhouse.command({
      query: `
        INSERT INTO ${DATABASE_NAME}.export_monthly_agg
        SELECT
          year,
          toMonth(shippingBillDate) as month,
          formatDateTime(shippingBillDate, '%Y-%m') as yearMonth,
          count() as total_transactions,
          sum(quantity) as total_quantity,
          sum(totalValueUSD) as total_value_usd,
          sum(totalValueINR) as total_value_inr,
          uniq(buyer) as unique_buyers,
          uniq(supplier) as unique_suppliers,
          uniq(productName) as unique_products,
          uniq(buyerCountry) as unique_countries,
          avg(totalValueUSD) as avg_transaction_value,
          now() as created_at
        FROM ${DATABASE_NAME}.export_data
        WHERE updatedAt > '${lastUpdate}'
        GROUP BY year, month, yearMonth
      `
    });

    // Update buyer aggregation
    await clickhouse.command({
      query: `
        INSERT INTO ${DATABASE_NAME}.export_buyer_agg
        SELECT
          buyer,
          buyerCountry,
          year,
          count() as total_transactions,
          sum(quantity) as total_quantity,
          sum(totalValueUSD) as total_value_usd,
          sum(totalValueINR) as total_value_inr,
          uniq(productName) as unique_products,
          min(shippingBillDate) as first_transaction_date,
          max(shippingBillDate) as last_transaction_date,
          now() as created_at
        FROM ${DATABASE_NAME}.export_data
        WHERE updatedAt > '${lastUpdate}'
        GROUP BY buyer, buyerCountry, year
      `
    });

    // Update supplier aggregation
    await clickhouse.command({
      query: `
        INSERT INTO ${DATABASE_NAME}.export_supplier_agg
        SELECT
          supplier,
          supplierCountry,
          year,
          count() as total_transactions,
          sum(quantity) as total_quantity,
          sum(totalValueUSD) as total_value_usd,
          sum(totalValueINR) as total_value_inr,
          uniq(productName) as unique_products,
          uniq(buyer) as unique_buyers,
          min(shippingBillDate) as first_transaction_date,
          max(shippingBillDate) as last_transaction_date,
          now() as created_at
        FROM ${DATABASE_NAME}.export_data
        WHERE updatedAt > '${lastUpdate}'
        GROUP BY supplier, supplierCountry, year
      `
    });

    // Update product aggregation
    await clickhouse.command({
      query: `
        INSERT INTO ${DATABASE_NAME}.export_product_agg
        SELECT
          productName,
          H_S_Code,
          year,
          count() as total_transactions,
          sum(quantity) as total_quantity,
          sum(totalValueUSD) as total_value_usd,
          sum(totalValueINR) as total_value_inr,
          uniq(buyer) as unique_buyers,
          uniq(supplier) as unique_suppliers,
          now() as created_at
        FROM ${DATABASE_NAME}.export_data
        WHERE updatedAt > '${lastUpdate}'
        GROUP BY productName, H_S_Code, year
      `
    });

    // Update country aggregation
    await clickhouse.command({
      query: `
        INSERT INTO ${DATABASE_NAME}.export_country_agg
        SELECT
          buyerCountry,
          supplierCountry,
          year,
          count() as total_transactions,
          sum(quantity) as total_quantity,
          sum(totalValueUSD) as total_value_usd,
          sum(totalValueINR) as total_value_inr,
          uniq(buyer) as unique_buyers,
          uniq(supplier) as unique_suppliers,
          now() as created_at
        FROM ${DATABASE_NAME}.export_data
        WHERE updatedAt > '${lastUpdate}'
        GROUP BY buyerCountry, supplierCountry, year
      `
    });

    console.log('Incremental aggregation update completed successfully');
  } catch (error) {
    console.error('Error updating aggregation tables:', error);
  }
}

/**
 * Full aggregation rebuild - use sparingly
 */
async function rebuildAggregationTables() {
  try {
    console.log('Starting full aggregation rebuild...');
    
    // Truncate existing aggregation tables
    await clickhouse.command({ query: `TRUNCATE TABLE ${DATABASE_NAME}.export_monthly_agg` });
    await clickhouse.command({ query: `TRUNCATE TABLE ${DATABASE_NAME}.export_buyer_agg` });
    await clickhouse.command({ query: `TRUNCATE TABLE ${DATABASE_NAME}.export_supplier_agg` });
    await clickhouse.command({ query: `TRUNCATE TABLE ${DATABASE_NAME}.export_product_agg` });
    await clickhouse.command({ query: `TRUNCATE TABLE ${DATABASE_NAME}.export_country_agg` });
    
    // Rebuild all aggregations
    await populateAggregationTables();
    
    console.log('Full aggregation rebuild completed successfully');
  } catch (error) {
    console.error('Error rebuilding aggregation tables:', error);
  }
}

// Schedule incremental updates every 30 minutes
cron.schedule('*/30 * * * *', () => {
  console.log('Running scheduled aggregation update...');
  updateAggregationTables();
});

// Schedule full rebuild every Sunday at 2 AM
cron.schedule('0 2 * * 0', () => {
  console.log('Running scheduled full aggregation rebuild...');
  rebuildAggregationTables();
});

module.exports = {
  updateAggregationTables,
  rebuildAggregationTables
}; 