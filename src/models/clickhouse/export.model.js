const { clickhouse } = require('../../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'export_data';

async function initClickHouseExport() {
  try {
    // Create the export_data table
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.${TABLE_NAME} (
          id String,
          informationOf String,
          yearMonth String,
          year UInt16,
          portOfOrigin String,
          modeOfShipment String,
          indianPortCode String,
          shippingBillDate Date,
          shippingBillNumber String,
          shippingBillStatus String,
          invoiceNumber String,
          itemNumber String,
          H_S_Code String,
          productDescription String,
          productName String,
          CAS_Number String,
          quantity Float64,
          quantityUnit String,
          standardQuantity Float64,
          standardQuantityUnit String,
          standardUnitRateINR Float64,
          standardUnitRateUSD Float64,
          itemRateINR Float64,
          itemRateUSD Float64,
          totalValueINR Float64,
          totalValueUSD Float64,
          itemRateInvoice Float64,
          currency String,
          totalValueInvoice Float64,
          freightOnBoardINR Float64,
          freightOnBoardUSD Float64,
          importExportCode String,
          supplier String,
          supplierRaw String,
          supplierAddress String,
          supplierCity String,
          supplierCountry String,
          buyer String,
          buyerRaw String,
          companyStatus String,
          portOfDeparture String,
          buyerCountry String,
          region String,
          createdAt DateTime,
          updatedAt DateTime
        ) 
        ENGINE = MergeTree()
        ORDER BY (year, shippingBillDate)
        PARTITION BY year
        SETTINGS index_granularity = 8192
      `
    });

    // Create monthly aggregation table
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.export_monthly_agg (
          year UInt16,
          month UInt8,
          yearMonth String,
          total_transactions UInt64,
          total_quantity Float64,
          total_value_usd Float64,
          total_value_inr Float64,
          unique_buyers UInt32,
          unique_suppliers UInt32,
          unique_products UInt32,
          unique_countries UInt32,
          avg_transaction_value Float64,
          created_at DateTime DEFAULT now()
        ) 
        ENGINE = SummingMergeTree()
        ORDER BY (year, month)
        PARTITION BY year
      `
    });

    // Create buyer aggregation table
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.export_buyer_agg (
          buyer String,
          buyerCountry String,
          year UInt16,
          total_transactions UInt64,
          total_quantity Float64,
          total_value_usd Float64,
          total_value_inr Float64,
          unique_products UInt32,
          first_transaction_date Date,
          last_transaction_date Date,
          created_at DateTime DEFAULT now()
        ) 
        ENGINE = SummingMergeTree()
        ORDER BY (buyer, year)
        PARTITION BY year
      `
    });

    // Create supplier aggregation table
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.export_supplier_agg (
          supplier String,
          supplierCountry String,
          year UInt16,
          total_transactions UInt64,
          total_quantity Float64,
          total_value_usd Float64,
          total_value_inr Float64,
          unique_products UInt32,
          unique_buyers UInt32,
          first_transaction_date Date,
          last_transaction_date Date,
          created_at DateTime DEFAULT now()
        ) 
        ENGINE = SummingMergeTree()
        ORDER BY (supplier, year)
        PARTITION BY year
      `
    });

    // Create product aggregation table
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.export_product_agg (
          productName String,
          H_S_Code String,
          year UInt16,
          total_transactions UInt64,
          total_quantity Float64,
          total_value_usd Float64,
          total_value_inr Float64,
          unique_buyers UInt32,
          unique_suppliers UInt32,
          created_at DateTime DEFAULT now()
        ) 
        ENGINE = SummingMergeTree()
        ORDER BY (productName, year)
        PARTITION BY year
      `
    });

    // Create country aggregation table
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.export_country_agg (
          buyerCountry String,
          supplierCountry String,
          year UInt16,
          total_transactions UInt64,
          total_quantity Float64,
          total_value_usd Float64,
          total_value_inr Float64,
          unique_buyers UInt32,
          unique_suppliers UInt32,
          created_at DateTime DEFAULT now()
        ) 
        ENGINE = SummingMergeTree()
        ORDER BY (buyerCountry, year)
        PARTITION BY year
      `
    });

    // Create materialized view for real-time monthly aggregation
    await clickhouse.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${DATABASE_NAME}.export_monthly_agg_mv
        TO ${DATABASE_NAME}.export_monthly_agg
        AS SELECT
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
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        GROUP BY year, month, yearMonth
      `
    });

    console.log('ClickHouse tables and materialized views initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing ClickHouse tables:', error);
    return false;
  }
}

// Function to populate aggregation tables (run this periodically)
async function populateAggregationTables() {
  try {
    // Populate monthly aggregation
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
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        GROUP BY year, month, yearMonth
      `
    });

    // Populate buyer aggregation
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
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        GROUP BY buyer, buyerCountry, year
      `
    });

    // Populate supplier aggregation
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
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        GROUP BY supplier, supplierCountry, year
      `
    });

    console.log('Aggregation tables populated successfully');
    return true;
  } catch (error) {
    console.error('Error populating aggregation tables:', error);
    return false;
  }
}

module.exports = {
  initClickHouseExport,
  populateAggregationTables
}; 