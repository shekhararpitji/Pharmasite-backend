const fs = require('fs');
const path = require('path');
const { parseAndInsertExcel } = require('../services/excelService');

exports.uploadExcel = async (req, res) => {
    const file = req.file;
  
    if (!file) {
      return res.status(400).send('No file uploaded');
    }
  
    try {
      const filePath = path.resolve(file.path);
      await parseAndInsertExcel(filePath);
  
      fs.unlinkSync(filePath);
  
      res.status(200).json({ message: 'File processed and data inserted successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };