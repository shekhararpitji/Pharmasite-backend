const fs = require('fs');
const path = require('path');
const { parseAndInsertExcel } = require('../services/excelService');

exports.uploadExcel = async (req, res) => {
    const file = req.file;
    const type = req.query.type;
    const fileExt = file.originalname.split('.')
    
    if(fileExt[fileExt.length -1] !== 'xlsx' && fileExt[fileExt.length -1] !== 'xlx'){
      return res.status(401).send('File is not in expected format. system support excel file only')
    }
    
    if(!type) return res.status(401).send("Please select file type")
  
    if (!file) {
      return res.status(400).send('No file selected');
    }
  
    try {
      const filePath = path.resolve(file.path);
      await parseAndInsertExcel(filePath, type);
  
      fs.unlinkSync(filePath);
  
      res.status(200).json({ message: 'File processed and data inserted successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };