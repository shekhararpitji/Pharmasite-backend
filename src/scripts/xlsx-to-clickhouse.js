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
const { v4: uuidv4 } = require('uuid');

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

  // Generate UUID for id field
  cleanedRecord.id = uuidv4();

  // Clean text fields - remove tabs, newlines, and excessive whitespace
  const textFields = [
    'informationOf', 'yearMonth', 'portOfOrigin', 'modeOfShipment',
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
    } else {
      cleanedRecord[field] = '';
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
  const convertDateFormat = (dateString) => {
    if (!dateString || dateString === '') {
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
  
  // Clean dates
  if ('shippingBillDate' in record) {
    let dateValue = convertDateFormat(record.shippingBillDate);
    console.log(dateValue);
    // if (dateValue instanceof Date) {
    //   dateValue = dateValue.toISOString().split('T')[0];
    // } else {
    //   dateValue = dateValue?.toString().trim() || '';
    //   dateValue = dateValue.split(' ')[0].trim();
    // }
    console.log(dateValue);
    cleanedRecord.shippingBillDate = /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : '1970-01-01';
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
    await initClickHouseExport();
    
    // Read XLSX file
    const workbook = XLSX.readFile(filePath);
    const sheet = sheetName ? workbook.Sheets[sheetName] : workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      throw new Error(`Sheet ${sheetName || workbook.SheetNames[0]} not found`);
    }

    // Convert to JSON with headers
    const jsonData = XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: 'YYYY-MM-DD' });
    
    console.log(`Found ${jsonData.length} rows to import`);
    
    // Log the first few records to help with debugging
    if (jsonData.length > 0) {
      console.log('Sample record structure:', Object.keys(jsonData[0]));
      console.log('First record sample:', JSON.stringify(jsonData[0], null, 2));
    }
    
    return new Promise((resolve, reject) => {
      // Create data stream
      const dataStream = xlsxToStream([...jsonData]);
      
      // Create transform stream for data cleaning
      const transformer = new Transform({
        objectMode: true,
        transform(record, encoding, callback) {
          try {
            const cleanedRecord = cleanData(record);
            
            // Ensure all required fields are present in the correct order
            const orderedRecord = {
              id: cleanedRecord.id,
              informationOf: cleanedRecord.informationOf,
              yearMonth: cleanedRecord.yearMonth,
              year: cleanedRecord.year,
              portOfOrigin: cleanedRecord.portOfOrigin,
              modeOfShipment: cleanedRecord.modeOfShipment,
              indianPortCode: cleanedRecord.indianPortCode,
              shippingBillDate: cleanedRecord.shippingBillDate,
              shippingBillNumber: cleanedRecord.shippingBillNumber,
              shippingBillStatus: cleanedRecord.shippingBillStatus,
              invoiceNumber: cleanedRecord.invoiceNumber,
              itemNumber: cleanedRecord.itemNumber,
              H_S_Code: cleanedRecord.H_S_Code,
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
              freightOnBoardINR: cleanedRecord.freightOnBoardINR,
              freightOnBoardUSD: cleanedRecord.freightOnBoardUSD,
              importExportCode: cleanedRecord.importExportCode,
              supplier: cleanedRecord.supplier,
              supplierRaw: cleanedRecord.supplierRaw,
              supplierAddress: cleanedRecord.supplierAddress,
              supplierCity: cleanedRecord.supplierCity,
              supplierCountry: cleanedRecord.supplierCountry,
              buyer: cleanedRecord.buyer,
              buyerRaw: cleanedRecord.buyerRaw,
              companyStatus: cleanedRecord.companyStatus,
              portOfDeparture: cleanedRecord.portOfDeparture,
              buyerCountry: cleanedRecord.buyerCountry,
              region: cleanedRecord.region,
              createdAt: cleanedRecord.createdAt,
              updatedAt: cleanedRecord.updatedAt
            };
            
            // Convert to TSV line with proper escaping
            const values = Object.values(orderedRecord).map(value => {
              if (typeof value === 'string') {
                // Escape tabs, newlines, and backslashes for TSV
                return value.replace(/[\t\n\r\\]/g, ' ');
              }
              return value;
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