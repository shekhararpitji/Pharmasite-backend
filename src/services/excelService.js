const ExcelJS = require('exceljs');
const fs = require('fs');
const dayjs = require('dayjs');
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

exports.getData = async (query) => {
console.log("hello")
  const modifiedQuery = queryModifier(query)
  const requiredFields = getRequiredField(modifiedQuery.dataType, modifiedQuery.informationOf)
  const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel
  try {
    // const data = await model.findAll({
    //   attributes: requiredFields,
    //   where: {
    //     [modifiedQuery.searchType]:{
    //       [Op.in]:modifiedQuery.searchValue
    //     },
    //     shippingBillDate: {
    //       [Op.between]: [modifiedQuery.startDate, modifiedQuery.endDate],
    //     },
    //   },
    // });
console.log("find")
    const data = await model.findAll({
      attributes: requiredFields,
      where: {
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
      }
    });
console.log(data.length)
    // Helper function to get grouped data
  
console.log("last")
    // Returning all data
    return {
      data
    };
  } catch (error) {
    console.log(error)
    throw error
  }
};

exports.getDataMetrics = async (req,res) => {
console.log("hello")
  const query = req.query;
  const modifiedQuery = queryModifier(query)
  // const requiredFields = getRequiredField(modifiedQuery.dataType, modifiedQuery.informationOf)
  const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel
  try {
   
console.log("find")
    
    // Helper function to get grouped data
    const getGroupedData = async (groupByField, aggregateField, aggregateFunction, limit = 10) => {
      const result = await model.findAll({
        attributes: [
          [Sequelize.col(groupByField), groupByField],
          [Sequelize.fn(aggregateFunction, Sequelize.col(aggregateField)), 'total'],
        ],
        where: {
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
        },
        group: [groupByField],
        order: [[Sequelize.literal('total'), 'DESC']],
        limit,
      });

      return result.map((item) => ({
        [groupByField]: item.get(groupByField),
        total: parseFloat(item.get('total')),
      }));
    };

    // Fetching metrics
    const topBuyersByQuantity = await getGroupedData('buyer', 'quantity', 'SUM');
    const topSuppliersByQuantity = await getGroupedData('supplier', 'quantity', 'SUM');
    const topCountryByQuantity = await getGroupedData('buyerCountry', 'quantity', 'SUM');
    const topIndianPortByQuantity = await getGroupedData('portOfOrigin', 'quantity', 'SUM');
    const topBuyersByValue = await getGroupedData('buyer', 'standardUnitRateINR', 'SUM');
    const topSuppliersByValue = await getGroupedData('supplier', 'standardUnitRateINR', 'SUM');
    const topCountryByValue = await getGroupedData('buyerCountry', 'standardUnitRateINR', 'SUM');
    const topIndianPortByValue = await getGroupedData('portOfOrigin', 'standardUnitRateINR', 'SUM');
console.log("last")
const metrics= {
        topBuyersByQuantity,
        topSuppliersByQuantity,
        topCountryByQuantity,
        topIndianPortByQuantity,
        topBuyersByValue,
        topSuppliersByValue,
        topCountryByValue,
        topIndianPortByValue,
      };
    // Returning all data
    return res.status(200).json({
        statusCode:200,
        metrics,
        query
      });{
      
    };
  } catch (error) {
    console.log(error)
    throw error
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


const queryModifier = (query) => {
  const searchQuery = {};

  let startDate;
  let endDate;

  if (!query.duration) {
    startDate = dayjs().format('YYYY-MM-DD 00:00:00');
    endDate = dayjs().subtract(1, 'year').format('YYYY-MM-DD 23:59:59');
  } else {
    const dateRange = query.duration.split('-')
    startDate = dayjs(dateRange[0], 'DD/MM/YYYY').format('YYYY-MM-DD 00:00:00');
    endDate = dayjs(dateRange[1], 'DD/MM/YYYY').format('YYYY-MM-DD 23:59:59');
  }

  searchQuery.startDate = startDate;
  searchQuery.endDate = endDate;

  if(['CAS_Number', 'H_S_Code', '2_Digit_Code'].includes(query.searchType)){
    searchType = query.searchType
  }else{
    searchType = query.searchType
      .toLowerCase()
      .split(' ')
      .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }
  
  const values = query.searchValue && query?.searchValue?.includes(',')
    ? query.searchValue.split(',').map(v => v.trim())
    : [query.searchValue]
  searchQuery.searchType = searchType ?? 'productName';
  searchQuery.chapter = query.chapter;
  searchQuery.searchValue = values;
  searchQuery.informationOf = query.informationOf;
  searchQuery.dataType = query?.dataType ?? 'raw data';
console.log("searching Query")
  return searchQuery;
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
