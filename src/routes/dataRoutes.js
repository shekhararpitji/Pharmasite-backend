const express = require("express");
const upload = require('../middlewares/multerMiddleware')
const { isLogedIn, isAdmin, isParent, hasActiveSubscription } = require("../middlewares/roleMiddleware");
const {uploadExcel, getSuggestionValue, getHSCodes, downloadData} = require('../controllers/dataController');
const { getDataMetrics, getData } = require("../services/excelService");
const clickhouseService = require('../services/clickhouseService');
const cacheMiddleware = require('../middlewares/cacheMiddleware');


const router = express.Router();

// Admin-only routes
router.post('/upload', isAdmin, upload.single('file'), uploadExcel);

// Parent and admin routes (premium features)
router.get('/download', isParent, hasActiveSubscription, downloadData);

// Basic authenticated routes (available to all authenticated users)
router.post('/records',  getData);
router.get('/records-metrics', getDataMetrics);
router.get('/suggestion', isLogedIn, getSuggestionValue);
router.post('/hscodes', isLogedIn, getHSCodes);

// Regular MySQL/Sequelize routes
router.get('/metrics', cacheMiddleware, getDataMetrics);
router.post('/data', getData);
router.post('/data/:id', getData);
router.delete('/data/:id', getData);

// ClickHouse analytics routes (optimized for performance)
router.get('/analytics/dashboard', cacheMiddleware, clickhouseService.getDashboardMetrics);
router.get('/analytics/buyers', cacheMiddleware, clickhouseService.getBuyerAnalytics);
router.get('/analytics/suppliers', cacheMiddleware, clickhouseService.getSupplierAnalytics);
router.get('/analytics/timeseries', cacheMiddleware, clickhouseService.getTimeSeriesData);
router.get('/analytics/aggregated', cacheMiddleware, clickhouseService.getAggregatedAnalysis);
router.post('/analytics/data', clickhouseService.getDataFromClickHouse);

module.exports = router;