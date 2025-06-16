const express = require("express");
const upload = require('../middlewares/multerMiddleware')
const { isLogedIn, isAdmin, isParent, hasActiveSubscription } = require("../middlewares/roleMiddleware");
const {uploadExcel, getData, getSuggestionValue, getHSCodes, downloadData} = require('../controllers/dataController');
const { getDataMetrics } = require("../services/excelService");


const router = express.Router();

// Admin-only routes
router.post('/upload', isAdmin, upload.single('file'), uploadExcel);

// Parent and admin routes (premium features)
router.get('/download', isParent, hasActiveSubscription, downloadData);

// Basic authenticated routes (available to all authenticated users)
router.get('/records', isLogedIn, getData);
router.get('/records-metrics', getDataMetrics);
router.get('/suggestion', isLogedIn, getSuggestionValue);
router.post('/hscodes', isLogedIn, getHSCodes);

module.exports = router;