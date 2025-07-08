#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { Sequelize, QueryTypes } = require('sequelize');
const { clickhouse, initClickHouse } = require('../config/clickhouse');
const sequelize = require('../config/db');
const { initClickHouseExport } = require('../models/clickhouse/export.model');
const { program } = require('commander');
const dotenv = require('dotenv');

dotenv.config();

// Configuration
const BATCH_SIZE = parseInt(process.env.MIGRATION_BATCH_SIZE) || 50000;
const PARALLEL_WORKERS = parseInt(process.env.MIGRATION_WORKERS) || 4;
const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'export_data';
const MYSQL_TABLE = 'ExportData';

// Progress tracking
let totalRecords = 0;
let processedRecords = 0;
let failedRecords = 0;
let startTime = Date.now();

/**
 * Enhanced data transformation with comprehensive error handling
 */
function transformRecord(record) {
  try {
    // Helper function to safely parse numbers
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

    // Helper function to safely format dates
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

    // Helper function to clean strings
    const cleanString = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/[\r\n\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 65535); // ClickHouse String limit
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
  } catch (error) {
    console.error('Error transforming record:', error);
    failedRecords++;
    return null;
  }
}

/**
 * Stream-based data processor for memory efficiency
 */
class DataProcessor extends Transform {
  constructor(options = {}) {
    super({ objectMode: true });
    this.batchSize = options.batchSize || BATCH_SIZE;
    this.batch = [];
    this.batchCount = 0;
  }

  _transform(chunk, encoding, callback) {
    const transformedRecord = transformRecord(chunk);
    if (transformedRecord) {
      this.batch.push(transformedRecord);
    }

    if (this.batch.length >= this.batchSize) {
      this.push(this.batch);
      this.batch = [];
      this.batchCount++;
    }

    callback();
  }

  _flush(callback) {
    if (this.batch.length > 0) {
      this.push(this.batch);
      this.batchCount++;
    }
    callback();
  }
}

/**
 * Optimized MySQL data reader with streaming
 */
async function* readMySQLData(offset = 0, limit = BATCH_SIZE) {
  let currentOffset = offset;
  
  while (true) {
    try {
      const query = `
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
        FROM ${MYSQL_TABLE}
        ORDER BY id
        LIMIT ${limit} OFFSET ${currentOffset}
      `;

      const records = await sequelize.query(query, {
        type: QueryTypes.SELECT,
        raw: true,
        logging: false
      });

      if (records.length === 0) {
        break;
      }

      for (const record of records) {
        yield record;
      }

      currentOffset += records.length;
      processedRecords += records.length;

      // Progress reporting
      const progress = ((processedRecords / totalRecords) * 100).toFixed(2);
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processedRecords / elapsed;
      const eta = totalRecords > processedRecords ? (totalRecords - processedRecords) / rate : 0;

      console.log(`Progress: ${progress}% (${processedRecords.toLocaleString()}/${totalRecords.toLocaleString()}) | Rate: ${rate.toFixed(0)} records/sec | ETA: ${Math.round(eta)}s`);

      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 10));

    } catch (error) {
      console.error('Error reading MySQL data:', error);
      throw error;
    }
  }
}

/**
 * Optimized ClickHouse batch inserter
 */
async function insertBatchToClickHouse(batch) {
  try {
    if (!batch || batch.length === 0) return;

    const insertQuery = `
      INSERT INTO ${DATABASE_NAME}.${TABLE_NAME} (
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
      ) VALUES
    `;

    await clickhouse.insert({
      table: `${DATABASE_NAME}.${TABLE_NAME}`,
      values: batch,
      format: 'JSONEachRow'
    });

    console.log(`✓ Inserted batch of ${batch.length} records`);
  } catch (error) {
    console.error('Error inserting batch to ClickHouse:', error);
    console.error('Batch sample:', JSON.stringify(batch[0], null, 2));
    throw error;
  }
}

/**
 * Parallel processing manager
 */
async function processDataParallel() {
  const processor = new DataProcessor({ batchSize: BATCH_SIZE });
  const batches = [];

  // Transform data into batches
  for await (const record of readMySQLData()) {
    processor.write(record);
  }
  processor.end();

  // Collect all batches
  for await (const batch of processor) {
    batches.push(batch);
  }

  console.log(`\nProcessed ${batches.length} batches. Starting parallel insertion...`);

  // Process batches in parallel with limited concurrency
  const workers = [];
  for (let i = 0; i < batches.length; i += PARALLEL_WORKERS) {
    const batchSlice = batches.slice(i, i + PARALLEL_WORKERS);
    const workerPromises = batchSlice.map(batch => insertBatchToClickHouse(batch));
    workers.push(Promise.all(workerPromises));
  }

  await Promise.all(workers);
}

/**
 * Migration health check
 */
