const fs = require('fs');
const path = require('path');
const { parseAndInsertExcel, getData, getSuggestedData } = require('../services/excelService');

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
      fs.unlinkSync(filePath);
      res.status(500).json({ error: err.message });
    }
  };

  exports.getData = async (req, res) => {
    const query = req.query;
    
    // Validate required fields
    if(!query.informationOf) {
      return res.status(400).json({
        statusCode: 400,
        message: "Missing required field: informationOf",
        query
      });
    }

    // Validate date format if duration is provided
    if(query.duration) {
      const datePattern = /^\d{2}\/\d{2}\/\d{4}-\d{2}\/\d{2}\/\d{4}$/;
      if(!datePattern.test(query.duration)) {
        return res.status(400).json({
          statusCode: 400,
          message: "Invalid duration format. Expected: DD/MM/YYYY-DD/MM/YYYY",
          query
        });
      }
    }

    try {
      const data = await getData(query)
      res.status(200).json({
        statusCode: 200,
        data,
        query,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error in getData controller:', err);
      res.status(500).json({ 
        statusCode: 500,
        error: err.message,
        message: 'Internal server error while fetching data'
      });
    }
  };


  exports.getSuggestionValue = async (req, res) => {
    const query = req.query;
    if(!query.informationOf || !query.chapter || !query.searchType || !query.suggestion){
      return res.status(400).send({
        statusCode:400,
        message:"Provide neccessary fields in search query",
        query
      })
    }
    try {
      const data = await getSuggestedData(query)
      res.status(200).json({
        statusCode:200,
        data,
        query
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };