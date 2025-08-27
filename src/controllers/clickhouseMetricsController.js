const { clickhouse } = require('../config/clickhouse');
const { queryModifier } = require('../utils/queryModifier');
const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';

// Field mappings for frontend vs database field names
const fieldMappings = {
  "Indian Port": "portOfOrigin",
  "H S Code": "H_S_Code",
  "Quantity Units": "quantityUnit",
  "Unit Price": "standardUnitRateUSD",
  "Currency": "currency",
  "Product Name": "productName",
  "Indian Company": "supplier",
  "Foreign Company": "buyer",
  "Foreign Country": "buyerCountry",
  "CAS Number": "CAS_Number",
};

// Helper function to convert datetime string to date format
const convertToDateString = (dateString) => {
  if (!dateString) return null;
  // If it's already a date string (YYYY-MM-DD), return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  // If it's a datetime string, extract the date part
  if (dateString.includes(' ')) {
    return dateString.split(' ')[0];
  }
  // If it's a Date object or other format, try to convert
  try {
    return new Date(dateString).toISOString().split('T')[0];
  } catch (error) {
    console.warn('Invalid date format:', dateString);
    return null;
  }
};

// Build ClickHouse WHERE clause from query parameters
const buildClickHouseWhereClause = (query, modifiedQuery) => {
  let whereConditions = [];

  console.log('buildClickHouseWhereClause - query:', query);
  console.log('buildClickHouseWhereClause - modifiedQuery:', modifiedQuery);

  // Date range filter - prioritize modifiedQuery dates (from queryModifier)
  if (modifiedQuery.startDate && modifiedQuery.endDate) {
    console.log('Using modifiedQuery dates:', modifiedQuery.startDate, modifiedQuery.endDate);
    // Convert datetime strings to date format for ClickHouse
    const startDate = convertToDateString(modifiedQuery.startDate);
    const endDate = convertToDateString(modifiedQuery.endDate);
    if (startDate && endDate) {
      whereConditions.push(`shippingBillDate BETWEEN '${startDate}' AND '${endDate}'`);
    }
  } else if (query.startDate && query.endDate) {
    console.log('Using direct query dates:', query.startDate, query.endDate);
    // Handle direct startDate/endDate parameters
    const startDate = convertToDateString(query.startDate);
    const endDate = convertToDateString(query.endDate);
    if (startDate && endDate) {
      whereConditions.push(`shippingBillDate BETWEEN '${startDate}' AND '${endDate}'`);
    }
  } else {
    console.log('No date parameters found, skipping date filter');
  }
  // If no date parameters are provided, don't add any date filter (query all data)

  // Search filter
  if (query.searchType && query.searchValue) {
    query.searchValue = query.searchValue.split(',');
    const searchValues = Array.isArray(query.searchValue) ? query.searchValue : [query.searchValue];
    const searchConditions = searchValues.map(value => {
      const escapedValue = value.replace(/'/g, "''"); // Escape single quotes
      return `${query.searchType} ILIKE '%${escapedValue}%'`;
    });
    whereConditions.push(`(${searchConditions.join(' OR ')})`);
  }

  // Additional filters
  if (query.filters && typeof query.filters === 'object') {
    for (const [field, values] of Object.entries(query.filters)) {
      if (Array.isArray(values) && values.length > 0) {
        const dbColumnName = fieldMappings[field] || field;
        const escapedValues = values.map(value => {
          const escapedValue = value.replace(/'/g, "''"); // Escape single quotes
          return `'${escapedValue}'`;
        });
        whereConditions.push(`${dbColumnName} IN (${escapedValues.join(', ')})`);
      }
    }
  }

  console.log('Final whereConditions:', whereConditions);
  
  return {
    whereClause: whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '',
    params: {} // No params needed for normal queries
  };
};

// Get table name based on information type
const getTableName = (informationOf) => {
  // Default to export if not specified
  const infoType = informationOf || 'export';
  return infoType === 'import' ? 'import_data' : 'export_data';
};

// Generic function to get grouped data from ClickHouse
const getClickHouseGroupedData = async (tableName, whereClause, groupByField, aggregateField, limit = 6) => {
  try {
    const query = `
      SELECT 
        ${groupByField},
        sum(${aggregateField}) as total,
        count(*) as count
      FROM ${DATABASE_NAME}.${tableName}
      ${whereClause}
      GROUP BY ${groupByField}
      ORDER BY total DESC
      LIMIT ${limit}
    `;

    console.log('Debug - Final Query:', query);

    const result = await clickhouse.query({
      query
    });

    const resultData = await result.json();
    console.log('Debug - Query result type:', typeof resultData);
    console.log('Debug - Query result:', resultData);
    
    // Handle different result structures
    let rows;
    if (resultData && resultData.data && Array.isArray(resultData.data)) {
      rows = resultData.data;
    } else if (Array.isArray(resultData)) {
      rows = resultData;
    } else {
      console.error('Unexpected result structure:', resultData);
      return [];
    }
    
    return rows.map(item => ({
      [groupByField]: item[groupByField],
      total: parseFloat(item.total || 0),
      count: parseInt(item.count || 0)
    }));
  } catch (error) {
    console.error('Error in getClickHouseGroupedData:', error);
    throw error;
  }
};

// QUANTITY-BASED METRICS

// Get top buyers by quantity
exports.getTopBuyersByQuantity = async (req, res) => {
  try {
    const query = req.query;
    
    // Test: Create a simple modifiedQuery without using queryModifier
    const modifiedQuery = {
      informationOf: query.informationOf || 'export',
      startDate: '1970-01-01',
      endDate: '2023-12-31'
    };
    
    console.log('Test - Using hardcoded dates instead of queryModifier');
    
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    console.log('Debug - Query:', query);
    console.log('Debug - Modified Query:', modifiedQuery);
    console.log('Debug - Where Clause:', whereClause);
    console.log('Debug - Params:', params);
    console.log('Debug - Table Name:', tableName);
    console.log('Debug - Database Name:', DATABASE_NAME);

    const data = await getClickHouseGroupedData(tableName, whereClause, 'buyer', 'quantity');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topBuyersByQuantity: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top buyers by quantity:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Get top years by quantity
exports.getTopYearsByQuantity = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const data = await getClickHouseGroupedData(tableName, whereClause, 'year', 'quantity');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topYearByQuantity: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top year by quantity:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Get top HS codes by quantity
exports.getTopHSCodeByQuantity = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const data = await getClickHouseGroupedData(tableName, whereClause, 'H_S_Code', 'quantity');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topHSCodeByQuantity: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top HSCode by quantity:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Get top suppliers by quantity
exports.getTopSuppliersByQuantity = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const data = await getClickHouseGroupedData(tableName, whereClause, 'supplier', 'quantity');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topSuppliersByQuantity: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top suppliers by quantity:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Get top countries by quantity
exports.getTopCountryByQuantity = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const data = await getClickHouseGroupedData(tableName, whereClause, 'buyerCountry', 'quantity');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topCountryByQuantity: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top countries by quantity:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Get top Indian ports by quantity
exports.getTopIndianPortByQuantity = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const data = await getClickHouseGroupedData(tableName, whereClause, 'portOfOrigin', 'quantity');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topIndianPortByQuantity: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top Indian ports by quantity:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// VALUE-BASED METRICS

// Get top buyers by value
exports.getTopBuyersByValue = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const data = await getClickHouseGroupedData(tableName, whereClause, 'buyer', 'totalValueInvoice');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topBuyersByValue: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top buyers by value:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Get top years by value
exports.getTopYearsByValue = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const data = await getClickHouseGroupedData(tableName, whereClause, 'year', 'totalValueInvoice');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topYearsByValue: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top years by value:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Get top HS codes by value
exports.getTopHSCodeByValue = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const data = await getClickHouseGroupedData(tableName, whereClause, 'H_S_Code', 'totalValueInvoice');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topHSCodeByValue: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top HS_Code by value:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Get top suppliers by value
exports.getTopSuppliersByValue = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const data = await getClickHouseGroupedData(tableName, whereClause, 'supplier', 'totalValueInvoice');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topSuppliersByValue: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top suppliers by value:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Get top countries by value
exports.getTopCountryByValue = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const data = await getClickHouseGroupedData(tableName, whereClause, 'buyerCountry', 'totalValueInvoice');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topCountryByValue: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top countries by value:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Get top Indian ports by value
exports.getTopIndianPortByValue = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const data = await getClickHouseGroupedData(tableName, whereClause, 'portOfOrigin', 'totalValueInvoice');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topIndianPortByValue: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top Indian ports by value:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// SUMMARY AND FILTER UTILITIES

// Get summary statistics
exports.getSummaryStats = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const summaryQuery = `
      SELECT 
        count(*) as totalRecords,
        sum(quantity) as totalQuantity,
        sum(totalValueInvoice) as totalValue,
        avg(totalValueInvoice) as avgValue,
        countDistinct(buyer) as uniqueBuyers,
        countDistinct(supplier) as uniqueSuppliers,
        countDistinct(buyerCountry) as uniqueCountries,
        countDistinct(H_S_Code) as uniqueHSCodes,
        min(shippingBillDate) as earliestDate,
        max(shippingBillDate) as latestDate
      FROM ${DATABASE_NAME}.${tableName}
      ${whereClause}
    `;

    const result = await clickhouse.query({
      query: summaryQuery
    });

    const resultData = await result.json();
    const rows = resultData && resultData.data ? resultData.data : resultData;
    return res.status(200).json({
      statusCode: 200,
      metrics: { summaryStats: rows[0] || {} },
      query
    });
  } catch (error) {
    console.error('Error fetching summary stats:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Get filter values
exports.getFilterValues = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const filterQueries = [
      { key: 'buyers', field: 'buyer' },
      { key: 'suppliers', field: 'supplier' },
      { key: 'countries', field: 'buyerCountry' },
      { key: 'ports', field: 'portOfOrigin' },
      { key: 'hsCodes', field: 'H_S_Code' },
      { key: 'products', field: 'productName' },
      { key: 'years', field: 'year' }
    ];

    const filterPromises = filterQueries.map(async ({ key, field }) => {
      const filterQuery = `
        SELECT DISTINCT ${field} as value
        FROM ${DATABASE_NAME}.${tableName}
        ${whereClause}
        AND ${field} IS NOT NULL
        AND ${field} != ''
        ORDER BY ${field}
        LIMIT 1000
      `;

      const result = await clickhouse.query({
        query: filterQuery
      });

      const resultData = await result.json();
      const rows = resultData && resultData.data ? resultData.data : resultData;
      return [key, rows.map(item => item.value)];
    });

    const filterResults = await Promise.all(filterPromises);
    const filters = Object.fromEntries(filterResults);

    return res.status(200).json({
      statusCode: 200,
      metrics: { filterValues: filters },
      query
    });
  } catch (error) {
    console.error('Error fetching filter values:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Get filter metadata
exports.getFilterMetadata = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const metadataQuery = `
      SELECT 
        countDistinct(buyer) as totalBuyers,
        countDistinct(supplier) as totalSuppliers,
        countDistinct(buyerCountry) as totalCountries,
        countDistinct(portOfOrigin) as totalPorts,
        countDistinct(H_S_Code) as totalHSCodes,
        countDistinct(productName) as totalProducts,
        countDistinct(year) as totalYears,
        min(year) as minYear,
        max(year) as maxYear,
        min(shippingBillDate) as minDate,
        max(shippingBillDate) as maxDate
      FROM ${DATABASE_NAME}.${tableName}
      ${whereClause}
    `;

    const result = await clickhouse.query({
      query: metadataQuery
    });

    const resultData = await result.json();
    const rows = resultData && resultData.data ? resultData.data : resultData;
    return res.status(200).json({
      statusCode: 200,
      metrics: { filterMetadata: rows[0] || {} },
      query
    });
  } catch (error) {
    console.error('Error fetching filter metadata:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Search filter values
exports.searchFilterValues = async (req, res) => {
  try {
    const { field, search, limit = 50 } = req.query;
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);

    if (!field || !search) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Field and search parameters are required'
      });
    }

    const escapedSearch = search.replace(/'/g, "''"); // Escape single quotes
    const searchQuery = `
      SELECT DISTINCT ${field} as value
      FROM ${DATABASE_NAME}.${tableName}
      WHERE ${field} ILIKE '%${escapedSearch}%'
      AND ${field} IS NOT NULL
      AND ${field} != ''
      ORDER BY ${field}
      LIMIT ${limit}
    `;

    const result = await clickhouse.query({
      query: searchQuery
    });

    const resultData = await result.json();
    const rows = resultData && resultData.data ? resultData.data : resultData;
    return res.status(200).json({
      statusCode: 200,
      metrics: { searchResults: rows.map(item => item.value) },
      query
    });
  } catch (error) {
    console.error('Error searching filter values:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Get filter values by field
exports.getFilterValuesByField = async (req, res) => {
  try {
    const { field } = req.params;
    const { limit = 100, offset = 0, search = '' } = req.query;
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);

    if (!field) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Field parameter is required'
      });
    }

    let whereCondition = `WHERE ${field} IS NOT NULL AND ${field} != ''`;

    if (search) {
      const escapedSearch = search.replace(/'/g, "''"); // Escape single quotes
      whereCondition += ` AND ${field} ILIKE '%${escapedSearch}%'`;
    }

    const valuesQuery = `
      SELECT 
        ${field} as value,
        count(*) as count
      FROM ${DATABASE_NAME}.${tableName}
      ${whereCondition}
      GROUP BY ${field}
      ORDER BY count DESC, ${field}
      LIMIT ${limit} OFFSET ${offset}
    `;

    const result = await clickhouse.query({
      query: valuesQuery
    });

    const resultData = await result.json();
    const rows = resultData && resultData.data ? resultData.data : resultData;
    return res.status(200).json({
      statusCode: 200,
      metrics: { 
        field,
        values: rows.map(item => ({
          value: item.value,
          count: parseInt(item.count)
        }))
      },
      query
    });
  } catch (error) {
    console.error('Error fetching filter values by field:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
}; 

// COMPREHENSIVE METRICS API - Combines all top metrics in a single endpoint
exports.getAllTopMetrics = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    console.log('Debug - Query:', query);
    console.log('Debug - Modified Query:', modifiedQuery);
    console.log('Debug - Where Clause:', whereClause);
    console.log('Debug - Table Name:', tableName);

    // Define all metrics to fetch
    const metricsConfig = [
      // Quantity-based metrics
      { groupBy: 'buyer', aggregate: 'quantity', key: 'topBuyersByQuantity' },
      { groupBy: 'year', aggregate: 'quantity', key: 'topYearsByQuantity' },
      { groupBy: 'H_S_Code', aggregate: 'quantity', key: 'topHSCodeByQuantity' },
      { groupBy: 'supplier', aggregate: 'quantity', key: 'topSuppliersByQuantity' },
      { groupBy: 'buyerCountry', aggregate: 'quantity', key: 'topCountryByQuantity' },
      { groupBy: 'portOfOrigin', aggregate: 'quantity', key: 'topIndianPortByQuantity' },
      
      // Value-based metrics
      { groupBy: 'buyer', aggregate: 'totalValueInvoice', key: 'topBuyersByValue' },
      { groupBy: 'year', aggregate: 'totalValueInvoice', key: 'topYearsByValue' },
      { groupBy: 'H_S_Code', aggregate: 'totalValueInvoice', key: 'topHSCodeByValue' },
      { groupBy: 'supplier', aggregate: 'totalValueInvoice', key: 'topSuppliersByValue' },
      { groupBy: 'buyerCountry', aggregate: 'totalValueInvoice', key: 'topCountryByValue' },
      { groupBy: 'portOfOrigin', aggregate: 'totalValueInvoice', key: 'topIndianPortByValue' }
    ];

    // Fetch all metrics concurrently
    const metricsPromises = metricsConfig.map(async (config) => {
      try {
        const data = await getClickHouseGroupedData(tableName, whereClause, config.groupBy, config.aggregate);
        return { [config.key]: data };
      } catch (error) {
        console.error(`Error fetching ${config.key}:`, error.message);
        return { [config.key]: [] };
      }
    });

    // Wait for all metrics to complete
    const metricsResults = await Promise.all(metricsPromises);
    
    // Combine all results into a single object
    const allMetrics = metricsResults.reduce((acc, result) => {
      return { ...acc, ...result };
    }, {});

    return res.status(200).json({
      statusCode: 200,
      metrics: allMetrics,
      query,
      summary: {
        totalMetrics: metricsConfig.length,
        tableName,
        dateRange: {
          startDate: modifiedQuery.startDate,
          endDate: modifiedQuery.endDate
        },
        filters: {
          searchType: modifiedQuery.searchType,
          searchValue: modifiedQuery.searchValue,
          informationOf: modifiedQuery.informationOf,
          dataType: modifiedQuery.dataType
        }
      }
    });
  } catch (error) {
    console.error('Error fetching all top metrics:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error: error.message
    });
  }
}; 