async function performHealthCheck() {
  try {
    console.log('\n🔍 Performing health check...');

    // Check MySQL connection
    await sequelize.authenticate();
    console.log('✓ MySQL connection successful');

    // Check ClickHouse connection
    const clickhouseReady = await initClickHouse();
    if (!clickhouseReady) {
      throw new Error('ClickHouse connection failed');
    }
    console.log('✓ ClickHouse connection successful');

    // Get MySQL record count
    const mysqlCount = await sequelize.query(
      `SELECT COUNT(*) as count FROM ${MYSQL_TABLE}`,
      { type: QueryTypes.SELECT }
    );
    totalRecords = mysqlCount[0].count;
    console.log(`✓ MySQL records: ${totalRecords.toLocaleString()}`);

    // Check ClickHouse record count
    const clickhouseCount = await clickhouse.query({
      query: `SELECT COUNT(*) as count FROM ${DATABASE_NAME}.${TABLE_NAME}`,
    }).exec();
    console.log(`✓ ClickHouse records: ${clickhouseCount[0].count.toLocaleString()}`);

    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error);
    return false;
  }
}

/**
 * Clean up and optimize tables after migration
 */
async function optimizeTables() {
  try {
    console.log('\n🔧 Optimizing tables...');

    // Optimize main table
    await clickhouse.command({
      query: `OPTIMIZE TABLE ${DATABASE_NAME}.${TABLE_NAME} FINAL`
    });
    console.log('✓ Main table optimized');

    // Create additional indexes
    const indexes = [
      `ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME} ADD INDEX IF NOT EXISTS idx_buyer buyer TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME} ADD INDEX IF NOT EXISTS idx_supplier supplier TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME} ADD INDEX IF NOT EXISTS idx_product productName TYPE minmax GRANULARITY 1`,
      `ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME} ADD INDEX IF NOT EXISTS idx_country buyerCountry TYPE minmax GRANULARITY 1`
    ];

    for (const indexQuery of indexes) {
      try {
        await clickhouse.command({ query: indexQuery });
        console.log(`✓ Created index: ${indexQuery.match(/idx_\w+/)[0]}`);
      } catch (error) {
        console.log(`⚠ Index creation skipped: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('Error optimizing tables:', error);
  }
}

/**
 * Migration statistics and summary
 */
async function printMigrationSummary() {
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  const rate = processedRecords / duration;

  console.log('\n📊 Migration Summary');
  console.log('==================');
  console.log(`Total Records: ${totalRecords.toLocaleString()}`);
  console.log(`Processed Records: ${processedRecords.toLocaleString()}`);
  console.log(`Failed Records: ${failedRecords.toLocaleString()}`);
  console.log(`Success Rate: ${(((processedRecords - failedRecords) / processedRecords) * 100).toFixed(2)}%`);
  console.log(`Duration: ${Math.round(duration)}s`);
  console.log(`Average Rate: ${Math.round(rate)} records/sec`);
  console.log(`Peak Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

  // Verify final counts
  try {
    const finalCount = await clickhouse.query({
      query: `SELECT COUNT(*) as count FROM ${DATABASE_NAME}.${TABLE_NAME}`,
    }).exec();
    console.log(`Final ClickHouse Records: ${finalCount[0].count.toLocaleString()}`);
  } catch (error) {
    console.error('Error getting final count:', error);
  }
}

/**
 * Main migration function
 */
async function migrateData(options = {}) {
  try {
    console.log('🚀 Starting MySQL to ClickHouse Migration');
    console.log('=========================================');

    // Health check
    const healthOk = await performHealthCheck();
    if (!healthOk) {
      console.error('❌ Migration aborted due to health check failure');
      return;
    }

    // Initialize ClickHouse tables
    console.log('\n📋 Initializing ClickHouse tables...');
    await initClickHouseExport();
    console.log('✓ ClickHouse tables initialized');

    // Clear existing data if requested
    if (options.clearExisting) {
      console.log('\n🗑️ Clearing existing data...');
      await clickhouse.command({
        query: `TRUNCATE TABLE ${DATABASE_NAME}.${TABLE_NAME}`
      });
      console.log('✓ Existing data cleared');
    }

    // Start migration
    console.log('\n📦 Starting data migration...');
    startTime = Date.now();
    
    await processDataParallel();

    // Post-migration optimization
    await optimizeTables();

    // Print summary
    await printMigrationSummary();

    console.log('\n🎉 Migration completed successfully!');
    console.log('You can now use the fast analytics endpoints.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

/**
 * CLI Interface
 */
program
  .name('mysql-to-clickhouse-migration')
  .description('Migrate pharmaceutical data from MySQL to ClickHouse')
  .version('1.0.0')
  .option('-c, --clear', 'Clear existing ClickHouse data before migration')
  .option('-b, --batch-size <size>', 'Batch size for processing', BATCH_SIZE)
  .option('-w, --workers <count>', 'Number of parallel workers', PARALLEL_WORKERS)
  .option('--dry-run', 'Perform a dry run without actual migration')
  .action(async (options) => {
    if (options.batchSize) {
      global.BATCH_SIZE = parseInt(options.batchSize);
    }
    if (options.workers) {
      global.PARALLEL_WORKERS = parseInt(options.workers);
    }

    if (options.dryRun) {
      console.log('🔍 Dry run mode - performing health check only');
      await performHealthCheck();
      return;
    }

    await migrateData({
      clearExisting: options.clear
    });
  });

// Handle process termination gracefully
process.on('SIGINT', async () => {
  console.log('\n⚠️ Migration interrupted by user');
  await printMigrationSummary();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the CLI
if (require.main === module) {
  program.parse();
}

module.exports = {
  migrateData,
  transformRecord,
  performHealthCheck
}; 