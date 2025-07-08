#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
const { Sequelize } = require('sequelize');
const { clickhouse, initClickHouse } = require('../config/clickhouse');
const sequelize = require('../config/db');
const ExportModel = require('../models/export.model');
const { initClickHouseExport } = require('../models/clickhouse/export.model');
const dotenv = require('dotenv');

dotenv.config();

// Configuration
const BATCH_SIZE = 10000;
const CSV_DIR = path.join(__dirname, '../../temp');
const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'export_data';

// Ensure temp directory exists
if (!fs.existsSync(CSV_DIR)) {
  fs.mkdirSync(CSV_DIR, { recursive: true });
}

/**
 * Convert MySQL date string to ClickHouse compatible date format
 */
function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    // Parse the date string and format it as YYYY-MM-DD HH:MM:SS
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace('T', ' ');
  } catch (e) {
    return null;
  }
}

/**
 * Process data in batches and write to CSV
 */
async function processBatch(offset, limit, csvWriter) {
  console.log(`Processing batch: offset=${offset}, limit=${limit}`);
  
  try {
    // Fetch data from MySQL
    const records = await ExportModel.findAll({
      offset,
      limit,
      raw: true,
      logging: false
    });
    
    if (records.length === 0) {
      console.log('No more records to process');
      return 0;
    }
    
    // Transform data for ClickHouse compatibility
    const transformedRecords = records.map(record => {
      return {
        id: record.id || 0,
        informationOf: record.informationOf || '',
        yearMonth: record.yearMonth || '',
        year: record.year || '',
        portOfOrigin: record.portOfOrigin || '',
        modeOfShipment: record.modeOfShipment || '',
        indianPortCode: record.indianPortCode || '',
        shippingBillDate: formatDate(record.shippingBillDate) || '2020-01-01 00:00:00',
        shippingBillNumber: parseInt(record.shippingBillNumber) || 0,
        shippingBillStatus: record.shippingBillStatus || '',
        invoiceNumber: record.invoiceNumber || '',
        itemNumber: record.itemNumber || '',
        H_S_Code: parseInt(record.H_S_Code) || 0,
        productDescription: record.productDescription || '',
        productName: record.productName || '',
        CAS_Number: record.CAS_Number || '',
        quantity: parseFloat(record.quantity) || 0,
        quantityUnit: record.quantityUnit || '',
        standardQuantity: parseFloat(record.standardQuantity) || 0,
        standardQuantityUnit: record.standardQuantityUnit || '',
        standardUnitRateINR: parseFloat(record.standardUnitRateINR) || 0,
        standardUnitRateUSD: parseFloat(record.standardUnitRateUSD) || 0,
        itemRateINR: parseFloat(record.itemRateINR) || 0,
        itemRateUSD: parseFloat(record.itemRateUSD) || 0,
        totalValueINR: parseFloat(record.totalValueINR) || 0,
        totalValueUSD: parseFloat(record.totalValueUSD) || 0,
        itemRateInvoice: record.itemRateInvoice || '',
        currency: record.currency || '',
        totalValueInvoice: parseFloat(record.totalValueInvoice) || 0,
        freightOnBoardINR: parseFloat(record.freightOnBoardINR) || 0,
        freightOnBoardUSD: parseFloat(record.freightOnBoardUSD) || 0,
        importExportCode: record.importExportCode || '',
        supplier: record.supplier || '',
        supplierRaw: record.supplierRaw || '',
        supplierAddress: record.supplierAddress || '',
        supplierCity: record.supplierCity || '',
        supplierCountry: record.supplierCountry || '',
        buyer: record.buyer || '',
        buyerRaw: record.buyerRaw || '',
        companyStatus: record.companyStatus || '',
        portOfDeparture: record.portOfDeparture || '',
        buyerCountry: record.buyerCountry || '',
        region: record.region || '',
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };
    });
    
    // Write to CSV
    await csvWriter.writeRecords(transformedRecords);
    
    return records.length;
  } catch (error) {
    console.error('Error processing batch:', error);
    return 0;
  }
}

/**
 * Import CSV file to ClickHouse
 */
async function importCsvToClickHouse(csvFilePath) {
  try {
    console.log(`Importing CSV to ClickHouse: ${csvFilePath}`);
    
    const query = `
      INSERT INTO ${DATABASE_NAME}.${TABLE_NAME}
      FORMAT CSVWithNames
    `;
    
    const content = fs.readFileSync(csvFilePath, 'utf8');
    
    await clickhouse.query(query).upload(fs.createReadStream(csvFilePath));
    
    console.log('CSV import completed successfully');
    return true;
  } catch (error) {
    console.error('Error importing CSV to ClickHouse:', error);
    return false;
  }
}

/**
 * Main migration function
 */
