#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const { clickhouse, initClickHouse } = require('../config/clickhouse');
const { initClickHouseExport } = require('../models/clickhouse/export.model');
const dotenv = require('dotenv');
const { parse } = require('csv-parse');
const { Transform } = require('stream');

dotenv.config();

// Configuration
const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'export_data';

// Configure command line options
program
  .version('1.0.0')
  .description('Import data into ClickHouse')
  .requiredOption('-f, --file <path>', 'Path to input file')
  .option('-d, --delimiter <char>', 'File delimiter (default: tab)', '\t')
  .option('-h, --has-header', 'File has header row', true)
  .option('-s, --skip-rows <number>', 'Number of rows to skip', 0)
  .option('-b, --batch-size <number>', 'Number of rows per batch', 50000)
  .parse(process.argv);

const options = program.opts();

/**
 * Pre-process CSV data to handle problematic quotes
 * @param {string} line The input line
 * @returns {string} The processed line
 */
function preprocessLine(line) {
  // Replace standalone quotes in fields with empty string
  // This regex matches quotes that are not part of proper CSV quoting
  return line.replace(/(?<=[^\"])\"+(?=[^\"])|(?<=[^\"])\"+(?=$)|^"+(?=[^\"])/g, '');
}

// Create transform stream for pre-processing
const preprocess = new Transform({
  transform(chunk, encoding, callback) {
    const line = chunk.toString();
    const processedLine = preprocessLine(line);
    callback(null, processedLine);
  }
});

/**
 * Clean and validate data
 */
function cleanData(record, headers) {
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
        .replace(/['"]/g, '')
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
    const yearValue = record.year?.toString().replace(/['"]/g, '').trim() || '';
    const year = parseInt(yearValue);
    cleanedRecord.year = !isNaN(year) ? year : 0;
  }

  // Clean dates
  if ('shippingBillDate' in record) {
    const dateValue = record.shippingBillDate?.toString().trim() || '';
    const datePart = dateValue.split(' ')[0].trim();
    cleanedRecord.shippingBillDate = /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : '1970-01-01';
  }

  ['createdAt', 'updatedAt'].forEach(field => {
    if (field in record) {
      const dateValue = record[field]?.toString().trim() || '';
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
 * Import CSV to ClickHouse
 */
async function importCSV(filePath, delimiter = '\t', hasHeader = true, skipRows = 0, batchSize = 50000) {
  try {
    console.log(`Importing TSV file: ${filePath}`);
    console.log(`Using delimiter: ${delimiter === '\t' ? 'TAB' : delimiter}`);
    
    // Initialize ClickHouse
    const clickhouseReady = await initClickHouse();
    if (!clickhouseReady) {
      console.error('Failed to initialize ClickHouse connection');
      return false;
    }
    
    // Create tables and views
    await initClickHouseExport();
    
    return new Promise((resolve, reject) => {
      // Create read stream
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
      
      // Create CSV parser
      const parser = parse({
        delimiter,
        columns: hasHeader,
        skip_empty_lines: true,
        skip_records_with_empty_values: true,
        trim: true,
        quote: '"',
        escape: '"',
        relax_quotes: true,
        relax_column_count: true
      });

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
      fileStream.on('error', reject);
      parser.on('error', reject);
      transformer.on('error', reject);
      finalTransform.on('error', reject);

      // Set up the pipeline
      fileStream
        .pipe(preprocess)  // Add preprocessing step
        .pipe(parser)
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
    const { file, delimiter, hasHeader, skipRows, batchSize } = options;
    
    // Validate file path
    if (!fs.existsSync(file)) {
      console.error(`File not found: ${file}`);
      process.exit(1);
    }
    
    // Import CSV
    const success = await importCSV(file, delimiter, hasHeader, parseInt(skipRows), parseInt(batchSize));
    
    if (success) {
      console.log('CSV import completed successfully');
      process.exit(0);
    } else {
      console.error('CSV import failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main(); 