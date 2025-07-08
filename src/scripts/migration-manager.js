#!/usr/bin/env node

const { program } = require('commander');
const { Sequelize, QueryTypes } = require('sequelize');
const { clickhouse, initClickHouse } = require('../config/clickhouse');
const sequelize = require('../config/db');
const { initClickHouseExport, populateAggregationTables } = require('../models/clickhouse/export.model');
const { migrateImportData } = require('./migrate-import-data');
const dotenv = require('dotenv');

dotenv.config();

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';

/**
 * Migration status and monitoring
 */
class MigrationMonitor {
  constructor() {
    this.startTime = Date.now();
    this.stats = {
      totalRecords: 0,
      processedRecords: 0,
      failedRecords: 0,
      currentTable: '',
      phase: 'initializing'
    };
  }

  updateStats(updates) {
    Object.assign(this.stats, updates);
  }

  getProgress() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = this.stats.processedRecords / elapsed;
    const progress = this.stats.totalRecords > 0 ? 
      ((this.stats.processedRecords / this.stats.totalRecords) * 100).toFixed(2) : 0;
    const eta = this.stats.totalRecords > this.stats.processedRecords ? 
      (this.stats.totalRecords - this.stats.processedRecords) / rate : 0;

    return {
      progress: `${progress}%`,
      processed: this.stats.processedRecords.toLocaleString(),
      total: this.stats.totalRecords.toLocaleString(),
      rate: `${Math.round(rate)} records/sec`,
      eta: `${Math.round(eta)}s`,
      elapsed: `${Math.round(elapsed)}s`,
      phase: this.stats.phase,
      table: this.stats.currentTable
    };
  }

  printProgress() {
    const progress = this.getProgress();
    console.log(`📊 ${progress.phase} | ${progress.table} | ${progress.progress} (${progress.processed}/${progress.total}) | ${progress.rate} | ETA: ${progress.eta}`);
  }
}

/**
 * Check database connectivity and status
 */
async function checkDatabaseStatus() {
  try {
    console.log('🔍 Checking database connectivity...');

    // Test MySQL connection
    await sequelize.authenticate();
    console.log('✓ MySQL connection successful');

    // Test ClickHouse connection
    const clickhouseReady = await initClickHouse();
    if (!clickhouseReady) {
      throw new Error('ClickHouse connection failed');
    }
    console.log('✓ ClickHouse connection successful');

    // Get table counts
    const exportCount = await sequelize.query(
      'SELECT COUNT(*) as count FROM ExportData',
      { type: QueryTypes.SELECT }
    );

    const importCount = await sequelize.query(
      'SELECT COUNT(*) as count FROM ImportData',
      { type: QueryTypes.SELECT }
    );

    console.log('\n📋 Database Status:');
    console.log(`   MySQL Export Records: ${exportCount[0].count.toLocaleString()}`);
    console.log(`   MySQL Import Records: ${importCount[0].count.toLocaleString()}`);

    // Check ClickHouse tables
    try {
      const chExportCount = await clickhouse.query({
        query: `SELECT COUNT(*) as count FROM ${DATABASE_NAME}.export_data`
      }).exec();
      console.log(`   ClickHouse Export Records: ${chExportCount[0].count.toLocaleString()}`);
    } catch (e) {
      console.log('   ClickHouse Export Records: Table not found');
    }

    try {
      const chImportCount = await clickhouse.query({
        query: `SELECT COUNT(*) as count FROM ${DATABASE_NAME}.import_data`
      }).exec();
      console.log(`   ClickHouse Import Records: ${chImportCount[0].count.toLocaleString()}`);
    } catch (e) {
      console.log('   ClickHouse Import Records: Table not found');
    }

    return {
      exportRecords: exportCount[0].count,
      importRecords: importCount[0].count
    };

  } catch (error) {
    console.error('❌ Database connectivity check failed:', error);
    throw error;
  }
}

/**
 * Optimized export data migration
 */
