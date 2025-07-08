const { clickhouse } = require('../../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'import_data';

async function initClickHouseImport() {
  try {
    // Create the import_data table
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
          shippingEntryType String,
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
          totalDutyPaidINR Float64,
          totalDutyPaidUSD Float64,
          importExportCode String,
          supplier String,
          supplierStandardized String,
          supplierAddress String,
          supplierCity String,
          supplierCountry String,
          buyer String,
          buyerStandardized String,
          buyerAddress String,
          buyerCity String,
          buyerPin String,
          buyerState String,
          buyerStatus String,
          buyerPhone String,
          buyerEmail String,
          director String,
          customHouseAgent String,
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

    // Create monthly aggregation table for imports
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.import_monthly_agg (
          year UInt16,
          month UInt8,
          yearMonth String,
          total_transactions UInt64,
          total_quantity Float64,
          total_value_usd Float64,
          total_value_inr Float64,
          total_duty_paid_usd Float64,
          total_duty_paid_inr Float64,
          unique_buyers UInt32,
          unique_suppliers UInt32,
          unique_products UInt32,
          unique_countries UInt32,
          avg_transaction_value Float64,
          avg_duty_rate Float64,
          created_at DateTime DEFAULT now()
        ) 
        ENGINE = SummingMergeTree()
        ORDER BY (year, month)
        PARTITION BY year
      `
    });

    // Create buyer aggregation table for imports
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.import_buyer_agg (
          buyer String,
          buyerStandardized String,
          buyerCountry String,
          buyerState String,
          buyerCity String,
          year UInt16,
          total_transactions UInt64,
          total_quantity Float64,
          total_value_usd Float64,
          total_value_inr Float64,
          total_duty_paid_usd Float64,
          total_duty_paid_inr Float64,
          unique_products UInt32,
          unique_suppliers UInt32,
          first_transaction_date Date,
          last_transaction_date Date,
          created_at DateTime DEFAULT now()
        ) 
        ENGINE = SummingMergeTree()
        ORDER BY (buyer, year)
        PARTITION BY year
      `
    });

    // Create supplier aggregation table for imports
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.import_supplier_agg (
          supplier String,
          supplierStandardized String,
          supplierCountry String,
          supplierCity String,
          year UInt16,
          total_transactions UInt64,
          total_quantity Float64,
          total_value_usd Float64,
          total_value_inr Float64,
          total_duty_paid_usd Float64,
          total_duty_paid_inr Float64,
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

    // Create product aggregation table for imports
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.import_product_agg (
          productName String,
          H_S_Code String,
          CAS_Number String,
          year UInt16,
          total_transactions UInt64,
          total_quantity Float64,
          total_value_usd Float64,
          total_value_inr Float64,
          total_duty_paid_usd Float64,
          total_duty_paid_inr Float64,
          unique_buyers UInt32,
          unique_suppliers UInt32,
          avg_unit_rate_usd Float64,
          created_at DateTime DEFAULT now()
        ) 
        ENGINE = SummingMergeTree()
        ORDER BY (productName, year)
        PARTITION BY year
      `
    });

    // Create country/port aggregation table for imports
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.import_country_agg (
          supplierCountry String,
          buyerCountry String,
          portOfOrigin String,
          year UInt16,
          total_transactions UInt64,
          total_quantity Float64,
          total_value_usd Float64,
          total_value_inr Float64,
          total_duty_paid_usd Float64,
          total_duty_paid_inr Float64,
          unique_buyers UInt32,
          unique_suppliers UInt32,
          created_at DateTime DEFAULT now()
        ) 
        ENGINE = SummingMergeTree()
        ORDER BY (supplierCountry, year)
        PARTITION BY year
      `
    });

    // Create duty analysis aggregation table
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.import_duty_agg (
          H_S_Code String,
          productName String,
          year UInt16,
          total_transactions UInt64,
          total_value_usd Float64,
          total_duty_paid_usd Float64,
          avg_duty_rate Float64,
          min_duty_rate Float64,
          max_duty_rate Float64,
          created_at DateTime DEFAULT now()
        ) 
        ENGINE = SummingMergeTree()
        ORDER BY (H_S_Code, year)
        PARTITION BY year
      `
    });

    // Create materialized view for real-time monthly aggregation
    await clickhouse.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${DATABASE_NAME}.import_monthly_agg_mv
        TO ${DATABASE_NAME}.import_monthly_agg
        AS SELECT
          year,
          toMonth(shippingBillDate) as month,
          formatDateTime(shippingBillDate, '%Y-%m') as yearMonth,
          count() as total_transactions,
          sum(quantity) as total_quantity,
          sum(totalValueUSD) as total_value_usd,
          sum(totalValueINR) as total_value_inr,
          sum(totalDutyPaidUSD) as total_duty_paid_usd,
          sum(totalDutyPaidINR) as total_duty_paid_inr,
          uniq(buyer) as unique_buyers,
          uniq(supplier) as unique_suppliers,
          uniq(productName) as unique_products,
          uniq(supplierCountry) as unique_countries,
          avg(totalValueUSD) as avg_transaction_value,
          avg(totalDutyPaidUSD / nullIf(totalValueUSD, 0)) as avg_duty_rate,
          now() as created_at
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        GROUP BY year, month, yearMonth
      `
    });

    console.log('ClickHouse import tables and materialized views initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing ClickHouse import tables:', error);
    return false;
  }
}

