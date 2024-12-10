const cron = require('node-cron');
const Redis = require('ioredis');
const ImportModel = require('../models/import.model')
const ExportModel = require('../models/export.model')
const redis = require('../config/chached-config')


redis.on('connect', () => {
    console.log('Connected to Redis');
});

redis.on('error', (err) => {
    console.error('Redis error:', err);
});


const fetchAndCacheData = async () => {
  try {

    const importData = await ImportModel.findAll({
      attributes: ['H_S_Code', 'productName', 'productDescription'],
    });

    
    const exportData = await ExportModel.findAll({
      attributes: ['H_S_Code', 'productName', 'productDescription'],
    });

    
    await redis.setex('import_suggested_data', 86400, JSON.stringify(importData));
    await redis.setex('export_suggested_data', 86400, JSON.stringify(exportData));

    console.log('Data cached successfully');
  } catch (error) {
    console.error('Error fetching and caching data:', error);
  }
};


cron.schedule('0 0 * * *', () => {
  console.log('Running the cron job to fetch and cache data...');
  fetchAndCacheData();
});


fetchAndCacheData();