async function migrateExportData(options = {}) {
  const monitor = new MigrationMonitor();
  
  try {
    console.log('\n🚀 Starting Export Data Migration');
    console.log('=================================');

    monitor.updateStats({ phase: 'initializing', currentTable: 'export_data' });

    // Initialize tables
    await initClickHouseExport();
    console.log('✓ ClickHouse export tables initialized');

    // Clear existing data if requested
    if (options.clearExisting) {
      await clickhouse.command({
        query: `TRUNCATE TABLE ${DATABASE_NAME}.export_data`
      });
      console.log('✓ Existing export data cleared');
    }

    // Get total count
    const totalResult = await sequelize.query(
      'SELECT COUNT(*) as count FROM ExportData',
      { type: QueryTypes.SELECT }
    );
    const totalRecords = totalResult[0].count;
    monitor.updateStats({ totalRecords, phase: 'migrating' });

    console.log(`Total export records to migrate: ${totalRecords.toLocaleString()}`);

    const batchSize = options.batchSize || 50000;
    let processedRecords = 0;
    let offset = 0;

    while (offset < totalRecords) {
      // Fetch batch
      const records = await sequelize.query(`
        SELECT 
          id, informationOf, yearMonth, year, portOfOrigin, modeOfShipment,
          indianPortCode, shippingBillDate, shippingBillNumber, shippingBillStatus,
          invoiceNumber, itemNumber, H_S_Code, productDescription, productName,
          CAS_Number, quantity, quantityUnit, standardQuantity, standardQuantityUnit,
          standardUnitRateINR, standardUnitRateUSD, itemRateINR, itemRateUSD,
          totalValueINR, totalValueUSD, itemRateInvoice, currency, totalValueInvoice,
          freightOnBoardINR, freightOnBoardUSD, importExportCode, supplier,
          supplierRaw, supplierAddress, supplierCity, supplierCountry,
          buyer, buyerRaw, companyStatus, portOfDeparture, buyerCountry,
          region, createdAt, updatedAt
        FROM ExportData
        ORDER BY id
        LIMIT ${batchSize} OFFSET ${offset}
      `, { type: QueryTypes.SELECT });

      if (records.length === 0) break;

      // Transform and insert
      const transformedRecords = records.map(record => transformExportRecord(record));
      
      await clickhouse.insert({
        table: `${DATABASE_NAME}.export_data`,
        values: transformedRecords,
        format: 'JSONEachRow'
      });

      processedRecords += records.length;
      offset += batchSize;

      monitor.updateStats({ processedRecords });
      monitor.printProgress();
    }

    monitor.updateStats({ phase: 'completed' });
    console.log('\n✅ Export data migration completed successfully!');
    return processedRecords;

  } catch (error) {
    console.error('❌ Export migration failed:', error);
    throw error;
  }
}

/**
 * Transform export record for ClickHouse
 */