// Function to populate import aggregation tables
async function populateImportAggregationTables() {
  try {
    console.log('Populating import aggregation tables...');

    // Populate monthly aggregation
    await clickhouse.command({
      query: `
        INSERT INTO ${DATABASE_NAME}.import_monthly_agg
        SELECT
          year,
          toMonth(shippingBillDate) as month,
          formatDateTime(shippingBillDate, '%Y-%m') as yearMonth,
          count() as total_transactions,
          sum(quantity) as total_quantity,
          sum(totalValueUSD) as total_value_usd,
          sum(totalValueINR) as total_value_inr,
          sum(totalDutyPaidUSD) as total_duty_paid_usd,
          sum(totalDutyPaidINR) as total_duty_paid_inr,
          uniq(buyer) as unique_buyers,
          uniq(supplier) as unique_suppliers,
          uniq(productName) as unique_products,
          uniq(supplierCountry) as unique_countries,
          avg(totalValueUSD) as avg_transaction_value,
          avg(totalDutyPaidUSD / nullIf(totalValueUSD, 0)) as avg_duty_rate,
          now() as created_at
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        GROUP BY year, month, yearMonth
      `
    });

    // Populate buyer aggregation
    await clickhouse.command({
      query: `
        INSERT INTO ${DATABASE_NAME}.import_buyer_agg
        SELECT
          buyer,
          buyerStandardized,
          buyerCountry,
          buyerState,
          buyerCity,
          year,
          count() as total_transactions,
          sum(quantity) as total_quantity,
          sum(totalValueUSD) as total_value_usd,
          sum(totalValueINR) as total_value_inr,
          sum(totalDutyPaidUSD) as total_duty_paid_usd,
          sum(totalDutyPaidINR) as total_duty_paid_inr,
          uniq(productName) as unique_products,
          uniq(supplier) as unique_suppliers,
          min(shippingBillDate) as first_transaction_date,
          max(shippingBillDate) as last_transaction_date,
          now() as created_at
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        GROUP BY buyer, buyerStandardized, buyerCountry, buyerState, buyerCity, year
      `
    });

    // Populate supplier aggregation
    await clickhouse.command({
      query: `
        INSERT INTO ${DATABASE_NAME}.import_supplier_agg
        SELECT
          supplier,
          supplierStandardized,
          supplierCountry,
          supplierCity,
          year,
          count() as total_transactions,
          sum(quantity) as total_quantity,
          sum(totalValueUSD) as total_value_usd,
          sum(totalValueINR) as total_value_inr,
          sum(totalDutyPaidUSD) as total_duty_paid_usd,
          sum(totalDutyPaidINR) as total_duty_paid_inr,
          uniq(productName) as unique_products,
          uniq(buyer) as unique_buyers,
          min(shippingBillDate) as first_transaction_date,
          max(shippingBillDate) as last_transaction_date,
          now() as created_at
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        GROUP BY supplier, supplierStandardized, supplierCountry, supplierCity, year
      `
    });

    // Populate product aggregation
    await clickhouse.command({
      query: `
        INSERT INTO ${DATABASE_NAME}.import_product_agg
        SELECT
          productName,
          H_S_Code,
          CAS_Number,
          year,
          count() as total_transactions,
          sum(quantity) as total_quantity,
          sum(totalValueUSD) as total_value_usd,
          sum(totalValueINR) as total_value_inr,
          sum(totalDutyPaidUSD) as total_duty_paid_usd,
          sum(totalDutyPaidINR) as total_duty_paid_inr,
          uniq(buyer) as unique_buyers,
          uniq(supplier) as unique_suppliers,
          avg(standardUnitRateUSD) as avg_unit_rate_usd,
          now() as created_at
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        GROUP BY productName, H_S_Code, CAS_Number, year
      `
    });

    // Populate country aggregation
    await clickhouse.command({
      query: `
        INSERT INTO ${DATABASE_NAME}.import_country_agg
        SELECT
          supplierCountry,
          buyerCountry,
          portOfOrigin,
          year,
          count() as total_transactions,
          sum(quantity) as total_quantity,
          sum(totalValueUSD) as total_value_usd,
          sum(totalValueINR) as total_value_inr,
          sum(totalDutyPaidUSD) as total_duty_paid_usd,
          sum(totalDutyPaidINR) as total_duty_paid_inr,
          uniq(buyer) as unique_buyers,
          uniq(supplier) as unique_suppliers,
          now() as created_at
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        GROUP BY supplierCountry, buyerCountry, portOfOrigin, year
      `
    });

    // Populate duty analysis aggregation
    await clickhouse.command({
      query: `
        INSERT INTO ${DATABASE_NAME}.import_duty_agg
        SELECT
          H_S_Code,
          productName,
          year,
          count() as total_transactions,
          sum(totalValueUSD) as total_value_usd,
          sum(totalDutyPaidUSD) as total_duty_paid_usd,
          avg(totalDutyPaidUSD / nullIf(totalValueUSD, 0)) as avg_duty_rate,
          min(totalDutyPaidUSD / nullIf(totalValueUSD, 0)) as min_duty_rate,
          max(totalDutyPaidUSD / nullIf(totalValueUSD, 0)) as max_duty_rate,
          now() as created_at
        FROM ${DATABASE_NAME}.${TABLE_NAME}
        WHERE totalValueUSD > 0
        GROUP BY H_S_Code, productName, year
      `
    });

    console.log('Import aggregation tables populated successfully');
    return true;
  } catch (error) {
    console.error('Error populating import aggregation tables:', error);
    return false;
  }
}

