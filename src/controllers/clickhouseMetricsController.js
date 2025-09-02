const { clickhouse } = require('../config/clickhouse');
const { queryModifier } = require('../utils/queryModifier');
const ExcelJS = require('exceljs');
const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';

// Field mappings for frontend vs database field names
const fieldMappings = {
  "Indian Port": "portOfOrigin",
  "H S Code": "H_S_Code",
  "Quantity Units": "quantityUnit",
  "Unit Price": "standardUnitRateUSD",
  "Currency": "currency",
  "Product Name": "productName",
  "Product Description": "productDescription",
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
  if (modifiedQuery.searchType && query.searchValue) {
    query.searchValue = query.searchValue.split(',');
    const searchValues = Array.isArray(query.searchValue) ? query.searchValue : [query.searchValue];
    const searchConditions = searchValues.map(value => {
      const escapedValue = value.replace(/'/g, "''"); // Escape single quotes
      return `${modifiedQuery.searchType} ILIKE '%${escapedValue}%'`;
    });
    whereConditions.push(`(${searchConditions.join(' OR ')})`);
  }

  // Additional filters
  if (query.filters && typeof query.filters === 'object') {
    for (let [field, values] of Object.entries(query.filters)) {
      console.log('field', field);
      console.log('values', values);
      values = values.split(',');
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


    const result = await clickhouse.query({
      query
    });

    const resultData = await result.json();
    
    
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
        sum(totalValueUSD) as totalValueUSD,
        countDistinct(buyer) as uniqueBuyers,
        countDistinct(supplier) as uniqueSuppliers
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

// Enhanced Get filter values with pagination and search
exports.getFilterValues = async (req, res) => {
  try {
    const query = req.query;
    // return res.status(200).json({
    //   statusCode: 200
    // });
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause } = buildClickHouseWhereClause(query, modifiedQuery);

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;
    const search = req.query.search || ''; // Search within filter values
    const filterField = req.query.field || null; // Get values for specific field only

    // If specific field is requested, get only that field
    if (filterField && fieldMappings[filterField]) {
      const dbColumnName = fieldMappings[filterField];
      
      // Build where condition for search
      let searchCondition = '';
      if (search) {
        const escapedSearch = search.replace(/'/g, "''"); // Escape single quotes
        searchCondition = `AND ${dbColumnName} ILIKE '%${escapedSearch}%'`;
      }

      // Get total count first
      const countQuery = `
        SELECT count(DISTINCT ${dbColumnName}) as totalCount
        FROM ${DATABASE_NAME}.${tableName}
        ${whereClause}
        AND ${dbColumnName} IS NOT NULL
        AND ${dbColumnName} != ''
        ${searchCondition}
      `;

      const countResult = await clickhouse.query({
        query: countQuery
      });

      const countData = await countResult.json();
      const totalCount = countData && countData.data ? countData.data[0].totalCount : 0;

      // Get paginated distinct values
      const distinctQuery = `
        SELECT DISTINCT ${dbColumnName} as value
        FROM ${DATABASE_NAME}.${tableName}
        ${whereClause}
        AND ${dbColumnName} IS NOT NULL
        AND ${dbColumnName} != ''
        ${searchCondition}
        ORDER BY ${dbColumnName}
        LIMIT ${limit} OFFSET ${offset}
      `;

      const distinctResult = await clickhouse.query({
        query: distinctQuery
      });

      const distinctData = await distinctResult.json();
      const rows = distinctData && distinctData.data ? distinctData.data : distinctData;
      const values = rows.map(item => item.value).filter(Boolean);

      const filters = {};
      filters[filterField] = values;

      return res.status(200).json({
        statusCode: 200,
        filters,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        },
        query,
        search: search || null,
        field: filterField
      });
    }

    // If no specific field requested, get all fields (with pagination for each)
    const filterPromises = Object.entries(fieldMappings).map(async ([displayName, dbColumnName]) => {
      // Build where condition for search (if provided)
      let searchCondition = '';
      if (search) {
        const escapedSearch = search.replace(/'/g, "''"); // Escape single quotes
        searchCondition = `AND ${dbColumnName} ILIKE '%${escapedSearch}%'`;
      }

      // Get total count for this field
      const countQuery = `
        SELECT count(DISTINCT ${dbColumnName}) as totalCount
        FROM ${DATABASE_NAME}.${tableName}
        ${whereClause}
        AND ${dbColumnName} IS NOT NULL
        AND ${dbColumnName} != ''
        ${searchCondition}
      `;

      const countResult = await clickhouse.query({
        query: countQuery
      });

      const countData = await countResult.json();
      const totalCount = countData && countData.data ? countData.data[0].totalCount : 0;

      // Get paginated distinct values for this field
      const distinctQuery = `
        SELECT DISTINCT ${dbColumnName} as value
        FROM ${DATABASE_NAME}.${tableName}
        ${whereClause}
        AND ${dbColumnName} IS NOT NULL
        AND ${dbColumnName} != ''
        ${searchCondition}
        ORDER BY ${dbColumnName}
        LIMIT ${limit} OFFSET ${offset}
      `;

      const distinctResult = await clickhouse.query({
        query: distinctQuery
      });

      const distinctData = await distinctResult.json();
      const rows = distinctData && distinctData.data ? distinctData.data : distinctData;
      const values = rows.map(item => item.value).filter(Boolean);

      return {
        displayName,
        values,
        totalCount,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        }
      };
    });

    const results = await Promise.all(filterPromises);
    
    // Structure the response
    const filterData = {};
    const paginationInfo = {};
    
    results.forEach(({ displayName, values, totalCount, pagination }) => {
      filterData[displayName] = values;
      paginationInfo[displayName] = pagination;
    });

    return res.status(200).json({
      statusCode: 200,
      filters: filterData,
      pagination: paginationInfo,
      query,
      search: search || null,
      requestParams: {
        page,
        limit,
        offset
      }
    });

  } catch (error) {
    console.error('Error fetching filter values:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// Enhanced Get filter metadata with field-specific counts
exports.getFilterMetadata = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause } = buildClickHouseWhereClause(query, modifiedQuery);

    // Get metadata for each field
    const metadataPromises = Object.entries(fieldMappings).map(async ([displayName, dbColumnName]) => {
      const countQuery = `
        SELECT count(DISTINCT ${dbColumnName}) as uniqueValueCount
        FROM ${DATABASE_NAME}.${tableName}
        ${whereClause}
        AND ${dbColumnName} IS NOT NULL
        AND ${dbColumnName} != ''
      `;

      const result = await clickhouse.query({
        query: countQuery
      });

      const resultData = await result.json();
      const count = resultData && resultData.data ? resultData.data[0].uniqueValueCount : 0;

      return {
        displayName,
        dbColumnName,
        uniqueValueCount: parseInt(count)
      };
    });

    const metadata = await Promise.all(metadataPromises);

    return res.status(200).json({
      statusCode: 200,
      metadata,
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

// Enhanced Search filter values across all fields
exports.searchFilterValues = async (req, res) => {
  try {
    const query = req.query;
    const searchTerm = req.query.search;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause } = buildClickHouseWhereClause(query, modifiedQuery);

    if (!searchTerm || searchTerm.length < 2) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Search term must be at least 2 characters long'
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const results = {};

    // Search across all fields
    const searchPromises = Object.entries(fieldMappings).map(async ([displayName, dbColumnName]) => {
      const escapedSearch = searchTerm.replace(/'/g, "''"); // Escape single quotes
      
      const searchQuery = `
        SELECT DISTINCT ${dbColumnName} as value
        FROM ${DATABASE_NAME}.${tableName}
        ${whereClause}
        AND ${dbColumnName} IS NOT NULL
        AND ${dbColumnName} != ''
        AND ${dbColumnName} ILIKE '%${escapedSearch}%'
        ORDER BY ${dbColumnName}
        LIMIT ${limit}
      `;

      const result = await clickhouse.query({
        query: searchQuery
      });

      const resultData = await result.json();
      const rows = resultData && resultData.data ? resultData.data : resultData;
      const values = rows.map(item => item.value).filter(Boolean);

      return {
        field: displayName,
        matches: values
      };
    });

    const searchResults = await Promise.all(searchPromises);
    
    // Filter out fields with no matches
    const filteredResults = searchResults.filter(result => result.matches.length > 0);

    return res.status(200).json({
      statusCode: 200,
      searchTerm,
      results: filteredResults,
      totalFieldsWithMatches: filteredResults.length,
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

// Enhanced Get filter values by field with pagination, search, and filtering
exports.getFilterValuesByField = async (req, res) => {
  try {
    const query = req.query;
    const fieldName = req.params.field;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause } = buildClickHouseWhereClause(query, modifiedQuery);

    // Validate field name
    if (!fieldMappings[fieldName]) {
      return res.status(400).json({
        statusCode: 400,
        message: `Invalid field name: ${fieldName}`,
        availableFields: Object.keys(fieldMappings)
      });
    }

    const dbColumnName = fieldMappings[fieldName];
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const sortOrder = req.query.sortOrder || 'ASC'; // ASC or DESC

    // Build where condition for search
    let searchCondition = '';
    if (search) {
      const escapedSearch = search.replace(/'/g, "''"); // Escape single quotes
      searchCondition = `AND ${dbColumnName} ILIKE '%${escapedSearch}%'`;
    }

    // Get total count
    const countQuery = `
      SELECT count(DISTINCT ${dbColumnName}) as totalCount
      FROM ${DATABASE_NAME}.${tableName}
      ${whereClause}
      AND ${dbColumnName} IS NOT NULL
      AND ${dbColumnName} != ''
      ${searchCondition}
    `;

    const countResult = await clickhouse.query({
      query: countQuery
    });

    const countData = await countResult.json();
    const totalCount = countData && countData.data ? countData.data[0].totalCount : 0;

    // Get paginated distinct values with usage count
    const distinctQuery = `
      SELECT 
        ${dbColumnName} as value,
        count(*) as usage_count
      FROM ${DATABASE_NAME}.${tableName}
      ${whereClause}
      AND ${dbColumnName} IS NOT NULL
      AND ${dbColumnName} != ''
      ${searchCondition}
      GROUP BY ${dbColumnName}
      ORDER BY ${dbColumnName} ${sortOrder}
      LIMIT ${limit} OFFSET ${offset}
    `;

    const distinctResult = await clickhouse.query({
      query: distinctQuery
    });

    const distinctData = await distinctResult.json();
    const rows = distinctData && distinctData.data ? distinctData.data : distinctData;
    const values = rows
      .map(item => ({
        value: item.value,
        count: parseInt(item.usage_count || 0)
      }))
      .filter(item => item.value);

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      statusCode: 200,
      field: fieldName,
      values,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      search: search || null,
      sortOrder,
      query
    });

  } catch (error) {
    console.error(`Error fetching filter values for field:`, error.message, error.stack);
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


// Helper function to execute ClickHouse queries
async function executeClickHouseQuery(query, params = null) {
  try {
    let result;
    
    if (params) {
      // Use parameterized query if params are provided
      result = await clickhouse.query({
        query,
        params
      });
    } else {
      // Use direct query without parameters
      result = await clickhouse.query({
        query
      });
    }
    
    const resultData = await result.json();
    
    // Handle different result structures
    if (resultData && resultData.data && Array.isArray(resultData.data)) {
      return resultData.data;
    } else if (Array.isArray(resultData)) {
      return resultData;
    } else {
      console.error('Unexpected result structure:', resultData);
      return [];
    }
  } catch (error) {
    console.error('Error executing ClickHouse query:', error);
    throw error;
  }
}

// Get data from ClickHouse with comprehensive query parameter support
exports.getDataFromClickHouse = async (req, res) => {
  try {
    const query = req.query;
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;
    const offset = (page - 1) * limit;

    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    console.log('Debug - Query:', query);
    console.log('Debug - Modified Query:', modifiedQuery);
    console.log('Debug - Where Clause:', whereClause);
    console.log('Debug - Table Name:', tableName);

    // Get total count
    const countQuery = `
      SELECT count(*) as totalCount
      FROM ${DATABASE_NAME}.${tableName}
      ${whereClause}
    `;

    const countResult = await clickhouse.query({
      query: countQuery
    });

    const countData = await countResult.json();
    const totalCount = countData && countData.data ? countData.data[0].totalCount : 0;

    // Get paginated data
    const dataQuery = `
      SELECT *
      FROM ${DATABASE_NAME}.${tableName}
      ${whereClause}
      ORDER BY shippingBillDate DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const dataResult = await clickhouse.query({
      query: dataQuery
    });

    const resultData = await dataResult.json();
    const data = resultData && resultData.data ? resultData.data : [];

    return res.status(200).json({
      statusCode: 200,
      page,
      limit,
      totalRecords: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      data,
      query: modifiedQuery,
      summary: {
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
    console.error('Error fetching data from ClickHouse:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Download data from ClickHouse as XLSX file
exports.downloadDataAsXLSX = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);
    
    // Support for custom columns selection
    const selectedColumns = query.columns ? query.columns.split(',') : null;

    console.log('Debug - Download Query:', query);
    console.log('Debug - Download Modified Query:', modifiedQuery);
    console.log('Debug - Download Where Clause:', whereClause);
    console.log('Debug - Download Table Name:', tableName);

    // First, get the total count to check if data exists
    const countQuery = `
      SELECT count(*) as totalCount
      FROM ${DATABASE_NAME}.${tableName}
      ${whereClause}
    `;

    const countResult = await clickhouse.query({
      query: countQuery
    });

    const countData = await countResult.json();
    const totalCount = countData && countData.data ? countData.data[0].totalCount : 0;

    if (totalCount === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: 'No data found for the specified criteria'
      });
    }

    // Check if the dataset is too large (limit to 100,000 records for performance)
    const maxRecords = 100000;
    if (totalCount > maxRecords) {
      return res.status(413).json({
        statusCode: 413,
        message: `Dataset too large. Found ${totalCount} records, maximum allowed is ${maxRecords}. Please apply more specific filters.`
      });
    }

    // Get all data (no pagination for download)
    const selectClause = selectedColumns ? selectedColumns.join(', ') : '*';
    const dataQuery = `
      SELECT ${selectClause}
      FROM ${DATABASE_NAME}.${tableName}
      ${whereClause}
      ORDER BY shippingBillDate DESC
    `;

    const dataResult = await clickhouse.query({
      query: dataQuery
    });

    const resultData = await dataResult.json();
    const data = resultData && resultData.data ? resultData.data : [];

    // Create Excel workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Pharmaceutical Data');

    // Define column headers with better formatting
    const columnMappings = {
      'shippingBillDate': 'Date of Shipment',
      'portOfOrigin': 'Indian Port',
      'portOfDeparture': 'Port of Departure',
      'H_S_Code': 'HS Code',
      'productDescription': 'Product Description',
      'productName': 'Product Name',
      'standardQuantity': 'Quantity',
      'quantityUnit': 'Quantity Units',
      'standardUnitRateUSD': 'Unit Price (USD)',
      'currency': 'Currency',
      'supplier': 'Indian Company',
      'buyer': 'Foreign Company',
      'buyerCountry': 'Foreign Country',
      'supplierCountry': 'Supplier Country',
      'CAS_Number': 'CAS Number',
      'totalValueInvoice': 'Total Value',
      'region': 'Region',
      'year': 'Year',
      'month': 'Month',
      'yearMonth': 'Year-Month'
    };

    // Get headers from the first data row and map them to readable names
    const headers = Object.keys(data[0]).map(key => {
      return columnMappings[key] || key.replace(/([A-Z])/g, ' $1')
                                      .replace(/^./, str => str.toUpperCase())
                                      .replace(/_/g, ' ')
                                      .trim();
    });

    // Add headers to worksheet
    worksheet.addRow(headers);

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    // Add data rows with proper formatting
    data.forEach((row, index) => {
      const rowData = headers.map(header => {
        const originalKey = Object.keys(data[0]).find(key => 
          columnMappings[key] === header || 
          key.replace(/([A-Z])/g, ' $1')
             .replace(/^./, str => str.toUpperCase())
             .replace(/_/g, ' ')
             .trim() === header
        );
        return row[originalKey] || '';
      });
      
      const dataRow = worksheet.addRow(rowData);
      
      // Alternate row colors for better readability
      if (index % 2 === 1) {
        dataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' }
        };
      }
    });

    // Auto-fit columns and set minimum width
    worksheet.columns.forEach(column => {
      const maxLength = Math.max(
        column.header.length,
        ...column.values.slice(1).map(value => String(value).length)
      );
      column.width = Math.min(Math.max(maxLength + 2, 10), 50); // Min 10, Max 50
    });

    // Add a summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['Export Summary']);
    summarySheet.addRow(['']);
    summarySheet.addRow(['Total Records', totalCount]);
    summarySheet.addRow(['Data Type', modifiedQuery.informationOf]);
    summarySheet.addRow(['Export Date', new Date().toLocaleString()]);
    summarySheet.addRow(['Date Range', `${modifiedQuery.startDate || 'N/A'} to ${modifiedQuery.endDate || 'N/A'}`]);
    summarySheet.addRow(['Search Type', modifiedQuery.searchType || 'N/A']);
    summarySheet.addRow(['Search Value', Array.isArray(modifiedQuery.searchValue) ? modifiedQuery.searchValue.join(', ') : modifiedQuery.searchValue || 'N/A']);

    // Style summary sheet
    const summaryHeader = summarySheet.getRow(1);
    summaryHeader.font = { bold: true, size: 14 };
    summaryHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };

    // Generate filename with timestamp and data type
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `pharmaceutical_data_${modifiedQuery.informationOf}_${timestamp}.xlsx`;

    // Set response headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Total-Records', totalCount);
    res.setHeader('X-Data-Type', modifiedQuery.informationOf);

    // Write the workbook to response
    await workbook.xlsx.write(res);

    console.log(`Excel file generated successfully: ${filename} with ${data.length} records`);

  } catch (error) {
    console.error('Error generating Excel file:', error.message, error.stack);
    
    // Check if response has already been sent
    if (!res.headersSent) {
      return res.status(500).json({
        statusCode: 500,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
};

exports.getClickHouseSuggestedData = async (req, res) => {
  try {
    const { searchType, suggestion, informationOf, limit = 20 } = req.query;

    // Validate required parameters
    if (!searchType || !suggestion || !informationOf) {
      return res.status(400).json({
        statusCode: 400,
        message: 'searchType, suggestion, and informationOf are required parameters',
      });
    }

    // Determine table name based on import/export type
    const tableName = getTableName(informationOf);
    
    // Map frontend field names to database column names if needed
    const dbSearchType = fieldMappings[searchType] || searchType;

    // Handle field names with spaces by quoting them
    const quotedSearchType = dbSearchType.includes(' ') ? `"${dbSearchType}"` : dbSearchType;

    // Build the suggestion query with direct string interpolation
    const escapedSuggestion = suggestion.replace(/'/g, "''"); // Escape single quotes
    const suggestionQuery = `
      SELECT DISTINCT ${quotedSearchType} as title
      FROM ${DATABASE_NAME}.${tableName}
      WHERE ${quotedSearchType} ILIKE '%${escapedSuggestion}%'
        AND ${quotedSearchType} IS NOT NULL
        AND ${quotedSearchType} != ''
      ORDER BY ${quotedSearchType}
      LIMIT ${Number(limit)}
    `;

    console.log('Debug - Suggestion Query:', suggestionQuery);

    // Execute query without parameters
    const data = await executeClickHouseQuery(suggestionQuery);

    // Format response to match the expected structure
    const suggestions = data.map(item => ({
      title: item.title
    }));

    res.status(200).json({
      statusCode: 200,
      data: suggestions,
      query: {
        searchType,
        suggestion,
        informationOf,
        limit
      }
    });

  } catch (error) {
    console.error('Error in getClickHouseSuggestedData:', error.message, error.stack);
    res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      data: [] // Return empty array on error
    });
  }
};