function transformExportRecord(record) {
  const safeParseFloat = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  const safeParseInt = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = parseInt(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '1970-01-01';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '1970-01-01';
      return date.toISOString().split('T')[0];
    } catch (e) {
      return '1970-01-01';
    }
  };

  const cleanString = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/[\r\n\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 65535);
  };

  return {
    id: String(record.id || 0),
    informationOf: cleanString(record.informationOf),
    yearMonth: cleanString(record.yearMonth),
    year: safeParseInt(record.year),
    portOfOrigin: cleanString(record.portOfOrigin),
    modeOfShipment: cleanString(record.modeOfShipment),
    indianPortCode: cleanString(record.indianPortCode),
    shippingBillDate: formatDate(record.shippingBillDate),
    shippingBillNumber: cleanString(record.shippingBillNumber),
    shippingBillStatus: cleanString(record.shippingBillStatus),
    invoiceNumber: cleanString(record.invoiceNumber),
    itemNumber: cleanString(record.itemNumber),
    H_S_Code: cleanString(record.H_S_Code),
    productDescription: cleanString(record.productDescription),
    productName: cleanString(record.productName),
    CAS_Number: cleanString(record.CAS_Number),
    quantity: safeParseFloat(record.quantity),
    quantityUnit: cleanString(record.quantityUnit),
    standardQuantity: safeParseFloat(record.standardQuantity),
    standardQuantityUnit: cleanString(record.standardQuantityUnit),
    standardUnitRateINR: safeParseFloat(record.standardUnitRateINR),
    standardUnitRateUSD: safeParseFloat(record.standardUnitRateUSD),
    itemRateINR: safeParseFloat(record.itemRateINR),
    itemRateUSD: safeParseFloat(record.itemRateUSD),
    totalValueINR: safeParseFloat(record.totalValueINR),
    totalValueUSD: safeParseFloat(record.totalValueUSD),
    itemRateInvoice: safeParseFloat(record.itemRateInvoice),
    currency: cleanString(record.currency),
    totalValueInvoice: safeParseFloat(record.totalValueInvoice),
    freightOnBoardINR: safeParseFloat(record.freightOnBoardINR),
    freightOnBoardUSD: safeParseFloat(record.freightOnBoardUSD),
    importExportCode: cleanString(record.importExportCode),
    supplier: cleanString(record.supplier),
    supplierRaw: cleanString(record.supplierRaw),
    supplierAddress: cleanString(record.supplierAddress),
    supplierCity: cleanString(record.supplierCity),
    supplierCountry: cleanString(record.supplierCountry),
    buyer: cleanString(record.buyer),
    buyerRaw: cleanString(record.buyerRaw),
    companyStatus: cleanString(record.companyStatus),
    portOfDeparture: cleanString(record.portOfDeparture),
    buyerCountry: cleanString(record.buyerCountry),
    region: cleanString(record.region),
    createdAt: record.createdAt ? new Date(record.createdAt).toISOString().replace('T', ' ').substring(0, 19) : new Date().toISOString().replace('T', ' ').substring(0, 19),
    updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString().replace('T', ' ').substring(0, 19) : new Date().toISOString().replace('T', ' ').substring(0, 19)
  };
}

/**
 * Complete migration workflow
 */
async function runFullMigration(options = {}) {
  try {
    console.log('🎯 Starting Complete Migration Workflow');
    console.log('======================================');

    const startTime = Date.now();

    // Check database status
    const dbStatus = await checkDatabaseStatus();

    // Migrate export data
    if (dbStatus.exportRecords > 0) {
      await migrateExportData(options);
    } else {
      console.log('⚠️ No export data found to migrate');
    }

    // Migrate import data
    if (dbStatus.importRecords > 0) {
      await migrateImportData();
    } else {
      console.log('⚠️ No import data found to migrate');
    }

    // Populate aggregation tables
    if (dbStatus.exportRecords > 0) {
      console.log('\n📊 Populating aggregation tables...');
      await populateAggregationTables();
      console.log('✅ Aggregation tables populated');
    }

    // Optimize tables
    console.log('\n🔧 Optimizing ClickHouse tables...');
    await optimizeClickHouseTables();

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log('\n🎉 Complete Migration Workflow Finished!');
    console.log(`⏱️ Total Duration: ${Math.round(duration)}s`);
    console.log('📋 Next Steps:');
    console.log('   1. Test the new analytics endpoints');
    console.log('   2. Monitor performance improvements');
    console.log('   3. Set up regular aggregation updates');

  } catch (error) {
    console.error('❌ Full migration failed:', error);
    throw error;
  }
}

/**
 * Optimize ClickHouse tables after migration
 */
async function optimizeClickHouseTables() {
  try {
    const tables = ['export_data', 'import_data'];
    
    for (const table of tables) {
      try {
        await clickhouse.command({
          query: `OPTIMIZE TABLE ${DATABASE_NAME}.${table} FINAL`
        });
        console.log(`✓ Optimized ${table}`);
      } catch (e) {
        console.log(`⚠️ Could not optimize ${table}: ${e.message}`);
      }
    }
  } catch (error) {
    console.error('Error optimizing tables:', error);
  }
}

