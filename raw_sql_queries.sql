-- Raw SQL Queries for getDataMetrics function
-- This file contains the equivalent SQL queries for the Sequelize-based getDataMetrics function

-- =============================================
-- 1. BASE WHERE CLAUSE CONSTRUCTION
-- =============================================

-- The base WHERE clause is built dynamically based on:
-- - searchType and searchValue (multiple LIKE conditions)
-- - Date range filtering
-- - Additional filters from query parameters

-- Example base WHERE clause:
-- WHERE (
--   (fieldName LIKE '%searchValue1%' OR fieldName LIKE '%searchValue2%' OR ...)
--   AND shippingBillDate BETWEEN 'startDate' AND 'endDate'
--   AND filterField1 IN ('value1', 'value2', ...)
--   AND filterField2 IN ('value3', 'value4', ...)
-- )

-- =============================================
-- 2. GROUPED DATA QUERIES (Main Metrics)
-- =============================================

-- Template for grouped queries:
-- SELECT 
--   groupByField,
--   SUM(aggregateField) as total,
--   COUNT(*) as count
-- FROM table_name
-- WHERE [base_where_clause]
-- GROUP BY groupByField
-- ORDER BY total DESC
-- LIMIT 6;

-- Top Buyers by Quantity
SELECT 
  buyer,
  SUM(quantity) as total,
  COUNT(*) as count
FROM ExportData  -- or import_data based on informationOf parameter
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')  -- example searchType
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')  -- example filter
)
GROUP BY buyer
ORDER BY total DESC
LIMIT 6;

-- Top Suppliers by Quantity
SELECT 
  supplier,
  SUM(quantity) as total,
  COUNT(*) as count
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
GROUP BY supplier
ORDER BY total DESC
LIMIT 6;

-- Top Countries by Quantity
SELECT 
  buyerCountry,
  SUM(quantity) as total,
  COUNT(*) as count
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
GROUP BY buyerCountry
ORDER BY total DESC
LIMIT 6;

-- Top Indian Ports by Quantity
SELECT 
  portOfOrigin,
  SUM(quantity) as total,
  COUNT(*) as count
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
GROUP BY portOfOrigin
ORDER BY total DESC
LIMIT 6;

-- Top HS Codes by Quantity
SELECT 
  H_S_Code,
  SUM(quantity) as total,
  COUNT(*) as count
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
GROUP BY H_S_Code
ORDER BY total DESC
LIMIT 6;

-- Top Years by Quantity
SELECT 
  year,
  SUM(quantity) as total,
  COUNT(*) as count
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
GROUP BY year
ORDER BY total DESC
LIMIT 6;

-- =============================================
-- VALUE-BASED QUERIES (Replace quantity with totalValueInvoice)
-- =============================================

-- Top Buyers by Value
SELECT 
  buyer,
  SUM(totalValueInvoice) as total,
  COUNT(*) as count
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
GROUP BY buyer
ORDER BY total DESC
LIMIT 6;

-- Top Suppliers by Value
SELECT 
  supplier,
  SUM(totalValueInvoice) as total,
  COUNT(*) as count
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
GROUP BY supplier
ORDER BY total DESC
LIMIT 6;

-- Top Countries by Value
SELECT 
  buyerCountry,
  SUM(totalValueInvoice) as total,
  COUNT(*) as count
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
GROUP BY buyerCountry
ORDER BY total DESC
LIMIT 6;

-- Top Indian Ports by Value
SELECT 
  portOfOrigin,
  SUM(totalValueInvoice) as total,
  COUNT(*) as count
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
GROUP BY portOfOrigin
ORDER BY total DESC
LIMIT 6;

-- Top HS Codes by Value
SELECT 
  H_S_Code,
  SUM(totalValueInvoice) as total,
  COUNT(*) as count
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
GROUP BY H_S_Code
ORDER BY total DESC
LIMIT 6;

-- Top Years by Value
SELECT 
  year,
  SUM(totalValueInvoice) as total,
  COUNT(*) as count
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
GROUP BY year
ORDER BY total DESC
LIMIT 6;

-- =============================================
-- 3. SUMMARY STATISTICS QUERY
-- =============================================

SELECT 
  SUM(quantity) as totalQuantity,
  SUM(totalValueUSD) as totalValueUSD,
  COUNT(*) as totalRecords,
  COUNT(DISTINCT buyer) as uniqueBuyers,
  COUNT(DISTINCT supplier) as uniqueSuppliers
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
);

-- =============================================
-- 4. FILTER DISTINCT VALUES QUERIES
-- =============================================

-- Get distinct values for Indian Port filter
SELECT DISTINCT portOfOrigin
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
AND portOfOrigin IS NOT NULL
LIMIT 100;

-- Get distinct values for H S Code filter
SELECT DISTINCT H_S_Code
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
AND H_S_Code IS NOT NULL
LIMIT 100;

-- Get distinct values for Quantity Units filter
SELECT DISTINCT quantityUnit
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
AND quantityUnit IS NOT NULL
LIMIT 100;

-- Get distinct values for Unit Price filter
SELECT DISTINCT standardUnitRateUSD
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
AND standardUnitRateUSD IS NOT NULL
LIMIT 100;

-- Get distinct values for Currency filter
SELECT DISTINCT currency
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
AND currency IS NOT NULL
LIMIT 100;

-- Get distinct values for Indian Company filter
SELECT DISTINCT supplier
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
AND supplier IS NOT NULL
LIMIT 100;

-- Get distinct values for Foreign Company filter
SELECT DISTINCT buyer
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
AND buyer IS NOT NULL
LIMIT 100;

-- Get distinct values for Foreign Country filter
SELECT DISTINCT buyerCountry
FROM ExportData
WHERE (
  (productName LIKE '%searchValue1%' OR productName LIKE '%searchValue2%')
  AND shippingBillDate BETWEEN '2023-01-01' AND '2023-12-31'
  AND portOfOrigin IN ('Mumbai', 'Chennai')
)
AND buyerCountry IS NOT NULL
LIMIT 100;

-- =============================================
-- NOTES FOR IMPLEMENTATION:
-- =============================================

-- 1. Replace 'ExportData' with 'import_data' when informationOf = 'import'
-- 2. Replace searchType field (e.g., 'productName') with actual field from query
-- 3. Replace searchValue1, searchValue2 with actual search values from query
-- 4. Replace date range with actual startDate and endDate from query
-- 5. Build filter conditions dynamically based on query.filters object
-- 6. Field mappings need to be applied when building WHERE clauses:
--    - "Indian Port" -> portOfOrigin
--    - "H S Code" -> H_S_Code
--    - "Quantity Units" -> quantityUnit
--    - "Unit Price" -> standardUnitRateUSD
--    - "Currency" -> currency
--    - "Indian Company" -> supplier
--    - "Foreign Company" -> buyer
--    - "Foreign Country" -> buyerCountry

-- 7. All queries should be executed concurrently for optimal performance
-- 8. Add appropriate error handling for each query
-- 9. Consider using prepared statements for better security and performance
-- 10. Add connection timeout and query timeout settings 