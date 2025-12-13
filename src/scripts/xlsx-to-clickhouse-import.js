#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const XLSX = require('xlsx');
const { clickhouse, initClickHouse } = require('../config/clickhouse');
const { initClickHouseImport } = require('../models/clickhouse/import.model');
const dotenv = require('dotenv');
const { Transform } = require('stream');
const { Readable } = require('stream');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

// Configuration
const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'import_data';

// Configure command line options
program
  .version('1.0.0')
  .description('Import XLSX data into ClickHouse Import Table')
  .option('-f, --file <path>', 'Path to input XLSX file')
  .option('-s, --sheet <name>', 'Sheet name to import (defaults to first sheet)')
  .option('-b, --batch-size <number>', 'Number of rows per batch', 50000)
  .parse(process.argv);

const options = program.opts();

/**
 * Clean and validate data
 */
function cleanData(record) {
  const cleanedRecord = {};

  // Generate UUID for id field
  cleanedRecord.id = uuidv4();

  // Define all valid fields that should be in ClickHouse
  // This excludes extra columns like '2_Digit_Code', '4_Digit_Code'
  const validFields = new Set([
    'id', 'informationOf', 'yearMonth', 'year', 'portOfOrigin', 'modeOfShipment',
    'indianPortCode', 'shippingBillDate', 'shippingBillNumber', 'shippingBillStatus',
    'invoiceNumber', 'itemNumber', 'H_S_Code', 'chapter', 'productDescription',
    'productName', 'CAS_Number', 'quantity', 'quantityUnit', 'standardQuantity',
    'standardQuantityUnit', 'standardUnitRateINR', 'standardUnitRateUSD',
    'itemRateINR', 'itemRateUSD', 'totalValueINR', 'totalValueUSD',
    'itemRateInvoice', 'currency', 'totalValueInvoice', 'freightOnBoardINR',
    'freightOnBoardUSD', 'importExportCode', 'supplier', 'supplierRaw',
    'supplierAddress', 'supplierCity', 'supplierCountry', 'buyer', 'buyerRaw',
    'companyStatus', 'portOfDeparture', 'buyerCountry', 'region', 'createdAt', 'updatedAt'
  ]);

  // Clean text fields - remove tabs, newlines, and excessive whitespace
  // Keep original import field names for processing, will map to export structure later
  const textFields = [
    'informationOf', 'yearMonth', 'portOfDeparture', 'modeOfShipment',
    'indianPortCode', 'billOfEntry', 'billOfEntryStatus', 'billOfEntryType', 
    'invoiceNumber', 'itemNumber', 'H_S_Code', 'productDescription', 
    'productName', 'CAS_Number', 'CID', 'quantityUnit', 'standardQuantityUnit', 
    'currency', 'importExportCode', 'buyer', 'buyerStandardized', 'buyerAddress', 
    'buyerCity', 'buyerPin', 'buyerState', 'buyerPhone', 'buyerEmail', 'director',
    'supplier', 'supplierStandardized', 'supplierAddress', 'customHouseAgent', 
    'portOfOrigin', 'supplierCountry', 'region'
  ];

  textFields.forEach(field => {
    if (field in record) {
      cleanedRecord[field] = record[field]
        ?.toString()
        .replace(/[\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || '';
    } else {
      cleanedRecord[field] = '';
    }
  });

  // Clean numeric fields
  const numericFields = [
    'quantity', 'standardQuantity', 'standardUnitRateINR', 'standardUnitRateUSD',
    'itemRateINR', 'itemRateUSD', 'totalValueINR', 'totalValueUSD',
    'itemRateInvoice', 'totalValueInvoice', 'totalDutyPaidINR', 'totalDutyPaidUSD'
  ];

  numericFields.forEach(field => {
    if (field in record) {
      const value = record[field]?.toString().trim() || '0';
      const cleanedValue = value.replace(/[^\d.-]/g, '');
      const num = parseFloat(cleanedValue);
      cleanedRecord[field] = isNaN(num) ? 0 : num;
    } else {
      cleanedRecord[field] = 0;
    }
  });

  // Clean year - extract year from yearMonth or other date fields
  if ('yearMonth' in record && record.yearMonth) {
    const yearMatch = record.yearMonth.toString().match(/\b(20\d{2})\b/);
    if (yearMatch) {
      cleanedRecord.year = parseInt(yearMatch[1]);
    } else {
      cleanedRecord.year = 0;
    }
  } else if ('year' in record) {
    const yearValue = record.year?.toString().trim() || '';
    // Handle cases where year might contain other text
    const yearMatch = yearValue.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      cleanedRecord.year = parseInt(yearMatch[1]);
    } else {
      const year = parseInt(yearValue);
      cleanedRecord.year = !isNaN(year) ? year : 0;
    }
  } else {
    cleanedRecord.year = 0;
  }

  // Extract chapter from H_S_Code (first 2 digits)
  if (cleanedRecord.H_S_Code && cleanedRecord.H_S_Code.trim().length >= 2) {
    const hsCode = cleanedRecord.H_S_Code.toString().trim().replace(/[^\d]/g, '');
    cleanedRecord.chapter = hsCode.substring(0, 2);
  } else {
    cleanedRecord.chapter = '';
  }

  const convertDateFormat = (dateString) => {
    if (!dateString || dateString === '' || dateString === 'null' || dateString === 'undefined') {
      throw new Error('Date string is empty or null');
    }
  
    try {
      if (typeof dateString === 'string') {
        // Format: "1-Jan-21" or "1-Jan-2021"
        const dateMatch = dateString.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
        if (dateMatch) {
          const day = parseInt(dateMatch[1]);
          const month = dateMatch[2].toLowerCase();
          let year = parseInt(dateMatch[3]);
  
          if (year < 100) {
            year = year < 50 ? 2000 + year : 1900 + year;
          }
  
          const monthMap = {
            'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
          };
  
          const monthIndex = monthMap[month];
          if (monthIndex !== undefined) {
            const date = new Date(year, monthIndex, day);
  
            // Format YYYY-MM-DD in **local time**
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
          }
        }
  
        // Format: "1/1/21" or "1/1/2021"
        const slashDateMatch = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (slashDateMatch) {
          const month = parseInt(slashDateMatch[1]) - 1;
          const day = parseInt(slashDateMatch[2]);
          let year = parseInt(slashDateMatch[3]);
  
          if (year < 100) {
            year = year < 50 ? 2000 + year : 1900 + year;
          }
  
          const date = new Date(year, month, day);
          const yyyy = date.getFullYear();
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }
  
        // Excel serial numbers
        if (!isNaN(dateString) && dateString > 0) {
          const excelDate = new Date((parseInt(dateString) - 25569) * 86400 * 1000);
          if (!isNaN(excelDate.getTime())) {
            const yyyy = excelDate.getFullYear();
            const mm = String(excelDate.getMonth() + 1).padStart(2, '0');
            const dd = String(excelDate.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
          }
        }
      }
  
      // Fallback generic Date parse
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
  
      throw new Error('Date string error'); 
    } catch (error) {
      console.error('Error converting date:', dateString, error);
      throw new Error('Date string error');
    }
  };
  
  // Clean dates - map from billOfEntryDate to shippingBillDate for export-aligned structure
  if ('billOfEntryDate' in record && record.billOfEntryDate && record.billOfEntryDate.toString().trim() !== '') {
    try {
      let dateValue = convertDateFormat(record.billOfEntryDate);
      cleanedRecord.shippingBillDate = /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : '1970-01-01';
    } catch (error) {
      console.warn('Error converting billOfEntryDate to shippingBillDate:', record.billOfEntryDate, error.message);
      cleanedRecord.shippingBillDate = '1970-01-01';
    }
  } else {
    cleanedRecord.shippingBillDate = '1970-01-01';
  }

  // Clean datetime fields
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
    } else {
      cleanedRecord[field] = '1970-01-01 00:00:00';
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
    console.log('Creating ClickHouse import table...');
    const tableCreated = await initClickHouseImport();
    if (!tableCreated) {
      console.error('Failed to create ClickHouse import table');
      return false;
    }
    console.log('ClickHouse import table created successfully');
    
    // Read XLSX file
    console.log('Reading XLSX file... (This may take a while for large files)');
    const startTime = Date.now();
    const workbook = XLSX.readFile(filePath);
    console.log(`XLSX file read in ${(Date.now() - startTime) / 1000}s`);
    
    const sheet = sheetName ? workbook.Sheets[sheetName] : workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      throw new Error(`Sheet ${sheetName || workbook.SheetNames[0]} not found`);
    }

    // Convert to JSON with headers
    console.log('Converting XLSX to JSON... (This may take a while for large files)');
    const convertStartTime = Date.now();
    const jsonData = XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: 'YYYY-MM-DD' });
    console.log(`JSON conversion completed in ${(Date.now() - convertStartTime) / 1000}s`);
    
    console.log(`Found ${jsonData.length} rows to import`);
    
    if (jsonData.length === 0) {
      console.log('No data found in the file');
      return true;
    }
    
    return new Promise((resolve, reject) => {
      console.log('Setting up data processing streams...');
      // Create data stream
      const dataStream = xlsxToStream([...jsonData]);
      
      // Create transform stream for data cleaning
      let processedCount = 0;
      const transformer = new Transform({
        objectMode: true,
        transform(record, encoding, callback) {
          try {
            processedCount++;
            if (processedCount % 1000 === 0) {
              console.log(`Processed ${processedCount} records...`);
            }
            const cleanedRecord = cleanData(record);
            
            // Skip records with invalid dates
            if (cleanedRecord.shippingBillDate === '1970-01-01') {
              console.warn('Skipping record with invalid date:', record.shippingBillDate);
              callback(null); // Skip this record
              return;
            }
            
            // Field mapping from original import structure to export-aligned database structure
            const orderedRecord = {
              // Core fields - direct mapping
              id: cleanedRecord.id,
              informationOf: cleanedRecord.informationOf,
              yearMonth: cleanedRecord.yearMonth,
              year: cleanedRecord.year,
              portOfOrigin: cleanedRecord.portOfOrigin,
              modeOfShipment: cleanedRecord.modeOfShipment,
              indianPortCode: cleanedRecord.indianPortCode,
              
              // Date field mapping: billOfEntryDate -> shippingBillDate
              shippingBillDate: cleanedRecord.shippingBillDate,
              
              // Shipping fields mapping: billOfEntry -> shippingBillNumber, billOfEntryStatus -> shippingBillStatus
              shippingBillNumber: cleanedRecord.billOfEntry || '',
              shippingBillStatus: cleanedRecord.billOfEntryStatus || '',
              
              // Common fields - direct mapping
              invoiceNumber: cleanedRecord.invoiceNumber,
              itemNumber: cleanedRecord.itemNumber,
              H_S_Code: cleanedRecord.H_S_Code,
              chapter: cleanedRecord.chapter,
              productDescription: cleanedRecord.productDescription,
              productName: cleanedRecord.productName,
              CAS_Number: cleanedRecord.CAS_Number,
              quantity: cleanedRecord.quantity,
              quantityUnit: cleanedRecord.quantityUnit,
              standardQuantity: cleanedRecord.standardQuantity,
              standardQuantityUnit: cleanedRecord.standardQuantityUnit,
              standardUnitRateINR: cleanedRecord.standardUnitRateINR,
              standardUnitRateUSD: cleanedRecord.standardUnitRateUSD,
              itemRateINR: cleanedRecord.itemRateINR,
              itemRateUSD: cleanedRecord.itemRateUSD,
              totalValueINR: cleanedRecord.totalValueINR,
              totalValueUSD: cleanedRecord.totalValueUSD,
              itemRateInvoice: cleanedRecord.itemRateInvoice,
              currency: cleanedRecord.currency,
              totalValueInvoice: cleanedRecord.totalValueInvoice,
              
              // Freight fields - set to 0 for import data (not applicable)
              freightOnBoardINR: 0,
              freightOnBoardUSD: 0,
              
              importExportCode: cleanedRecord.importExportCode,
              
              // Supplier fields mapping
              supplier: cleanedRecord.supplier,
              supplierRaw: cleanedRecord.supplierStandardized || cleanedRecord.supplier,
              supplierAddress: cleanedRecord.supplierAddress || '',
              supplierCity: cleanedRecord.supplierCity || '',
              supplierCountry: cleanedRecord.supplierCountry,
              
              // Buyer fields mapping
              buyer: cleanedRecord.buyer,
              buyerRaw: cleanedRecord.buyerStandardized || cleanedRecord.buyer,
              companyStatus: cleanedRecord.companyStatus || '',
              portOfDeparture: cleanedRecord.portOfDeparture,
              
              // Country field mapping: supplierCountry -> buyerCountry for import data
              buyerCountry: cleanedRecord.supplierCountry,
              
              region: cleanedRecord.region,
              createdAt: cleanedRecord.createdAt,
              updatedAt: cleanedRecord.updatedAt
            };
            
            // Convert to TSV line with proper escaping
            const values = Object.values(orderedRecord).map(value => {
              if (typeof value === 'string') {
                // Escape special characters for TSV format
                // Replace backslashes first to avoid double-escaping
                let escaped = value.replace(/\\/g, '\\\\');
                // Escape tabs with \t
                escaped = escaped.replace(/\t/g, '\\t');
                // Escape newlines with \n
                escaped = escaped.replace(/\n/g, '\\n');
                // Escape carriage returns with \r
                escaped = escaped.replace(/\r/g, '\\r');
                return escaped;
              }
              return String(value !== null && value !== undefined ? value : '');
            });
            
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
      console.log('Starting data import to ClickHouse...');
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
      .catch((error) => {
        console.error('ClickHouse insert error:', error);
        reject(error);
      });
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
  console.log('Starting import script...');
  try {
    const { file, sheet, batchSize } = options;
    console.log('Options:', { file, sheet, batchSize });

    if (file) {
      // Single file mode
      if (!fs.existsSync(file)) {
        console.error(`File not found: ${file}`);
        process.exit(1);
      }

      const success = await importXLSX(file, sheet, batchSize);
      if (!success) {
        console.error('Import failed');
        process.exit(1);
      }
    } else {
      // Multi-file mode (1.xlsx → 20.xlsx) - looking in data/import folder
      const folder = path.join(__dirname, "../../data/import");
      for (let i = 101; i <= 102; i++) {
        const filePath = path.join(folder, `Imp-Set${i}.xlsx`);
        if (!fs.existsSync(filePath)) {
          console.warn(`⚠️ File not found: ${filePath}, skipping...`);
          continue;
        }

        console.log(`\n📂 Starting import for file Imp-Set${i}.xlsx`);
        const success = await importXLSX(filePath, sheet, batchSize);
        if (!success) {
          console.error(`❌ Import failed for file Imp-Set${i}.xlsx`);
        } else {
          console.log(`✅ Finished import for file Imp-Set${i}.xlsx`);
        }
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main();