/**
 * Verify migration integrity
 */
async function verifyMigration() {
  try {
    console.log('🔍 Verifying Migration Integrity');
    console.log('===============================');

    // Count records in both databases
    const mysqlExportCount = await sequelize.query(
      'SELECT COUNT(*) as count FROM ExportData',
      { type: QueryTypes.SELECT }
    );

    const mysqlImportCount = await sequelize.query(
      'SELECT COUNT(*) as count FROM ImportData',
      { type: QueryTypes.SELECT }
    );

    const chExportCount = await clickhouse.query({
      query: `SELECT COUNT(*) as count FROM ${DATABASE_NAME}.export_data`
    }).exec();

    const chImportCount = await clickhouse.query({
      query: `SELECT COUNT(*) as count FROM ${DATABASE_NAME}.import_data`
    }).exec();

    console.log('\n📊 Record Count Comparison:');
    console.log(`Export Data: MySQL ${mysqlExportCount[0].count.toLocaleString()} → ClickHouse ${chExportCount[0].count.toLocaleString()}`);
    console.log(`Import Data: MySQL ${mysqlImportCount[0].count.toLocaleString()} → ClickHouse ${chImportCount[0].count.toLocaleString()}`);

    // Verify data integrity with sample checks
    const sampleCheck = await clickhouse.query({
      query: `
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT buyer) as unique_buyers,
          COUNT(DISTINCT supplier) as unique_suppliers,
          SUM(totalValueUSD) as total_value
        FROM ${DATABASE_NAME}.export_data
      `
    }).exec();

    console.log('\n🔬 Data Integrity Check:');
    console.log(`Total Records: ${sampleCheck[0].total_records.toLocaleString()}`);
    console.log(`Unique Buyers: ${sampleCheck[0].unique_buyers.toLocaleString()}`);
    console.log(`Unique Suppliers: ${sampleCheck[0].unique_suppliers.toLocaleString()}`);
    console.log(`Total Value USD: $${parseFloat(sampleCheck[0].total_value).toLocaleString()}`);

    const exportMatch = mysqlExportCount[0].count === parseInt(chExportCount[0].count);
    const importMatch = mysqlImportCount[0].count === parseInt(chImportCount[0].count);

    if (exportMatch && importMatch) {
      console.log('\n✅ Migration verification passed!');
    } else {
      console.log('\n⚠️ Migration verification found discrepancies!');
    }

  } catch (error) {
    console.error('❌ Migration verification failed:', error);
  }
}

// CLI Commands
program
  .name('migration-manager')
  .description('Comprehensive MySQL to ClickHouse migration tool')
  .version('1.0.0');

program
  .command('status')
  .description('Check database connectivity and record counts')
  .action(checkDatabaseStatus);

program
  .command('migrate-export')
  .description('Migrate export data only')
  .option('-c, --clear', 'Clear existing data before migration')
  .option('-b, --batch-size <size>', 'Batch size for processing', '50000')
  .action((options) => migrateExportData(options));

program
  .command('migrate-import')
  .description('Migrate import data only')
  .action(migrateImportData);

program
  .command('migrate-all')
  .description('Run complete migration workflow')
  .option('-c, --clear', 'Clear existing data before migration')
  .option('-b, --batch-size <size>', 'Batch size for processing', '50000')
  .action(runFullMigration);

program
  .command('verify')
  .description('Verify migration integrity')
  .action(verifyMigration);

program
  .command('optimize')
  .description('Optimize ClickHouse tables')
  .action(optimizeClickHouseTables);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⚠️ Migration interrupted by user');
  process.exit(0);
});

if (require.main === module) {
  program.parse();
}

module.exports = {
  checkDatabaseStatus,
  migrateExportData,
  runFullMigration,
  verifyMigration,
  optimizeClickHouseTables
}; 