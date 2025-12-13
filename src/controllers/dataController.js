const fs = require('fs');
const path = require('path');
const { parseAndInsertExcel, getData, getSuggestedData, getHSCodes, getDataFiltered, getDataSummary } = require('../services/excelService');
const ExcelJS = require('exceljs');

/**
 * Upload and process Excel file containing pharmaceutical data
 * 
 * This endpoint handles:
 * - File validation (Excel format only)
 * - Data parsing and transformation
 * - Database insertion
 * - Error handling and cleanup
 * 
 * Supports both import and export data types
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.uploadExcel = async (req, res) => {
  const file = req.file;
  const type = req.query.type;
  const fileExt = file.originalname.split('.')

  // Validate file format - only Excel files allowed
  if (fileExt[fileExt.length - 1] !== 'xlsx' && fileExt[fileExt.length - 1] !== 'xlx') {
    return res.status(401).send('File is not in expected format. system support excel file only')
  }

  // Validate data type parameter
  if (!type) return res.status(401).send("Please select file type")

  if (!file) {
    return res.status(400).send('No file selected');
  }

  try {
    const filePath = path.resolve(file.path);
    
    // Parse Excel file and insert data into database
    await parseAndInsertExcel(filePath, type);

    // TODO: Uncomment to clean up uploaded file after processing
    // fs.unlinkSync(filePath);
    
    res.status(200).json({ message: 'File processed and data inserted successfully' });
  } catch (err) {
    // TODO: Uncomment to clean up uploaded file on error
    // fs.unlinkSync(filePath);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get search suggestions for autocomplete functionality
 * 
 * This endpoint provides suggestions based on user input to improve UX
 * Helps users find relevant data faster with autocomplete
 * 
 * Required parameters:
 * - informationOf: 'import' or 'export'
 * - searchType: field to search in
 * - suggestion: partial text to match
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getSuggestionValue = async (req, res) => {
  const query = req.query;
  
  // Validate required parameters
  if (!query.informationOf || !query.searchType || !query.suggestion) {
    return res.status(400).send({
      statusCode: 400,
      message: "Provide neccessary fields in search query",
      query
    })
  }
  
  try {
    const data = await getSuggestedData(query)
    res.status(200).json({
      statusCode: 200,
      data,
      query
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get HS Codes for product classification
 * 
 * HS Codes (Harmonized System) are used for international trade classification
 * This endpoint provides relevant HS codes based on search criteria
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getHSCodes = async (req, res) => {
  const query = req.body;
  
  try {
    const data = await getHSCodes(query);
    res.status(200).json({
      statusCode: 200,
      data,
      query
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Download filtered data as Excel file
 * 
 * This endpoint allows users to export filtered pharmaceutical data
 * Generates Excel file with applied filters and search criteria
 * 
 * Access: Requires parent-level subscription
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.downloadData = async (req, res) => {
  const query = req.body;
  
  try {
    // Get filtered data based on search criteria
    const data = await getDataFiltered(query);
    
    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Pharmaceutical Data');
    
    // Add headers and data to worksheet
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      worksheet.addRow(headers);
      
      data.forEach(row => {
        worksheet.addRow(Object.values(row));
      });
    }
    
    // Set response headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="pharmaceutical_data.xlsx"');
    
    // Send Excel file
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};