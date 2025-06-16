const fs = require('fs');
const path = require('path');
const { parseAndInsertExcel, getData, getSuggestedData, getHSCodes, getDataFiltered, getDataSummary } = require('../services/excelService');
const ExcelJS = require('exceljs');

exports.uploadExcel = async (req, res) => {
  const file = req.file;
  const type = req.query.type;
  const fileExt = file.originalname.split('.')

  if (fileExt[fileExt.length - 1] !== 'xlsx' && fileExt[fileExt.length - 1] !== 'xlx') {
    return res.status(401).send('File is not in expected format. system support excel file only')
  }

  if (!type) return res.status(401).send("Please select file type")

  if (!file) {
    return res.status(400).send('No file selected');
  }

  try {
    const filePath = path.resolve(file.path);
    await parseAndInsertExcel(filePath, type);

    // fs.unlinkSync(filePath);
    res.status(200).json({ message: 'File processed and data inserted successfully' });
  } catch (err) {
    // fs.unlinkSync(filePath);
    res.status(500).json({ error: err.message });
  }
};



exports.getSuggestionValue = async (req, res) => {
  const query = req.query;
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

exports.getHSCodes = async (req, res) => {
  const query = req.body;
  if (!query.informationOf || !query.dataType) {
    return res.status(400).send({
      statusCode: 400,
      message: "Please provide informationOf and dataType in request body",
      query
    });
  }

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

exports.downloadData = async (req, res) => {
  const query = req.query;
  const format = req.query.format || 'xlsx'; // Default to xlsx if not specified

  try {
    const result = await getData(query);
    const data = result.data;

    if (!data || data.length === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: 'No data found for the given criteria'
      });
    }

    // Create a new workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data');

    // Get headers from the first row
    const headers = Object.keys(data[0].dataValues || data[0]);
    worksheet.columns = headers.map(header => ({ header, key: header, width: 20 }));

    // Add rows
    data.forEach(item => {
      worksheet.addRow(item.dataValues || item);
    });

    // Style the header row
    worksheet.getRow(1).font = { bold: true };

    res.setHeader('Content-Type', format === 'csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=data.${format}`);

    if (format === 'csv') {
      await workbook.csv.write(res);
    } else {
      await workbook.xlsx.write(res);
    }

    res.end();
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: err.message });
  }
};