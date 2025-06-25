const ExcelJS = require('exceljs');
const fs = require('fs');
const { Sequelize, Op } = require('sequelize');
const sequelize = require('../config/db');
const ExportModel = require('../models/export.model')
const ImportModel = require('../models/import.model')
const redis = require('../config/chached-config')

exports.parseAndInsertExcel = async (filePath, type) => {
  try {
    if (type === 'export') {
      await processExcelFile(filePath, ExportModel);
    } else if (type === 'import') {
      await processExcelFile(filePath, ImportModel)
    }
  } catch (error) {
    console.log(error.message)
    throw error
  }
};

const preprocessFieldNames = (data) => {
  return data.map(row => {
    const newRow = {};
    for (const key in row) {
      let newKey = key.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      newRow[newKey] = row[key];
    }
    return newRow;
  });
};

const processExcelFile = async (filePath, model) => {
  console.log('Starting Excel processing...');
  const batchSize = 500;
  let batch = [];
  let headers = [];
  let rowCount = 0;
  let transaction;

  try {
    transaction = await sequelize.transaction();
    console.log('Transaction created');

    return new Promise((resolve, reject) => {
      const workbook = new ExcelJS.Workbook();
      const stream = fs.createReadStream(filePath);
      
      console.log('Reading Excel file...');
      
      stream.on('error', (err) => {
        console.error('Stream error:', err);
        if (transaction) transaction.rollback();
        reject(err);
      });
      
      workbook.xlsx.read(stream)
        .then(async () => {
          try {
            console.log('Excel file loaded, processing data...');
            const worksheet = workbook.getWorksheet(1);
            
            if (!worksheet) {
              throw new Error('Worksheet not found');
            }
            
            headers = worksheet.getRow(1).values.slice(1);
            console.log(`Found ${headers.length} columns in header row`);

            for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
              const row = worksheet.getRow(rowNumber);
              if (!row.hasValues) continue;
              
              rowCount++;
              const rowData = {};
              
              row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                if (['2_Digit_Code', '4_Digit_Code'].includes(headers[colNumber - 1])) {
                  return;
                }

                if (headers[colNumber - 1] === 'yearMonth') {
                  const value = cell.value.split(`'-`)[0];
                  rowData[headers[colNumber - 1]] = cell.value;
                  rowData["year"] = value;
                } else if (cell.value === '--') {
                  rowData[headers[colNumber - 1]] = null;
                } else {
                  rowData[headers[colNumber - 1]] = cell.value;
                }
              });

              if (Object.keys(rowData).length > 0) {
                batch.push(rowData);
              }

              if (batch.length >= batchSize) {
                try {
                  await processBatch(batch, transaction, model);
                  console.log(`Processed ${rowCount} rows`);
                  batch = [];
                } catch (error) {
                  console.error('Error processing batch:', error);
                  throw error;
                }
              }
            }
            
            if (batch.length > 0) {
              try {
                await processBatch(batch, transaction, model);
                console.log(`Processed ${rowCount} rows total`);
              } catch (error) {
                console.error('Error processing final batch:', error);
                throw error;
              }
            }
            
            await transaction.commit();
            console.log('Data inserted successfully!');
            resolve();
          } catch (error) {
            if (transaction) await transaction.rollback();
            console.error('Error during worksheet processing:', error);
            reject(error);
          }
        })
        .catch(async (error) => {
          if (transaction) await transaction.rollback();
          console.error('Error reading Excel file:', error);
          reject(error);
        });
    });
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error('Setup error:', error);
    throw error;
  }
};

async function processBatch(batchObject, transaction, model) {
  try {
    console.log(`Inserting batch of ${batchObject.length} records...`);
    const result = await model.bulkCreate(batchObject, { transaction });
    console.log(`Successfully inserted ${result.length} records`);
    return result;
  } catch (error) {
    console.error('Error processing batch:', error);
    throw error;
  }
}