// Function to get import table statistics
async function getImportTableStats() {
  try {
    // First check if table exists and has data
    const tableExistsResult = await clickhouse.query({
      query: `
        SELECT count() as total
        FROM system.tables 
        WHERE database = '${DATABASE_NAME}' AND name = '${TABLE_NAME}'
      `
    });
    const tableExists = await tableExistsResult.json();

    if (!tableExists || !tableExists.data || tableExists.data.length === 0 || tableExists.data[0].total === 0) {
      return {
        total_records: 0,
        unique_buyers: 0,
        unique_suppliers: 0,
        unique_products: 0,
        unique_countries: 0,
        total_value_usd: 0,
        total_duty_paid_usd: 0,
        avg_duty_rate: 0,
        earliest_date: null,
        latest_date: null
      };
    }

    const statsResult = await clickhouse.query({
      query: `
        SELECT 
          count() as total_records,
          uniq(buyer) as unique_buyers,
          uniq(supplier) as unique_suppliers,
          uniq(productName) as unique_products,
          uniq(supplierCountry) as unique_countries,
          sum(totalValueUSD) as total_value_usd,
          sum(totalDutyPaidUSD) as total_duty_paid_usd,
          avg(totalDutyPaidUSD / nullIf(totalValueUSD, 0)) as avg_duty_rate,
          min(shippingBillDate) as earliest_date,
          max(shippingBillDate) as latest_date
        FROM ${DATABASE_NAME}.${TABLE_NAME}
      `
    });
    const stats = await statsResult.json();

    return stats.data[0] || {
      total_records: 0,
      unique_buyers: 0,
      unique_suppliers: 0,
      unique_products: 0,
      unique_countries: 0,
      total_value_usd: 0,
      total_duty_paid_usd: 0,
      avg_duty_rate: 0,
      earliest_date: null,
      latest_date: null
    };
  } catch (error) {
    console.error('Error getting import table statistics:', error);
    return {
      total_records: 0,
      unique_buyers: 0,
      unique_suppliers: 0,
      unique_products: 0,
      unique_countries: 0,
      total_value_usd: 0,
      total_duty_paid_usd: 0,
      avg_duty_rate: 0,
      earliest_date: null,
      latest_date: null
    };
  }
}

module.exports = {
  initClickHouseImport,
  populateImportAggregationTables,
  getImportTableStats
}; 