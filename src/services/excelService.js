const ExcelJS = require('exceljs');
const sequelize = require('../config/db');
const ExportModel= require('../models/export.model')
const ImportModel= require('../models/import.model')

exports.parseAndInsertExcel = async (filePath, type) => {

  try {
    if(type === 'export'){
      await processExcelFile(filePath, ExportModel);
    } else if(type === 'import'){
      await processExcelFile(filePath, ImportModel)
    }
  } catch (error) {
    console.log(error.message)
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
  let batch = [];
  
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
  
    const worksheet = workbook.getWorksheet(1); 
    const headers = worksheet.getRow(1).values.slice(1);
  
    
    const transaction = await sequelize.transaction();
    worksheet.eachRow({ includeEmpty: false }, async (row, rowNumber) => {

      if (rowNumber === 1) return; 
      
      const rowData = {};

      
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        
        
        if(['2_Digit_Code','4_Digit_Code'].includes(headers[colNumber - 1])){
          return
        }
        
         if(headers[colNumber-1] ==='yearMonth'){
          const value = cell.value.split(`'-`)[0]
          rowData[headers[colNumber - 1]] = cell.value;
          rowData["year"] = value;
         }else if(cell.value === '--'){
          rowData[headers[colNumber - 1]] = null
         }else{
          rowData[headers[colNumber - 1]] = cell.value; 
        }
        
      });
      
      batch.push(rowData);
      if (batch.length === batchSize) {
        await processBatch(batch, transaction, model);
        batch = []; 
        return;
      }
    });

  
    if (batch.length > 0) {
      await processBatch(batch, transaction, model);
    }
    await transaction.commit();
    console.log('Data inserted successfully!');

  } catch (error) {
    await transaction.rollback();
    console.error('Error processing the Excel file:', error);
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
