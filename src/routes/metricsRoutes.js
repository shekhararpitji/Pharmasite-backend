const express = require('express');
const router = express.Router();
const metricsController = require('../controllers/metricsController.js');

router.post('/top-buyers-by-quantity', metricsController.getTopBuyersByQuantity);
router.post('/top-years-by-quantity', metricsController.getTopYearsByQuantity);
router.post('/top-HSCode-by-quantity', metricsController.getTopHSCodeByQuantity);
router.post('/top-suppliers-by-quantity', metricsController.getTopSuppliersByQuantity);
router.post('/top-country-by-quantity', metricsController.getTopCountryByQuantity);
router.post('/top-indian-port-by-quantity', metricsController.getTopIndianPortByQuantity);
router.post('/top-buyers-by-value', metricsController.getTopBuyersByValue);
router.post('/top-years-by-value', metricsController.getTopYearsByValue);
router.post('/top-HSCode-by-value', metricsController.getTopHSCodeByValue);
router.post('/top-suppliers-by-value', metricsController.getTopSuppliersByValue);
router.post('/top-country-by-value', metricsController.getTopCountryByValue);
router.post('/top-indian-port-by-value', metricsController.getTopIndianPortByValue);
router.post('/summary-stats', metricsController.getSummaryStats);
router.post('/filter-values', metricsController.getFilterValues);

module.exports = router;