#!/usr/bin/env node

const { Sequelize, QueryTypes } = require('sequelize');
const { clickhouse, initClickHouse } = require('../config/clickhouse');
const sequelize = require('../config/db');
const { program } = require('commander');
const dotenv = require('dotenv');

dotenv.config();

const BATCH_SIZE = 50000;
const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const MYSQL_TABLE = 'ImportData';

/**
 * Create ClickHouse Import table
 */
async function createImportTable() {
  try {
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.import_data (
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
    console.log('✓ Import table created successfully');
  } catch (error) {
    console.error('Error creating import table:', error);
    throw error;
  }
}

/**
 * Transform import record
 */
function transformImportRecord(record) {
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
    shippingEntryType: cleanString(record.shippingEntryType),
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
    totalDutyPaidINR: safeParseFloat(record.totalDutyPaidINR),
    totalDutyPaidUSD: safeParseFloat(record.totalDutyPaidUSD),
    importExportCode: cleanString(record.importExportCode),
    supplier: cleanString(record.supplier),
    supplierStandardized: cleanString(record.supplierStandardized),
    supplierAddress: cleanString(record.supplierAddress),
    supplierCity: cleanString(record.supplierCity),
    supplierCountry: cleanString(record.supplierCountry),
    buyer: cleanString(record.buyer),
    buyerStandardized: cleanString(record.buyerStandardized),
    buyerAddress: cleanString(record.buyerAddress),
    buyerCity: cleanString(record.buyerCity),
    buyerPin: cleanString(record.buyerPin),
    buyerState: cleanString(record.buyerState),
    buyerStatus: cleanString(record.buyerStatus),
    buyerPhone: cleanString(record.buyerPhone),
    buyerEmail: cleanString(record.buyerEmail),
    director: cleanString(record.director),
    customHouseAgent: cleanString(record.customHouseAgent),
    portOfDeparture: cleanString(record.portOfDeparture),
    buyerCountry: cleanString(record.buyerCountry),
    region: cleanString(record.region),
    createdAt: record.createdAt ? new Date(record.createdAt).toISOString().replace('T', ' ').substring(0, 19) : new Date().toISOString().replace('T', ' ').substring(0, 19),
    updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString().replace('T', ' ').substring(0, 19) : new Date().toISOString().replace('T', ' ').substring(0, 19)
  };
}

/**
 * Migrate import data
 */
async function migrateImportData() {
  try {
    console.log('🚀 Starting Import Data Migration');
    console.log('================================');

    // Initialize ClickHouse
    const clickhouseReady = await initClickHouse();
    if (!clickhouseReady) {
      throw new Error('ClickHouse connection failed');
    }

    // Create table
    await createImportTable();

    // Get total count
    const totalResult = await sequelize.query(
      `SELECT COUNT(*) as count FROM ${MYSQL_TABLE}`,
      { type: QueryTypes.SELECT }
    );
    const totalRecords = totalResult[0].count;
    console.log(`Total records to migrate: ${totalRecords.toLocaleString()}`);

    let processedRecords = 0;
    let offset = 0;
    const startTime = Date.now();

    while (offset < totalRecords) {
      const records = await sequelize.query(`
        SELECT * FROM ${MYSQL_TABLE}
        ORDER BY id
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `, { type: QueryTypes.SELECT });

      if (records.length === 0) break;

      // Transform records
      const transformedRecords = records.map(transformImportRecord);

      // Insert to ClickHouse
      await clickhouse.insert({
        table: `${DATABASE_NAME}.import_data`,
        values: transformedRecords,
        format: 'JSONEachRow'
      });

      processedRecords += records.length;
      offset += BATCH_SIZE;

      const progress = ((processedRecords / totalRecords) * 100).toFixed(2);
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processedRecords / elapsed;

      console.log(`Progress: ${progress}% (${processedRecords.toLocaleString()}/${totalRecords.toLocaleString()}) | Rate: ${rate.toFixed(0)} records/sec`);
    }

    console.log('\n🎉 Import data migration completed successfully!');
    console.log(`Migrated ${processedRecords.toLocaleString()} records`);

  } catch (error) {
    console.error('❌ Import migration failed:', error);
    throw error;
  }
}

// CLI
program
  .name('import-data-migration')
  .description('Migrate import data from MySQL to ClickHouse')
  .action(migrateImportData);

if (require.main === module) {
  program.parse();
}

module.exports = { migrateImportData }; 