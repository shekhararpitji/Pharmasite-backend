const ExcelJS = require('exceljs');
const fs = require('fs');
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
      console.log("hi2") 
      const worksheet = workbook.getWorksheet(1); 
      const headers = worksheet.getRow(1).values.slice(1);
    
    
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


async function batchHandler(batches , model) {
  
  try {
    
    const transaction = await sequelize.transaction();

    const batchPromises = batches.map( batch => {
      return processBatch(batch, transaction, model)
    })
    
    await Promise.all(batchPromises)
    transaction.commit()

  } catch (error) {
    console.log(error)
    throw error
    transaction.rollback()
  }

}
