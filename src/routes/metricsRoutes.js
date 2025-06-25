const express = require('express');
const router = express.Router();
const metricsController = require('../controllers/metricsController.js');
const cacheMiddleware = require('../middlewares/cacheMiddleware');

router.get('/top-buyers-by-quantity', cacheMiddleware, metricsController.getTopBuyersByQuantity);
router.get('/top-years-by-quantity', cacheMiddleware, metricsController.getTopYearsByQuantity);
router.get('/top-HSCode-by-quantity', cacheMiddleware, metricsController.getTopHSCodeByQuantity);
router.get('/top-suppliers-by-quantity', cacheMiddleware, metricsController.getTopSuppliersByQuantity);
router.get('/top-country-by-quantity', cacheMiddleware, metricsController.getTopCountryByQuantity);
router.get('/top-indian-port-by-quantity', cacheMiddleware, metricsController.getTopIndianPortByQuantity);
router.get('/top-buyers-by-value', cacheMiddleware, metricsController.getTopBuyersByValue);
router.get('/top-years-by-value', cacheMiddleware, metricsController.getTopYearsByValue);
router.get('/top-HSCode-by-value', cacheMiddleware, metricsController.getTopHSCodeByValue);
router.get('/top-suppliers-by-value', cacheMiddleware, metricsController.getTopSuppliersByValue);
router.get('/top-country-by-value', cacheMiddleware, metricsController.getTopCountryByValue);
router.get('/top-indian-port-by-value', cacheMiddleware, metricsController.getTopIndianPortByValue);
router.get('/summary-stats', cacheMiddleware, metricsController.getSummaryStats);
router.get('/filter-values', cacheMiddleware, metricsController.getFilterValues);
router.get('/filters/metadata', cacheMiddleware, metricsController.getFilterMetadata);
router.get('/filters/search', cacheMiddleware, metricsController.searchFilterValues);
router.get('/filters/values/:field', cacheMiddleware, metricsController.getFilterValuesByField);

module.exports = router;