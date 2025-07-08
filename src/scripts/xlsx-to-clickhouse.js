#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const XLSX = require('xlsx');
const { clickhouse, initClickHouse } = require('../config/clickhouse');
const { initClickHouseExport } = require('../models/clickhouse/export.model');
const dotenv = require('dotenv');
const { Transform } = require('stream');
const { Readable } = require('stream');

dotenv.config();

// Configuration
const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'export_data';

// Configure command line options
program
  .version('1.0.0')
  .description('Import XLSX data into ClickHouse')
  .requiredOption('-f, --file <path>', 'Path to input XLSX file')
  .option('-s, --sheet <name>', 'Sheet name to import (defaults to first sheet)')
  .option('-b, --batch-size <number>', 'Number of rows per batch', 50000)
  .parse(process.argv);

const options = program.opts();

/**
 * Clean and validate data
 */
function cleanData(record) {
  const cleanedRecord = {};

  // Clean text fields
  const textFields = [
    'id', 'informationOf', 'yearMonth', 'portOfOrigin', 'modeOfShipment',
    'indianPortCode', 'shippingBillNumber', 'shippingBillStatus', 'invoiceNumber',
    'itemNumber', 'H_S_Code', 'productDescription', 'productName', 'CAS_Number',
    'quantityUnit', 'standardQuantityUnit', 'currency', 'importExportCode',
    'supplier', 'supplierRaw', 'supplierAddress', 'supplierCity', 'supplierCountry',
    'buyer', 'buyerRaw', 'companyStatus', 'portOfDeparture', 'buyerCountry', 'region'
  ];

  textFields.forEach(field => {
    if (field in record) {
      cleanedRecord[field] = record[field]
        ?.toString()
        .replace(/[\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || '';
    }
  });

  // Clean numeric fields
  const numericFields = [
    'quantity', 'standardQuantity', 'standardUnitRateINR', 'standardUnitRateUSD',
    'itemRateINR', 'itemRateUSD', 'totalValueINR', 'totalValueUSD',
    'itemRateInvoice', 'totalValueInvoice', 'freightOnBoardINR', 'freightOnBoardUSD'
  ];

  numericFields.forEach(field => {
    if (field in record) {
      const value = record[field]?.toString().trim() || '0';
      const cleanedValue = value.replace(/[^\d.-]/g, '');
      const num = parseFloat(cleanedValue);
      cleanedRecord[field] = isNaN(num) ? 0 : num;
    }
  });

  // Clean year
  if ('year' in record) {
    const yearValue = record.year?.toString().trim() || '';
    const year = parseInt(yearValue);
    cleanedRecord.year = !isNaN(year) ? year : 0;
  }

  // Clean dates
  if ('shippingBillDate' in record) {
    let dateValue = record.shippingBillDate;
    if (dateValue instanceof Date) {
      dateValue = dateValue.toISOString().split('T')[0];
    } else {
      dateValue = dateValue?.toString().trim() || '';
      dateValue = dateValue.split(' ')[0].trim();
    }
    cleanedRecord.shippingBillDate = /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : '1970-01-01';
  }

  ['createdAt', 'updatedAt'].forEach(field => {
    if (field in record) {
      let dateValue = record[field];
      if (dateValue instanceof Date) {
        dateValue = dateValue.toISOString().replace('T', ' ').split('.')[0];
      } else {
        dateValue = dateValue?.toString().trim() || '';
      }
      
      const [datePart, timePart] = dateValue.split(' ');
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && /^\d{2}:\d{2}:\d{2}$/.test(timePart)) {
        cleanedRecord[field] = `${datePart} ${timePart}`;
      } else {
        cleanedRecord[field] = '1970-01-01 00:00:00';
      }
    }
  });

  return cleanedRecord;
}

/**
 * Convert XLSX data to a readable stream
 */
function xlsxToStream(data) {
  return new Readable({
    objectMode: true,
    read() {
      if (data.length > 0) {
        this.push(data.shift());
      } else {
        this.push(null);
      }
    }
  });
}

/**
 * Import XLSX to ClickHouse
 */
async function importXLSX(filePath, sheetName = null, batchSize = 50000) {
  try {
    console.log(`Importing XLSX file: ${filePath}`);
    
    // Initialize ClickHouse
    const clickhouseReady = await initClickHouse();
    if (!clickhouseReady) {
      console.error('Failed to initialize ClickHouse connection');
      return false;
    }
    
    // Create tables and views
    await initClickHouseExport();
    
    // Read XLSX file
    const workbook = XLSX.readFile(filePath);
    const sheet = sheetName ? workbook.Sheets[sheetName] : workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      throw new Error(`Sheet ${sheetName || workbook.SheetNames[0]} not found`);
    }

    // Convert to JSON with headers
    const jsonData = XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: 'YYYY-MM-DD' });
    
    return new Promise((resolve, reject) => {
      // Create data stream
      const dataStream = xlsxToStream([...jsonData]);
      
      // Create transform stream for data cleaning
      const transformer = new Transform({
        objectMode: true,
        transform(record, encoding, callback) {
          try {
            const cleanedRecord = cleanData(record);
            // Convert to TSV line
            const values = Object.values(cleanedRecord);
            callback(null, values.join('\t') + '\n');
          } catch (error) {
            console.error('Error transforming record:', error);
            callback(null); // Skip problematic records
          }
        }
      });

      // Create a final transform stream to handle backpressure
      const finalTransform = new Transform({
        transform(chunk, encoding, callback) {
          callback(null, chunk);
        }
      });

      // Set up error handlers
      dataStream.on('error', reject);
      transformer.on('error', reject);
      finalTransform.on('error', reject);

      // Set up the pipeline
      dataStream
        .pipe(transformer)
        .pipe(finalTransform);

      // Import data
      clickhouse.insert({
        table: `${DATABASE_NAME}.${TABLE_NAME}`,
        values: finalTransform,
        format: 'TabSeparated',
        compression: false
      })
      .then(() => {
        console.log('Data import completed successfully');
        resolve(true);
      })
      .catch(reject);
    });
  } catch (error) {
    console.error('Error importing data:', error);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    const { file, sheet, batchSize } = options;
    
    // Validate file path
    if (!fs.existsSync(file)) {
      console.error(`File not found: ${file}`);
      process.exit(1);
    }
    
    // Import XLSX
    const success = await importXLSX(file, sheet, batchSize);
    
    if (!success) {
      console.error('Import failed');
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main(); 