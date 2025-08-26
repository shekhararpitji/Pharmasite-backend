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
  const batchSize = 1000;
  const batches = [];
  let batch = [];

  try {
    const workbook = new ExcelJS.Workbook();
    const stream = fs.createReadStream(filePath);
    await workbook.xlsx.read(stream);
    const worksheet = workbook.getWorksheet(1);
    const headers = worksheet.getRow(1).values.slice(1);


    worksheet.eachRow({ includeEmpty: false }, async (row, rowNumber) => {

      if (rowNumber === 1) return;

      const rowData = {};


      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {


        if (['2_Digit_Code', '4_Digit_Code'].includes(headers[colNumber - 1])) {
          return
        }

        if (headers[colNumber - 1] === 'yearMonth') {
          const value = cell.value.split(`'-`)[0]
          rowData[headers[colNumber - 1]] = cell.value;
          rowData["year"] = value;
        } else if (cell.value === '--') {
          rowData[headers[colNumber - 1]] = null
        } else {
          rowData[headers[colNumber - 1]] = cell.value;
        }

      });

      batch.push(rowData);

      if (batch.length === batchSize) {
        batches.push(batch)
        batch = [];
        return;
      }

    });

    if (batch.length > 0) {
      batches.push(batch)
    }

    await batchHandler(batches, model)
    console.log('Data inserted successfully!');

  } catch (error) {
    console.error('Error processing the Excel file:', error);
    throw error
  }
};


async function processBatch(batchObject, transaction, model) {
  try {
    await model.bulkCreate(batchObject, { transaction });
  } catch (error) {
    console.error('Error processing batch:', error);
    throw error;
  }
}


async function batchHandler(batches, model) {
  let transaction;

  try {

    transaction = await sequelize.transaction();

    const batchPromises = batches.map(batch => {
      return processBatch(batch, transaction, model)
    })

    await Promise.all(batchPromises)
    transaction.commit()

  } catch (error) {
    console.log(error)
    transaction.rollback()
    throw error
  }

}


exports.getData = async (query) => {
  const modifiedQuery = queryModifier(query);
  const requiredFields = getRequiredField(modifiedQuery.dataType, modifiedQuery.informationOf);
  const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;

  try {
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
          },
        }
      ],
    };

    const fetchDataStartTime = new Date();

    // Fetch both datasets in parallel
    let requiredData;
    if(modifiedQuery?.dataType === 'clean data'){
     requiredData = await model.findAll({
        attributes: ['buyer', 'supplier', 'buyerCountry', 'portOfOrigin', 'quantity', 'standardUnitRateINR'],
        where: baseWhere,
        raw: true
      })
    }else{
      requiredData = await model.findAll({
        attributes: requiredFields,
        where: baseWhere,
      })
    }

    console.log(`Data fetched in ${((new Date() - fetchDataStartTime)/1000).toFixed(2)} seconds`);

    // Initialize all metric maps
    const metrics = {
      buyersByQuantity: new Map(),
      buyersByValue: new Map(),
      suppliersByQuantity: new Map(),
      suppliersByValue: new Map(),
      countryByQuantity: new Map(),
      countryByValue: new Map(),
      portByQuantity: new Map(),
      portByValue: new Map(),
    };

    const metricsStartTime = new Date();

    // Single pass through data to calculate ALL metrics
    requiredData?.forEach(row => {
      const quantity = parseFloat(row.quantity) || 0;
      const value = parseFloat(row.standardUnitRateINR) || 0;

      // Buyer metrics
      if (row.buyer) {
        metrics.buyersByQuantity.set(
          row.buyer,
          (metrics.buyersByQuantity.get(row.buyer) || 0) + quantity
        );
        metrics.buyersByValue.set(
          row.buyer,
          (metrics.buyersByValue.get(row.buyer) || 0) + value
        );
      }

      // Supplier metrics
      if (row.supplier) {
        metrics.suppliersByQuantity.set(
          row.supplier,
          (metrics.suppliersByQuantity.get(row.supplier) || 0) + quantity
        );
        metrics.suppliersByValue.set(
          row.supplier,
          (metrics.suppliersByValue.get(row.supplier) || 0) + value
        );
      }

      // Country metrics
      if (row.buyerCountry) {
        metrics.countryByQuantity.set(
          row.buyerCountry,
          (metrics.countryByQuantity.get(row.buyerCountry) || 0) + quantity
        );
        metrics.countryByValue.set(
          row.buyerCountry,
          (metrics.countryByValue.get(row.buyerCountry) || 0) + value
        );
      }

      // Port metrics
      if (row.portOfOrigin) {
        metrics.portByQuantity.set(
          row.portOfOrigin,
          (metrics.portByQuantity.get(row.portOfOrigin) || 0) + quantity
        );
        metrics.portByValue.set(
          row.portOfOrigin,
          (metrics.portByValue.get(row.portOfOrigin) || 0) + value
        );
      }
    });

    // Helper function to convert Map to sorted top-10 array
    const mapToTopArray = (map, entityField) => {
      return Array.from(map.entries())
        .map(([entity, total]) => ({
          [entityField]: entity,
          total: Math.round(total * 100) / 100
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
    };

    // Convert all metrics to final format
    const finalMetrics = {
      topBuyersByQuantity: mapToTopArray(metrics.buyersByQuantity, 'buyer'),
      topBuyersByValue: mapToTopArray(metrics.buyersByValue, 'buyer'),
      topSuppliersByQuantity: mapToTopArray(metrics.suppliersByQuantity, 'supplier'),
      topSuppliersByValue: mapToTopArray(metrics.suppliersByValue, 'supplier'),
      topCountryByQuantity: mapToTopArray(metrics.countryByQuantity, 'buyerCountry'),
      topCountryByValue: mapToTopArray(metrics.countryByValue, 'buyerCountry'),
      topIndianPortByQuantity: mapToTopArray(metrics.portByQuantity, 'portOfOrigin'),
      topIndianPortByValue: mapToTopArray(metrics.portByValue, 'portOfOrigin')
    };

    console.log(`Metrics calculated in ${((new Date() - metricsStartTime)/1000).toFixed(2)} seconds`);

    return {
      data: requiredData,
      metrics: finalMetrics
    };

  } catch (error) {
    console.log(error);
    throw error;
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

    if (cachedData) {
      data = getSuggestedFieldsFromCached(JSON.parse(cachedData), modifiedQuery.searchType,query.suggestion );
    } else {
      data = await model.findAll({
        attributes: [
          [Sequelize.fn('DISTINCT', Sequelize.col(modifiedQuery.searchType)), modifiedQuery.searchType],
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
      requiredFields.push({id:index++,[searchType]:item[searchType]});
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