async function migrateData() {
  try {
    console.log('Starting MySQL to ClickHouse migration...');
    
    // Initialize ClickHouse connection and create tables
    const clickhouseReady = await initClickHouse();
    if (!clickhouseReady) {
      console.error('Failed to initialize ClickHouse connection');
      return;
    }
    
    // Create ClickHouse tables and views
    await initClickHouseExport();
    
    // Count total records
    const totalRecords = await ExportModel.count();
    console.log(`Total records to migrate: ${totalRecords}`);
    
    // Create CSV writer
    const csvFilePath = path.join(CSV_DIR, `export_data_${Date.now()}.csv`);
    const csvWriter = createObjectCsvWriter({
      path: csvFilePath,
      header: [
        { id: 'id', title: 'id' },
        { id: 'informationOf', title: 'informationOf' },
        { id: 'yearMonth', title: 'yearMonth' },
        { id: 'year', title: 'year' },
        { id: 'portOfOrigin', title: 'portOfOrigin' },
        { id: 'modeOfShipment', title: 'modeOfShipment' },
        { id: 'indianPortCode', title: 'indianPortCode' },
        { id: 'shippingBillDate', title: 'shippingBillDate' },
        { id: 'shippingBillNumber', title: 'shippingBillNumber' },
        { id: 'shippingBillStatus', title: 'shippingBillStatus' },
        { id: 'invoiceNumber', title: 'invoiceNumber' },
        { id: 'itemNumber', title: 'itemNumber' },
        { id: 'H_S_Code', title: 'H_S_Code' },
        { id: 'productDescription', title: 'productDescription' },
        { id: 'productName', title: 'productName' },
        { id: 'CAS_Number', title: 'CAS_Number' },
        { id: 'quantity', title: 'quantity' },
        { id: 'quantityUnit', title: 'quantityUnit' },
        { id: 'standardQuantity', title: 'standardQuantity' },
        { id: 'standardQuantityUnit', title: 'standardQuantityUnit' },
        { id: 'standardUnitRateINR', title: 'standardUnitRateINR' },
        { id: 'standardUnitRateUSD', title: 'standardUnitRateUSD' },
        { id: 'itemRateINR', title: 'itemRateINR' },
        { id: 'itemRateUSD', title: 'itemRateUSD' },
        { id: 'totalValueINR', title: 'totalValueINR' },
        { id: 'totalValueUSD', title: 'totalValueUSD' },
        { id: 'itemRateInvoice', title: 'itemRateInvoice' },
        { id: 'currency', title: 'currency' },
        { id: 'totalValueInvoice', title: 'totalValueInvoice' },
        { id: 'freightOnBoardINR', title: 'freightOnBoardINR' },
        { id: 'freightOnBoardUSD', title: 'freightOnBoardUSD' },
        { id: 'importExportCode', title: 'importExportCode' },
        { id: 'supplier', title: 'supplier' },
        { id: 'supplierRaw', title: 'supplierRaw' },
        { id: 'supplierAddress', title: 'supplierAddress' },
        { id: 'supplierCity', title: 'supplierCity' },
        { id: 'supplierCountry', title: 'supplierCountry' },
        { id: 'buyer', title: 'buyer' },
        { id: 'buyerRaw', title: 'buyerRaw' },
        { id: 'companyStatus', title: 'companyStatus' },
        { id: 'portOfDeparture', title: 'portOfDeparture' },
        { id: 'buyerCountry', title: 'buyerCountry' },
        { id: 'region', title: 'region' },
        { id: 'created_at', title: 'created_at' }
      ]
    });
    
    // Process data in batches
    let offset = 0;
    let processedRecords = 0;
    
    while (true) {
      const batchCount = await processBatch(offset, BATCH_SIZE, csvWriter);
      if (batchCount === 0) break;
      
      processedRecords += batchCount;
      offset += BATCH_SIZE;
      
      console.log(`Progress: ${processedRecords}/${totalRecords} records (${Math.round(processedRecords / totalRecords * 100)}%)`);
      
      // If we've processed a large chunk, import to ClickHouse and create a new CSV
      if (processedRecords % (BATCH_SIZE * 10) === 0) {
        await importCsvToClickHouse(csvFilePath);
        
        // Create a new CSV writer for the next batch
        const newCsvFilePath = path.join(CSV_DIR, `export_data_${Date.now()}.csv`);
        csvWriter = createObjectCsvWriter({
          path: newCsvFilePath,
          header: csvWriter.header
        });
      }
    }
    
    // Import final batch to ClickHouse
    await importCsvToClickHouse(csvFilePath);
    
    console.log(`Migration completed. ${processedRecords} records migrated to ClickHouse.`);
    
    // Clean up
    fs.unlinkSync(csvFilePath);
    console.log('Temporary CSV file deleted');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    // Close connections
    await sequelize.close();
    console.log('MySQL connection closed');
  }
}

// Run the migration
migrateData().then(() => {
  console.log('Migration script completed');
  process.exit(0);
}).catch(err => {
  console.error('Migration script failed:', err);
  process.exit(1);
}); 