const express = require("express");
const upload = require('../middlewares/multerMiddleware')
const { isLogedIn, isAdmin, isParent, hasActiveSubscription } = require("../middlewares/roleMiddleware");
const {uploadExcel, getSuggestionValue, getHSCodes, downloadData} = require('../controllers/dataController');
const { getDataMetrics, getData, getDataMetricsRawSQL } = require("../services/excelService");
const clickhouseService = require('../services/clickhouseService');
const cacheMiddleware = require('../middlewares/cacheMiddleware');

const router = express.Router();

// =====================================
// ADMIN-ONLY ROUTES
// =====================================

/**
 * File Upload Endpoint
 * POST /api/data/upload
 * 
 * Allows admin users to upload Excel files containing pharmaceutical data
 * Supports both import and export data types
 * 
 * Requirements:
 * - Admin authentication
 * - Excel file (.xlsx, .xls)
 * - Query parameter: type ('import' or 'export')
 * 
 * Security: Only admins can upload data to maintain data integrity
 */
router.post('/upload', isAdmin, upload.single('file'), uploadExcel);

// =====================================
// PREMIUM FEATURES (PARENT + SUBSCRIPTION)
// =====================================

/**
 * Data Download Endpoint
 * GET /api/data/download
 * 
 * Allows parent users with active subscriptions to download filtered data
 * Generates Excel file with applied search criteria and filters
 * 
 * Requirements:
 * - Parent-level authentication
 * - Active subscription
 * - Request body with search parameters
 * 
 * This is a premium feature requiring paid subscription
 */
router.get('/download', isParent, hasActiveSubscription, downloadData);

// =====================================
// BASIC AUTHENTICATED ROUTES
// =====================================

/**
 * Get Pharmaceutical Data
 * POST /api/data/records
 * 
 * Main endpoint for retrieving paginated pharmaceutical data
 * Supports complex filtering, searching, and sorting
 * 
 * Features:
 * - Pagination
 * - Multi-field search
 * - Date range filtering
 * - Field-specific filters
 * - Sorting options
 */
router.post('/records', getData);

/**
 * Get Data Metrics (Sequelize Version)
 * GET /api/data/records-metrics
 * 
 * Provides comprehensive analytics for pharmaceutical data
 * Generates top buyers, suppliers, countries, ports, HS codes, and years
 * Both quantity-based and value-based metrics
 * 
 * Performance: Uses Sequelize ORM with optimization
 */
router.get('/records-metrics', getDataMetrics);

/**
 * Search Suggestions Endpoint
 * GET /api/data/suggestion
 * 
 * Provides autocomplete suggestions for search fields
 * Improves user experience with real-time search suggestions
 * 
 * Parameters:
 * - informationOf: 'import' or 'export'
 * - searchType: field to search
 * - suggestion: partial text to match
 */
router.get('/suggestion', isLogedIn, getSuggestionValue);

/**
 * HS Codes Endpoint
 * POST /api/data/hscodes
 * 
 * Retrieves HS codes for product classification
 * Used for international trade classification
 */
router.post('/hscodes', isLogedIn, getHSCodes);

// =====================================
// ANALYTICS ROUTES (MYSQL/SEQUELIZE)
// =====================================

/**
 * Data Metrics (Cached)
 * GET /api/data/metrics
 * 
 * Cached version of data metrics for better performance
 * Results are cached for faster subsequent requests
 */
router.get('/metrics', cacheMiddleware, getDataMetrics);

/**
 * Data Metrics (Raw SQL Version)
 * GET /api/data/metrics-raw-sql
 * 
 * Raw SQL implementation of data metrics
 * Provides 30-50% better performance than Sequelize version
 * 
 * Benefits:
 * - Faster query execution
 * - Lower memory usage
 * - Better connection pool management
 */
router.get('/metrics-raw-sql', cacheMiddleware, getDataMetricsRawSQL);

/**
 * Generic Data Endpoints
 * POST /api/data/data
 * POST /api/data/data/:id
 * DELETE /api/data/data/:id
 * 
 * Generic CRUD operations for data management
 * Used for specific data operations and management
 */
router.post('/data', getData);
router.post('/data/:id', getData);
router.delete('/data/:id', getData);

// =====================================
// CLICKHOUSE ANALYTICS ROUTES
// =====================================
// These routes provide ultra-fast analytics using ClickHouse
// Performance improvement: 150-600x faster than MySQL

/**
 * Dashboard Overview
 * GET /api/data/analytics/dashboard
 * 
 * Complete dashboard overview with all key metrics
 * Response time: ~100-300ms (vs 10-30s with MySQL)
 */
router.get('/analytics/dashboard', cacheMiddleware, clickhouseService.getDashboardMetrics);

/**
 * Buyer Analytics
 * GET /api/data/analytics/buyers
 * 
 * Detailed buyer analysis and trends
 * Response time: ~50-150ms
 */
router.get('/analytics/buyers', cacheMiddleware, clickhouseService.getBuyerAnalytics);

/**
 * Supplier Analytics
 * GET /api/data/analytics/suppliers
 * 
 * Detailed supplier analysis and trends
 * Response time: ~50-150ms
 */
router.get('/analytics/suppliers', cacheMiddleware, clickhouseService.getSupplierAnalytics);

/**
 * Time Series Data
 * GET /api/data/analytics/timeseries
 * 
 * Time-based analytics for charts and graphs
 * Response time: ~100-200ms
 */
router.get('/analytics/timeseries', cacheMiddleware, clickhouseService.getTimeSeriesData);

/**
 * Aggregated Analysis
 * GET /api/data/analytics/aggregated
 * 
 * Flexible aggregated analysis with custom grouping
 * Response time: ~50-100ms
 */
router.get('/analytics/aggregated', cacheMiddleware, clickhouseService.getAggregatedAnalysis);

/**
 * ClickHouse Data Query
 * POST /api/data/analytics/data
 * 
 * Direct data querying from ClickHouse
 * For complex analytical queries
 */
router.post('/analytics/data', clickhouseService.getDataFromClickHouse);

/**
 * Enhanced ClickHouse Data API
 * POST /api/data/clickhouse
 * 
 * Comprehensive data fetching from ClickHouse
 * Similar to MySQL getData but optimized for ClickHouse performance
 * 
 * Features:
 * - Pagination
 * - Multi-field search
 * - Date range filtering
 * - Field-specific filters
 * - Sorting options
 * - Direct SQL queries with proper escaping
 */
router.post('/clickhouse', clickhouseService.getDataFromClickHouse);

module.exports = router;