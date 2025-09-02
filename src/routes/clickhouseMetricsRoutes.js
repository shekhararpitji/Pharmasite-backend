const express = require('express');
const router = express.Router();
const clickhouseMetricsController = require('../controllers/clickhouseMetricsController.js');
const clickhouseService = require('../services/clickhouseService.js');
const cacheMiddleware = require('../middlewares/cacheMiddleware');

// Comprehensive metrics route - combines all top metrics in a single API call
router.get('/all-top-metrics', cacheMiddleware, clickhouseMetricsController.getAllTopMetrics);
router.get('/suggestion', cacheMiddleware, clickhouseMetricsController.getClickHouseSuggestedData);
router.get('/clickhouse', cacheMiddleware, clickhouseMetricsController.getDataFromClickHouse);
router.get('/download-xlsx', clickhouseMetricsController.downloadDataAsXLSX);



// Quantity-based metrics routes (ClickHouse optimized)
// router.get('/top-buyers-by-quantity', cacheMiddleware, clickhouseMetricsController.getTopBuyersByQuantity);
// router.get('/top-years-by-quantity', cacheMiddleware, clickhouseMetricsController.getTopYearsByQuantity);
// router.get('/top-HSCode-by-quantity', cacheMiddleware, clickhouseMetricsController.getTopHSCodeByQuantity);
// router.get('/top-suppliers-by-quantity', cacheMiddleware, clickhouseMetricsController.getTopSuppliersByQuantity);
// router.get('/top-country-by-quantity', cacheMiddleware, clickhouseMetricsController.getTopCountryByQuantity);
// router.get('/top-indian-port-by-quantity', cacheMiddleware, clickhouseMetricsController.getTopIndianPortByQuantity);

// // Value-based metrics routes (ClickHouse optimized)
// router.get('/top-buyers-by-value', cacheMiddleware, clickhouseMetricsController.getTopBuyersByValue);
// router.get('/top-years-by-value', cacheMiddleware, clickhouseMetricsController.getTopYearsByValue);
// router.get('/top-HSCode-by-value', cacheMiddleware, clickhouseMetricsController.getTopHSCodeByValue);
// router.get('/top-suppliers-by-value', cacheMiddleware, clickhouseMetricsController.getTopSuppliersByValue);
// router.get('/top-country-by-value', cacheMiddleware, clickhouseMetricsController.getTopCountryByValue);
// router.get('/top-indian-port-by-value', cacheMiddleware, clickhouseMetricsController.getTopIndianPortByValue);

// Summary and filter routes (ClickHouse optimized)
router.get('/summary-stats', cacheMiddleware, clickhouseMetricsController.getSummaryStats);
router.get('/filter-values', cacheMiddleware, clickhouseMetricsController.getFilterValues);
router.get('/filters/metadata', cacheMiddleware, clickhouseMetricsController.getFilterMetadata);
router.get('/filters/search', cacheMiddleware, clickhouseMetricsController.searchFilterValues);
router.get('/filters/values/:field', cacheMiddleware, clickhouseMetricsController.getFilterValuesByField);

module.exports = router; 