exports.getData = async (req, res) => {
  const query = req.body;
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 50;
  const offset = (page - 1) * limit;

  const modifiedQuery = queryModifier(query);
  const requiredFields = getRequiredField(modifiedQuery.dataType, modifiedQuery.informationOf);
  const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;

  try {
    const whereClause = {
      [Op.and]: [
        {
          [modifiedQuery.searchType]: {
            [Op.or]: modifiedQuery.searchValue.map(value => ({
              [Op.like]: `%${value}%`
            }))
          }
        },
        {
          shippingBillDate: {
            [Op.between]: [modifiedQuery.startDate, modifiedQuery.endDate],
          },
        }
      ]
    };

    const fieldMappings = {
      "Indian Port": "portOfOrigin",
      "H S Code": "H_S_Code",
      "Product Description": "productDescription",
      "Quantity Units": "quantityUnit",
      "Quantity": "standardQuantity",
      "Unit Price": "standardUnitRateUSD",
      "Currency": "currency",
      "Product Name": "productName",
      "Indian Company": "supplier",
      "Foreign Company": "buyer",
      "Foreign Country": "buyerCountry",
      "CAS Number": "CAS_Number",
      "Date of Shipment": "shippingBillDate"
    };

    // Apply filters
    if (query.filters && typeof query.filters === 'object') {
      for (const [displayName, values] of Object.entries(query.filters)) {
        if (Array.isArray(values) && values.length > 0) {
          const dbColumnName = fieldMappings[displayName] || displayName;
          whereClause[Op.and].push({
            [dbColumnName]: {
              [Op.in]: values
            }
          });
        }
      }
    }

    const totalCount = await model.count({ where: whereClause });

    const data = await model.findAll({
      attributes: requiredFields,
      where: whereClause,
      offset,
      limit
    });


    return res.status(200).json({
      statusCode: 200,
      page,
      limit,
      totalRecords: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      data,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



exports.getDataMetrics = async (req, res) => {
  const query = req.body;
  const modifiedQuery = queryModifier(query);
  const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
 // Add mappings for fields that have different names in database vs frontend
          const fieldMappings = {
      "Indian Port": "portOfOrigin",
      "H S Code": "H_S_Code",
      "Product Description": "productDescription",
      "Quantity Units": "quantityUnit",
      "Quantity": "standardQuantity",
      "Unit Price": "standardUnitRateUSD",
      "Currency": "currency",
      "Product Name": "productName",
      "Indian Company": "supplier",
      "Foreign Company": "buyer",
      "Foreign Country": "buyerCountry",
      "CAS Number": "CAS_Number",
      "Date of Shipment": "shippingBillDate"
    };
  try {
    // Pre-build the base where clause once
    const baseWhere = {
      [Op.and]: [
        {
          [modifiedQuery.searchType]: {
            [Op.or]: modifiedQuery.searchValue.map(value => ({
              [Op.like]: `%${value}%`
            }))
          }
        },
        {
          shippingBillDate: {
            [Op.between]: [modifiedQuery.startDate, modifiedQuery.endDate],
          }
        }
      ]
    };

    if (query.filters && typeof query.filters === 'object') {
      for (const [field, values] of Object.entries(query.filters)) {
        if (Array.isArray(values) && values.length > 0) {
          // Map the field name to the actual database column name
          let dbColumnName = field;
          
         
          
          // Use the mapped column name if it exists, otherwise use the original field name
          if (fieldMappings[field]) {
            dbColumnName = fieldMappings[field];
          }
          
          baseWhere[Op.and].push({
            [dbColumnName]: {
              [Op.in]: values
            }
          });
        }
      }
    }

    // Optimized metric configurations with better grouping
    const metricsByField = {
      quantity: [
        { key: 'topBuyersByQuantity', groupBy: 'buyer' },
        { key: 'topSuppliersByQuantity', groupBy: 'supplier' },
        { key: 'topCountryByQuantity', groupBy: 'buyerCountry' },
        { key: 'topIndianPortByQuantity', groupBy: 'portOfOrigin' }
      ],
      totalValueInvoice: [
        { key: 'topBuyersByValue', groupBy: 'buyer' },
        { key: 'topSuppliersByValue', groupBy: 'supplier' },
        { key: 'topCountryByValue', groupBy: 'buyerCountry' },
        { key: 'topIndianPortByValue', groupBy: 'portOfOrigin' }
      ]
    };

    // Optimized query function with connection pooling consideration
    const getGroupedData = async (groupByField, aggregateField, limit = 6 ) => {
      const results = await model.findAll({
        attributes: [
          [Sequelize.col(groupByField), groupByField],
          [Sequelize.fn('SUM', Sequelize.col(aggregateField)), 'total'],
          [Sequelize.fn('COUNT', Sequelize.col('*')), 'count']
        ],
        where: baseWhere,
        group: [groupByField],
        order: [[Sequelize.literal('total'), 'DESC']],
        limit,
        raw: true, // Return plain objects instead of Sequelize instances
        // Consider adding these for better performance:
        // subQuery: false, // Avoid subqueries when possible
        // logging: false // Disable SQL logging in production
      });

      // Optimized mapping with direct property access
      return results.map(item => ({
        [groupByField]: item[groupByField],
        total: parseFloat(item.total || 0),
        count: parseInt(item.count || 0)
      }));
    };

    // Get overall summary statistics
    const getSummaryStats = async () => {
      const results = await model.findAll({
        attributes: [
          [Sequelize.fn('SUM', Sequelize.col('quantity')), 'totalQuantity'],
          [Sequelize.fn('SUM', Sequelize.col('totalValueUSD')), 'totalValueUSD'],
          [Sequelize.fn('COUNT', Sequelize.col('*')), 'totalRecords'],
          [Sequelize.fn('COUNT', Sequelize.fn('DISTINCT', Sequelize.col('buyer'))), 'uniqueBuyers'],
          [Sequelize.fn('COUNT', Sequelize.fn('DISTINCT', Sequelize.col('supplier'))), 'uniqueSuppliers']
        ],
        where: baseWhere,
        raw: true
      });

      const result = results[0];
      return {
        totalQuantity: parseFloat(result.totalQuantity || 0),
        totalValueUSD: parseFloat(result.totalValueUSD || 0),
        totalRecords: parseInt(result.totalRecords || 0),
        uniqueBuyers: parseInt(result.uniqueBuyers || 0),
        uniqueSuppliers: parseInt(result.uniqueSuppliers || 0)
      };
    };

    // Execute queries in batches to reduce concurrent load
    const metrics = {};
    
    // Process quantity metrics
    const quantityPromises = metricsByField.quantity.map(async config => {
      const data = await getGroupedData(config.groupBy, 'quantity');
      return [config.key, data];
    });
    
    // Process value metrics
    const valuePromises = metricsByField.totalValueInvoice.map(async config => {
      const data = await getGroupedData(config.groupBy, 'totalValueInvoice');
      return [config.key, data];
    });

    // Execute all queries concurrently including summary stats
    const [quantityResults, valueResults, summaryStats] = await Promise.all([
      Promise.all(quantityPromises),
      Promise.all(valuePromises),
      getSummaryStats()
    ]);

    // Build metrics object efficiently
    [...quantityResults, ...valueResults].forEach(([key, data]) => {
      metrics[key] = data;
    });

    // Add summary statistics to metrics
    metrics.summary = summaryStats;

     // Now get all distinct values for filters
    const filters = {};

    for (const [displayName, dbColumnName] of Object.entries(fieldMappings)) {
      const distinctValues = await model.findAll({
        attributes: [
          [Sequelize.fn('DISTINCT', Sequelize.col(dbColumnName)), dbColumnName]
        ],
        where: baseWhere,
        raw: true
      });

      filters[displayName] = distinctValues
        .map(item => item[dbColumnName])
        .filter(Boolean); // remove nulls
    }

    return res.status(200).json({
      statusCode: 200,
      metrics,
      filters, // added filters object for frontend
      query
    });

  } catch (error) {
    console.error('Error fetching metrics:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      // In development, you might want to include more error details:
      // ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

exports.getSuggestedData = async (query) => {
  const modifiedQuery = queryModifier(query)
  const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel
  try {
    let data;
    let cachedData;

    if(modifiedQuery.informationOf === 'import'){
      cachedData = await redis.get('import_suggested_data');
    }else{
      cachedData = await redis.get('export_suggested_data');

    }
    if (!cachedData) {
      data = getSuggestedFieldsFromCached(JSON.parse(cachedData), modifiedQuery.searchType,query.suggestion );
    } else {
      data = await model.findAll({
        attributes: [
          [Sequelize.fn('DISTINCT', Sequelize.col(modifiedQuery.searchType)),'title'],
        ],
        where: {
          [modifiedQuery.searchType]: {
            [Op.like]: `%${query.suggestion}%`
          }
        },
        limit: 20
      });
    }
    return data;
  } catch (error) {
    throw error
  }
};





const getRequiredField = (dataType, informationOf) => {

  const fields = [
    ['shippingBillDate', 'dateOfShipment'],
    ['H_S_Code', 'HS_Code'],
    ['productDescription', 'productDescription'],
    ['standardQuantity', 'quantity'],
    ['quantityUnit', 'quantityUnits'],
    ['standardUnitRateUSD', 'unitPrice'],
    ['currency', 'currency'],
    ['region', 'region']
  ]

  if (dataType === 'cleaned data') {
    fields.push(['productName', 'productName'])
    fields.push(['CAS_NUmber', 'CAS _Number'])
  }

  if (informationOf === 'export') {
    fields.unshift(['portOfOrigin', 'indianPort'])
    fields.push(['supplier', 'indianCompany'])
    fields.push(['buyer', 'foreignCompany'])
    fields.push(['buyerCountry', 'foreignCountry'],)
  } else {
    fields.unshift(['portOfDeparture', 'indianPort'])
    fields.push(['buyer', 'indianCompany'])
    fields.push(['supplier', 'foreignCompany'])
    fields.push(['supplierCountry', 'foreignCountry'],)
  }
  return fields;
}

const getSuggestedFieldsFromCached = (data, searchType, suggestion) => {

  const requiredFields = [];
  let index =0;
  const lowerSuggestion = suggestion.toLowerCase();

  for (const item of data) {
    const fieldValue = item[searchType]?.toLowerCase();

    if (fieldValue?.includes(lowerSuggestion) && !requiredFields.includes(item[searchType])) {
      requiredFields.push({id:index++,['title']:item[searchType]});
    }

    if (requiredFields.length === 20) {
      break;
    }
  }

  return requiredFields;
};
exports.getHSCodes = async (query) => {
  const model = query.informationOf === 'import' ? ImportModel : ExportModel;
  
  try {
    const data = await model.findAll({
      attributes: [
        [Sequelize.fn('DISTINCT', Sequelize.fn('SUBSTRING', Sequelize.col('H_S_Code'), 1, 2)), 'code']
      ],
      where: {
        H_S_Code: {
          [Op.not]: null
        }
      },
      order: [[Sequelize.literal('code'), 'ASC']]
    });

    return data.map(item => item.get('code'));
  } catch (error) {
    console.log(error);
    throw error;
  }
};
