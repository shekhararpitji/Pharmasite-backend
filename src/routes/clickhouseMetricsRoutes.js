const express = require('express');
const router = express.Router();
const clickhouseMetricsController = require('../controllers/clickhouseMetricsController.js');
const clickhouseService = require('../services/clickhouseService.js');
const cacheMiddleware = require('../middlewares/cacheMiddleware');

// Comprehensive metrics route - combines all top metrics in a single API call
router.get('/all-top-metrics', cacheMiddleware, clickhouseMetricsController.getAllTopMetrics);
router.get('/suggestion', cacheMiddleware, clickhouseMetricsController.getClickHouseSuggestedData);
router.get('/clickhouse', cacheMiddleware, clickhouseMetricsController.getDataFromClickHouse);
router.get('/download-csv', clickhouseMetricsController.downloadDataAsCSV);
router.get('/download-csv-stream', clickhouseMetricsController.downloadDataAsCSVStream);
// router.get('/download-csv-pipeline', clickhouseMetricsController.downloadDataAsCSVPipeline);

// Summary and filter routes (ClickHouse optimized)
router.get('/summary-stats', cacheMiddleware, clickhouseMetricsController.getSummaryStats);
router.get('/filter-values', cacheMiddleware, clickhouseMetricsController.getFilterValues);
router.get('/filters/metadata', cacheMiddleware, clickhouseMetricsController.getFilterMetadata);
router.get('/filters/search', cacheMiddleware, clickhouseMetricsController.searchFilterValues);
router.get('/filters/values/:field', cacheMiddleware, clickhouseMetricsController.getFilterValuesByField);
// Chapters endpoint - returns distinct chapter codes present in the DB
router.get('/chapters', cacheMiddleware, clickhouseMetricsController.getChapters);

module.exports = router; 