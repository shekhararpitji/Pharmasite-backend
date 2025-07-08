const { initClickHouseExport, populateAggregationTables } = require('../models/clickhouse/export.model');
const { initClickHouseImport, populateImportAggregationTables } = require('../models/clickhouse/import.model');
const { clickhouse } = require('../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';

/**
 * Initialize ClickHouse aggregation tables and populate with existing data
 */
async function initializeAggregations() {
  try {
    console.log('Initializing ClickHouse aggregation tables...');
    
    // Step 1: Create all tables and materialized views
    console.log('Creating export tables and materialized views...');
    await initClickHouseExport();
    
    console.log('Creating import tables and materialized views...');
    await initClickHouseImport();
    
    // Step 2: Check if main tables have data
    const exportDataCountResult = await clickhouse.query({
      query: `SELECT count() as total FROM ${DATABASE_NAME}.export_data`
    });
    const exportDataCount = await exportDataCountResult.json();
    
    const importDataCountResult = await clickhouse.query({
      query: `SELECT count() as total FROM ${DATABASE_NAME}.import_data`
    });
    const importDataCount = await importDataCountResult.json();
    
    const totalExportRecords = exportDataCount.data[0]?.total || 0;
    const totalImportRecords = importDataCount.data[0]?.total || 0;
    
    console.log(`Found ${totalExportRecords} export records and ${totalImportRecords} import records`);
    
    if (totalExportRecords === 0 && totalImportRecords === 0) {
      console.log('No data found in main tables. Please import data first.');
      return;
    }
    
    // Step 3: Populate aggregation tables
    if (totalExportRecords > 0) {
      console.log('Populating export aggregation tables...');
      await populateAggregationTables();
    }
    
    if (totalImportRecords > 0) {
      console.log('Populating import aggregation tables...');
      await populateImportAggregationTables();
    }
    
    // Step 4: Verify aggregations
    console.log('Verifying aggregations...');
    const verificationQueries = [
      { name: 'Export Monthly Aggregations', query: `SELECT count() as count FROM ${DATABASE_NAME}.export_monthly_agg` },
      { name: 'Export Buyer Aggregations', query: `SELECT count() as count FROM ${DATABASE_NAME}.export_buyer_agg` },
      { name: 'Export Supplier Aggregations', query: `SELECT count() as count FROM ${DATABASE_NAME}.export_supplier_agg` },
      { name: 'Export Product Aggregations', query: `SELECT count() as count FROM ${DATABASE_NAME}.export_product_agg` },
      { name: 'Export Country Aggregations', query: `SELECT count() as count FROM ${DATABASE_NAME}.export_country_agg` },
      { name: 'Import Monthly Aggregations', query: `SELECT count() as count FROM ${DATABASE_NAME}.import_monthly_agg` },
      { name: 'Import Buyer Aggregations', query: `SELECT count() as count FROM ${DATABASE_NAME}.import_buyer_agg` },
      { name: 'Import Supplier Aggregations', query: `SELECT count() as count FROM ${DATABASE_NAME}.import_supplier_agg` },
      { name: 'Import Product Aggregations', query: `SELECT count() as count FROM ${DATABASE_NAME}.import_product_agg` },
      { name: 'Import Country Aggregations', query: `SELECT count() as count FROM ${DATABASE_NAME}.import_country_agg` },
      { name: 'Import Duty Aggregations', query: `SELECT count() as count FROM ${DATABASE_NAME}.import_duty_agg` }
    ];
    
    for (const verification of verificationQueries) {
      try {
        const result = await clickhouse.query({ query: verification.query });
        const data = await result.json();
        const count = data.data[0]?.count || 0;
        console.log(`${verification.name}: ${count} records`);
      } catch (error) {
        console.log(`${verification.name}: Table not found or empty`);
      }
    }
    
    // Step 5: Create additional indexes for better performance
    console.log('Creating additional indexes...');
    await createOptimizationIndexes();
    
    console.log('✅ Aggregation initialization completed successfully!');
    console.log('📊 Your dashboard queries will now be significantly faster.');
    
  } catch (error) {
    console.error('❌ Error initializing aggregations:', error);
    process.exit(1);
  }
}

/**
 * Create additional indexes and optimizations
 */
async function createOptimizationIndexes() {
  try {
    // Create secondary indexes on frequently queried columns
    const indexQueries = [
      // Export table indexes
      `ALTER TABLE ${DATABASE_NAME}.export_data ADD INDEX IF NOT EXISTS idx_buyer buyer TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.export_data ADD INDEX IF NOT EXISTS idx_supplier supplier TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.export_data ADD INDEX IF NOT EXISTS idx_product productName TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.export_data ADD INDEX IF NOT EXISTS idx_country buyerCountry TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.export_data ADD INDEX IF NOT EXISTS idx_hs_code H_S_Code TYPE minmax GRANULARITY 1`,
      
      // Import table indexes
      `ALTER TABLE ${DATABASE_NAME}.import_data ADD INDEX IF NOT EXISTS idx_buyer buyer TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.import_data ADD INDEX IF NOT EXISTS idx_supplier supplier TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.import_data ADD INDEX IF NOT EXISTS idx_product productName TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.import_data ADD INDEX IF NOT EXISTS idx_country buyerCountry TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.import_data ADD INDEX IF NOT EXISTS idx_hs_code H_S_Code TYPE minmax GRANULARITY 1`,
      
      // Export aggregation table indexes
      `ALTER TABLE ${DATABASE_NAME}.export_buyer_agg ADD INDEX IF NOT EXISTS idx_buyer_country buyerCountry TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.export_supplier_agg ADD INDEX IF NOT EXISTS idx_supplier_country supplierCountry TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.export_product_agg ADD INDEX IF NOT EXISTS idx_hs_code H_S_Code TYPE minmax GRANULARITY 1`,
      
      // Import aggregation table indexes
      `ALTER TABLE ${DATABASE_NAME}.import_buyer_agg ADD INDEX IF NOT EXISTS idx_buyer_country buyerCountry TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.import_supplier_agg ADD INDEX IF NOT EXISTS idx_supplier_country supplierCountry TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.import_product_agg ADD INDEX IF NOT EXISTS idx_hs_code H_S_Code TYPE minmax GRANULARITY 1`
    ];
    
    for (const query of indexQueries) {
      try {
        await clickhouse.command({ query });
        console.log(`✓ Created index: ${query.split('idx_')[1]?.split(' ')[0]}`);
      } catch (error) {
        // Index might already exist, continue
        console.log(`⚠ Index creation skipped: ${error.message}`);
      }
    }
    
    // Optimize tables
    const optimizeQueries = [
      `OPTIMIZE TABLE ${DATABASE_NAME}.export_data FINAL`,
      `OPTIMIZE TABLE ${DATABASE_NAME}.export_monthly_agg FINAL`,
      `OPTIMIZE TABLE ${DATABASE_NAME}.export_buyer_agg FINAL`,
      `OPTIMIZE TABLE ${DATABASE_NAME}.export_supplier_agg FINAL`,
      `OPTIMIZE TABLE ${DATABASE_NAME}.export_product_agg FINAL`,
      `OPTIMIZE TABLE ${DATABASE_NAME}.export_country_agg FINAL`,
      `OPTIMIZE TABLE ${DATABASE_NAME}.import_data FINAL`,
      `OPTIMIZE TABLE ${DATABASE_NAME}.import_monthly_agg FINAL`,
      `OPTIMIZE TABLE ${DATABASE_NAME}.import_buyer_agg FINAL`,
      `OPTIMIZE TABLE ${DATABASE_NAME}.import_supplier_agg FINAL`,
      `OPTIMIZE TABLE ${DATABASE_NAME}.import_product_agg FINAL`,
      `OPTIMIZE TABLE ${DATABASE_NAME}.import_country_agg FINAL`,
      `OPTIMIZE TABLE ${DATABASE_NAME}.import_duty_agg FINAL`
    ];
    
    for (const query of optimizeQueries) {
      try {
        await clickhouse.command({ query });
        console.log(`✓ Optimized table: ${query.split('.')[1]?.split(' ')[0]}`);
      } catch (error) {
        console.log(`⚠ Optimization skipped: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('Error creating optimization indexes:', error);
  }
}

/**
 * Show performance comparison
 */
async function showPerformanceComparison() {
  try {
    console.log('\n📈 Performance Comparison:');
    console.log('=========================');
    
    // Test query performance
    const testQueries = [
      {
        name: 'Top 10 Buyers (Aggregated)',
        query: `
          SELECT buyer, sum(total_value_usd) as value
          FROM ${DATABASE_NAME}.export_buyer_agg
          WHERE year = 2023
          GROUP BY buyer
          ORDER BY value DESC
          LIMIT 10
        `
      },
      {
        name: 'Monthly Trends (Aggregated)',
        query: `
          SELECT yearMonth, sum(total_value_usd) as value
          FROM ${DATABASE_NAME}.export_monthly_agg
          WHERE year BETWEEN 2022 AND 2023
          GROUP BY yearMonth
          ORDER BY yearMonth
        `
      }
    ];
    
    for (const test of testQueries) {
      try {
        const startTime = Date.now();
        const result = await clickhouse.query({ query: test.query });
        const data = await result.json();
        const endTime = Date.now();
        
        console.log(`${test.name}: ${endTime - startTime}ms (${data.data.length} records)`);
      } catch (error) {
        console.log(`${test.name}: Query failed - ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('Error in performance comparison:', error);
  }
}

// Run the initialization if this script is executed directly
if (require.main === module) {
  initializeAggregations()
    .then(() => showPerformanceComparison())
    .then(() => {
      console.log('\n🎉 Ready to use fast analytics!');
      console.log('📋 New API endpoints available:');
      console.log('   GET /api/data/analytics/dashboard');
      console.log('   GET /api/data/analytics/buyers');
      console.log('   GET /api/data/analytics/suppliers');
      console.log('   GET /api/data/analytics/timeseries');
      console.log('   GET /api/data/analytics/aggregated');
      process.exit(0);
    })
    .catch(error => {
      console.error('Initialization failed:', error);
      process.exit(1);
    });
}

module.exports = {
  initializeAggregations,
  createOptimizationIndexes,
  showPerformanceComparison
}; 