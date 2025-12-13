const { clickhouse } = require('../config/clickhouse');
const { queryModifier } = require('../utils/queryModifier');
const ExcelJS = require('exceljs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);
const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';

// Field mappings for frontend vs database field names
// Different mappings for import vs export
const getFieldMappings = (informationOf) => {
  if (informationOf === 'import') {
    return {
      "Indian Port": "portOfDeparture",
      "H S Code": "H_S_Code",
      "Quantity": "standardQuantity",
      "Product Name": "productName",
      "Product Description": "productDescription",
      "Quantity Units": "standardQuantityUnit",
      "Unit Price": "standardUnitRateUSD",
      "Currency": "currency",
      "Indian Company": "buyer",
      "Foreign Company": "supplier",
      "Foreign Country": "supplierCountry",
      "CAS Number": "CAS_Number",
      "Date of Shipment": "shippingBillDate"
    };
  } else {
    // For export
    return {
      "Indian Port": "portOfOrigin",
      "H S Code": "H_S_Code",
      "Quantity": "standardQuantity",
      "Quantity Units": "standardQuantityUnit",
      "Unit Price": "standardUnitRateUSD",
      "Product Name": "productName",
      "Product Description": "productDescription",
      "Currency": "currency",
      "Indian Company": "supplier",
      "Foreign Company": "buyer",
      "Foreign Country": "buyerCountry",
      "CAS Number": "CAS_Number",
      "Date of Shipment": "shippingBillDate"
    };
  }
};

// Define which fields are numeric (Float64/Int64) to handle empty string conversion
const numericFields = {
  "standardUnitRateUSD": true,
  "quantity": true,
  "standardQuantity": true,
  "totalValueInvoice": true,
  "totalValueUSD": true
};

// Helper function to convert datetime string to date format
const convertToDateString = (dateString) => {
  if (!dateString || dateString.trim() === '' || dateString === 'null' || dateString === 'undefined') {
    return null;
  }
  
  // If it's already a date string (YYYY-MM-DD), return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  
  // If it's a datetime string, extract the date part
  if (dateString.includes(' ')) {
    const datePart = dateString.split(' ')[0];
    // Validate the extracted date part
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return datePart;
    }
  }
  
  // If it's a Date object or other format, try to convert
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.warn('Invalid date format:', dateString);
      return null;
    }
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.warn('Invalid date format:', dateString);
    return null;
  }
};

// Helper function to build safe field conditions for different field types
const buildFieldCondition = (dbColumnName, searchCondition = '') => {
  const isNumeric = numericFields[dbColumnName];
  
  // Check if this is a Date field
  const isDateField = dbColumnName === 'shippingBillDate';
  
  if (isNumeric) {
    // For numeric fields, use toString() to convert to string and handle NULL/empty values
    return `AND toString(${dbColumnName}) IS NOT NULL 
            AND toString(${dbColumnName}) != '' 
            AND toString(${dbColumnName}) != '0' 
            ${searchCondition}`;
  } else if (isDateField) {
    // For Date fields, only check for NULL and invalid dates - no string operations
    return `AND ${dbColumnName} IS NOT NULL 
            AND ${dbColumnName} != '1970-01-01' 
            ${searchCondition}`;
  } else {
    // For string fields, use the original logic
    return `AND ${dbColumnName} IS NOT NULL 
            AND ${dbColumnName} != '' 
            ${searchCondition}`;
  }
};

// Build ClickHouse WHERE clause from query parameters
const buildClickHouseWhereClause = (query, modifiedQuery) => {
  let whereConditions = [];

  console.log('buildClickHouseWhereClause - query:', query);
  console.log('buildClickHouseWhereClause - modifiedQuery:', modifiedQuery);

  // Date range filter - prioritize modifiedQuery dates (from queryModifier)
  // Both import and export now use the same date field
  const dateField = 'shippingBillDate';
  
  if (modifiedQuery.startDate && modifiedQuery.endDate) {
    console.log('Using modifiedQuery dates:', modifiedQuery.startDate, modifiedQuery.endDate);
    // Convert datetime strings to date format for ClickHouse
    const startDate = convertToDateString(modifiedQuery.startDate);
    const endDate = convertToDateString(modifiedQuery.endDate);
    if (startDate && endDate) {
      // Use toDate() function to ensure proper date type casting in ClickHouse
      whereConditions.push(`toDate(${dateField}) BETWEEN toDate('${startDate}') AND toDate('${endDate}')`);
      // Also filter out null dates and invalid dates - use proper date type filtering
      whereConditions.push(`${dateField} IS NOT NULL AND ${dateField} != '1970-01-01'`);
    }
  } else if (query.startDate && query.endDate) {
    console.log('Using direct query dates:', query.startDate, query.endDate);
    // Handle direct startDate/endDate parameters
    const startDate = convertToDateString(query.startDate);
    const endDate = convertToDateString(query.endDate);
    if (startDate && endDate) {
      // Use toDate() function to ensure proper date type casting in ClickHouse
      whereConditions.push(`toDate(${dateField}) BETWEEN toDate('${startDate}') AND toDate('${endDate}')`);
      // Also filter out null dates and invalid dates - use proper date type filtering
      whereConditions.push(`${dateField} IS NOT NULL AND ${dateField} != '1970-01-01'`);
    }
  } else {
    console.log('No date parameters found, skipping date filter');
    // Still filter out empty/null dates even when no date range is specified - more comprehensive filtering
    whereConditions.push(`${dateField} IS NOT NULL AND ${dateField} != '' AND ${dateField} != '1970-01-01' AND length(${dateField}) > 0 AND ${dateField} != 'null' AND ${dateField} != 'undefined'`);
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

  // Chapter filter - accepts multiple comma-separated values
  if (query.chapter) {
    const chapters = query.chapter.split(',').map(ch => ch.trim());
    if (chapters.length > 0) {
      const escapedChapters = chapters.map(chapter => {
        const escapedValue = chapter.replace(/'/g, "''"); // Escape single quotes
        return `'${escapedValue}'`;
      });
      whereConditions.push(`chapter IN (${escapedChapters.join(', ')})`);
    }
  }

  // Additional filters
  if (query.filters && typeof query.filters === 'object') {
    const filterFieldMappings = getFieldMappings(query.informationOf);
    for (let [field, values] of Object.entries(query.filters)) {
      console.log('field', field);
      console.log('values', values);
      
      const dbColumnName = filterFieldMappings[field] || field;
      
      // Handle range filters for quantity, quantityUnit and standardUnitRateUSD
      // Expected format: { "Quantity": { min: 10, max: 100 } } or { "Quantity Units": { min: 10, max: 100 } } or { "Unit Price": { min: 5.5, max: 25.0 } }
      if ((field === 'Quantity' || field === 'Quantity Units' || field === 'Unit Price') && 
          typeof values === 'object' && values.min !== undefined && values.max !== undefined) {
        
        console.log('Processing range filter for:', field, 'min:', values.min, 'max:', values.max);
        
        // Validate and convert min/max values to numbers
        const minValue = parseFloat(values.min);
        const maxValue = parseFloat(values.max);
        
        if (!isNaN(minValue) && !isNaN(maxValue)) {
          // Ensure min is not greater than max
          if (minValue <= maxValue) {
            whereConditions.push(`${dbColumnName} >= ${minValue} AND ${dbColumnName} <= ${maxValue}`);
          } else {
            console.warn(`Invalid range: min (${minValue}) is greater than max (${maxValue}) for field ${field}`);
          }
        } else {
          console.warn(`Invalid numeric values for range filter on field ${field}: min=${values.min}, max=${values.max}`);
        }
      } else {
        // Handle regular comma-separated values (existing logic)
        values = values.split(',');
        if (Array.isArray(values) && values.length > 0) {
          const escapedValues = values.map(value => {
            const escapedValue = value.replace(/'/g, "''"); // Escape single quotes
            return `'${escapedValue}'`;
          });
          whereConditions.push(`${dbColumnName} IN (${escapedValues.join(', ')})`);
        }
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
const getClickHouseGroupedData = async (tableName, whereClause, groupByField, aggregateField, limit = 6, sortByYear = false) => {
  try {
    // Determine sort order based on whether we're sorting by year
    const sortOrder = sortByYear && groupByField === 'year' ? `${groupByField} ASC` : 'total DESC';
    
    let query;
    if (groupByField === 'year') {
      query = `
        SELECT 
          ${groupByField},
          sum(${aggregateField}) as total,
          count(*) as count
        FROM ${DATABASE_NAME}.${tableName}
        ${whereClause}
        GROUP BY ${groupByField}
        ORDER BY ${groupByField} ASC
        LIMIT ${limit}
      `;
    } else {
      query = `
        SELECT 
          ${groupByField},
          sum(${aggregateField}) as total,
          count(*) as count
        FROM ${DATABASE_NAME}.${tableName}
        ${whereClause}
        GROUP BY ${groupByField}
        ORDER BY ${sortOrder}
        LIMIT ${limit}
      `;
    }

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
        sum(standardQuantity) as totalQuantity,
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

// Enhanced Get filter values with search
exports.getFilterValues = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause } = buildClickHouseWhereClause(query, modifiedQuery);

    const search = req.query.search || ''; // Search within filter values
    const filterField = req.query.field || null; // Get values for specific field only

    // If specific field is requested, get only that field
    const specificFieldMappings = getFieldMappings(query.informationOf);
    
    // Exclude "Product Name" and "Product Description" from filter values API response
    if (filterField && (filterField === "Product Name" || filterField === "Product Description")) {
      return res.status(400).json({
        statusCode: 400,
        message: `Field "${filterField}" is not available in filter values`,
        query
      });
    }
    
    if (filterField && specificFieldMappings[filterField]) {
      const dbColumnName = specificFieldMappings[filterField];
      
      // Check if this is a range field (standardQuantity or standardUnitRateUSD)
      const isRangeField = dbColumnName === 'standardQuantity' || dbColumnName === 'standardUnitRateUSD';
      
      if (isRangeField) {
        // For range fields, return min and max values
        const fieldCondition = buildFieldCondition(dbColumnName, '');
        const rangeQuery = `
          SELECT 
            MIN(${dbColumnName}) as min,
            MAX(${dbColumnName}) as max
          FROM ${DATABASE_NAME}.${tableName}
          ${whereClause}
          ${fieldCondition}
        `;

        const rangeResult = await clickhouse.query({
          query: rangeQuery
        });

        const rangeData = await rangeResult.json();
        const rangeValues = rangeData && rangeData.data ? rangeData.data[0] : { min: 0, max:1000000 };

        const filters = {};
        filters[filterField] = {
          min: parseFloat(rangeValues.min) || 0,
          max: parseFloat(rangeValues.max) || 1000000
        };

        return res.status(200).json({
          statusCode: 200,
          filters,
          query,
          field: filterField,
          type: 'range'
        });
      } else {
        // For regular fields, return distinct values
        // Build where condition for search
        let searchCondition = '';
        if (search) {
          const escapedSearch = search.replace(/'/g, "''"); // Escape single quotes
          const isNumeric = numericFields[dbColumnName];
          if (isNumeric) {
            searchCondition = `AND toString(${dbColumnName}) ILIKE '%${escapedSearch}%'`;
          } else {
            searchCondition = `AND ${dbColumnName} ILIKE '%${escapedSearch}%'`;
          }
        }

        // Get total count
        const fieldCondition = buildFieldCondition(dbColumnName, searchCondition);
        const countQuery = `
          SELECT count(DISTINCT ${dbColumnName}) as totalCount
          FROM ${DATABASE_NAME}.${tableName}
          ${whereClause}
          ${fieldCondition}
        `;

        const countResult = await clickhouse.query({
          query: countQuery
        });

        const countData = await countResult.json();
        const totalCount = countData && countData.data ? countData.data[0].totalCount : 0;

        // Get all distinct values with counts
        const distinctQuery = `
          SELECT ${dbColumnName} as value, COUNT(*) as count
          FROM ${DATABASE_NAME}.${tableName}
          ${whereClause}
          ${fieldCondition}
          GROUP BY ${dbColumnName}
          ORDER BY ${dbColumnName}
        `;

        const distinctResult = await clickhouse.query({
          query: distinctQuery
        });

        const distinctData = await distinctResult.json();
        const rows = distinctData && distinctData.data ? distinctData.data : distinctData;
        const values = rows.map(item => ({ value: item.value, count: item.count })).filter(item => item.value);

        const filters = {};
        filters[filterField] = values;

        return res.status(200).json({
          statusCode: 200,
          filters,
          totalCount,
          query,
          search: search || null,
          field: filterField,
          type: 'list'
        });
      }
    }

    // If no specific field requested, get all fields
    const allFieldMappings = getFieldMappings(query.informationOf);
    // Exclude "Product Name" and "Product Description" from filter values API response
    const filteredFieldMappings = Object.entries(allFieldMappings).filter(([displayName]) => 
      displayName !== "Product Name" && displayName !== "Product Description"
    );
    const filterPromises = filteredFieldMappings.map(async ([displayName, dbColumnName]) => {
      // Check if this is a range field (standardQuantity or standardUnitRateUSD)
      const isRangeField = dbColumnName === 'standardQuantity' || dbColumnName === 'standardUnitRateUSD';
      
      if (isRangeField) {
        // For range fields, return min and max values
        const fieldCondition = buildFieldCondition(dbColumnName, '');
        const rangeQuery = `
          SELECT 
            MIN(${dbColumnName}) as min,
            MAX(${dbColumnName}) as max
          FROM ${DATABASE_NAME}.${tableName}
          ${whereClause}
          ${fieldCondition}
        `;

        const rangeResult = await clickhouse.query({
          query: rangeQuery
        });

        const rangeData = await rangeResult.json();
        const rangeValues = rangeData && rangeData.data ? rangeData.data[0] : { min: 0, max: 0 };

        return {
          displayName,
          values: {
            min: parseFloat(rangeValues.min) || 0,
            max: parseFloat(rangeValues.max) || 0
          },
          type: 'range'
        };
      } else {
        // For regular fields, return distinct values
        // Build where condition for search (if provided)
        let searchCondition = '';
        if (search) {
          const escapedSearch = search.replace(/'/g, "''"); // Escape single quotes
          const isNumeric = numericFields[dbColumnName];
          if (isNumeric) {
            searchCondition = `AND toString(${dbColumnName}) ILIKE '%${escapedSearch}%'`;
          } else {
            searchCondition = `AND ${dbColumnName} ILIKE '%${escapedSearch}%'`;
          }
        }

        // Get total count for this field
        const fieldCondition = buildFieldCondition(dbColumnName, searchCondition);
        const countQuery = `
          SELECT count(DISTINCT ${dbColumnName}) as totalCount
          FROM ${DATABASE_NAME}.${tableName}
          ${whereClause}
          ${fieldCondition}
        `;

        const countResult = await clickhouse.query({
          query: countQuery
        });

        const countData = await countResult.json();
        const totalCount = countData && countData.data ? countData.data[0].totalCount : 0;

        // Get all distinct values for this field with counts
        const distinctQuery = `
          SELECT ${dbColumnName} as value, COUNT(*) as count
          FROM ${DATABASE_NAME}.${tableName}
          ${whereClause}
          ${fieldCondition}
          GROUP BY ${dbColumnName}
          ORDER BY ${dbColumnName}
        `;

        const distinctResult = await clickhouse.query({
          query: distinctQuery
        });

        const distinctData = await distinctResult.json();
        const rows = distinctData && distinctData.data ? distinctData.data : distinctData;
        const values = rows.map(item => ({ value: item.value, count: item.count })).filter(item => item.value);

        return {
          displayName,
          values,
          totalCount,
          type: 'list'
        };
      }
    });

    const results = await Promise.all(filterPromises);
    
    // Structure the response
    const filterData = {};
    const countInfo = {};
    const typeInfo = {};
    
    results.forEach(({ displayName, values, totalCount, type }) => {
      filterData[displayName] = values;
      if (type === 'list') {
        countInfo[displayName] = totalCount;
      }
      typeInfo[displayName] = type;
    });

    return res.status(200).json({
      statusCode: 200,
      filters: filterData,
      counts: countInfo,
      types: typeInfo,
      query,
      search: search || null
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
    const metadataFieldMappings = getFieldMappings(modifiedQuery.informationOf);
    const metadataPromises = Object.entries(metadataFieldMappings).map(async ([displayName, dbColumnName]) => {
      const fieldCondition = buildFieldCondition(dbColumnName);
      const countQuery = `
        SELECT count(DISTINCT ${dbColumnName}) as uniqueValueCount
        FROM ${DATABASE_NAME}.${tableName}
        ${whereClause}
        ${fieldCondition}
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
    const searchFieldMappings = getFieldMappings(query.informationOf);
    const searchPromises = Object.entries(searchFieldMappings).map(async ([displayName, dbColumnName]) => {
      const escapedSearch = searchTerm.replace(/'/g, "''"); // Escape single quotes
      const isNumeric = numericFields[dbColumnName];
      const searchCondition = isNumeric 
        ? `AND toString(${dbColumnName}) ILIKE '%${escapedSearch}%'`
        : `AND ${dbColumnName} ILIKE '%${escapedSearch}%'`;
      
      const fieldCondition = buildFieldCondition(dbColumnName, searchCondition);
      const searchQuery = `
        SELECT DISTINCT ${dbColumnName} as value
        FROM ${DATABASE_NAME}.${tableName}
        ${whereClause}
        ${fieldCondition}
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
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause } = buildClickHouseWhereClause(query, modifiedQuery);

    // Validate field name
    const validationFieldMappings = getFieldMappings(query.informationOf);
    if (!validationFieldMappings[fieldName]) {
      return res.status(400).json({
        statusCode: 400,
        message: `Invalid field name: ${fieldName}`,
        availableFields: Object.keys(validationFieldMappings)
      });
    }

    const dbColumnName = validationFieldMappings[fieldName];
    const search = req.query.search || '';
    const sortOrder = req.query.sortOrder || 'ASC'; // ASC or DESC

    // Build where condition for search
    let searchCondition = '';
    if (search) {
      const escapedSearch = search.replace(/'/g, "''"); // Escape single quotes
      const isNumeric = numericFields[dbColumnName];
      if (isNumeric) {
        searchCondition = `AND toString(${dbColumnName}) ILIKE '%${escapedSearch}%'`;
      } else {
        searchCondition = `AND ${dbColumnName} ILIKE '%${escapedSearch}%'`;
      }
    }

    // Get total count
    const fieldCondition = buildFieldCondition(dbColumnName, searchCondition);
    const countQuery = `
      SELECT count(DISTINCT ${dbColumnName}) as totalCount
      FROM ${DATABASE_NAME}.${tableName}
      ${whereClause}
      ${fieldCondition}
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
      ${fieldCondition}
      GROUP BY ${dbColumnName}
      ORDER BY ${dbColumnName} ${sortOrder}
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

    return res.status(200).json({
      statusCode: 200,
      field: fieldName,
      values,
      totalCount,
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

    // Define all metrics to fetch - both import and export now use buyerCountry
    const countryField = 'buyerCountry';
    const metricsConfig = [
      // Quantity-based metrics
      { groupBy: 'buyer', aggregate: 'quantity', key: 'topBuyersByQuantity' },
      { groupBy: 'year', aggregate: 'quantity', key: 'topYearsByQuantity' },
      { groupBy: 'H_S_Code', aggregate: 'quantity', key: 'topHSCodeByQuantity' },
      { groupBy: 'supplier', aggregate: 'quantity', key: 'topSuppliersByQuantity' },
      { groupBy: countryField, aggregate: 'quantity', key: 'topCountryByQuantity' },
      { groupBy: 'portOfOrigin', aggregate: 'quantity', key: 'topIndianPortByQuantity' },
      
      // Value-based metrics
      { groupBy: 'buyer', aggregate: 'totalValueInvoice', key: 'topBuyersByValue' },
      { groupBy: 'year', aggregate: 'totalValueInvoice', key: 'topYearsByValue' },
      { groupBy: 'H_S_Code', aggregate: 'totalValueInvoice', key: 'topHSCodeByValue' },
      { groupBy: 'supplier', aggregate: 'totalValueInvoice', key: 'topSuppliersByValue' },
      { groupBy: countryField, aggregate: 'totalValueInvoice', key: 'topCountryByValue' },
      { groupBy: 'portOfOrigin', aggregate: 'totalValueInvoice', key: 'topIndianPortByValue' }
    ];

    // Fetch all metrics concurrently
    const metricsPromises = metricsConfig.map(async (config) => {
      try {
        // For year-based metrics, we want ascending order instead of descending by total
        const isYearMetric = config.groupBy === 'year';
        const data = await getClickHouseGroupedData(tableName, whereClause, config.groupBy, config.aggregate, 6, isYearMetric);
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

// Get distinct chapters present in the ClickHouse tables (import/export)
exports.getChapters = async (req, res) => {
  try {
    const query = req.query || {};
    const info = query.informationOf; // 'import' | 'export' | undefined -> both
    const search = (query.search || '').toString().trim();
    const startDate = query.startDate || null;
    const endDate = query.endDate || null;

    const tables = [];
    if (info === 'import') tables.push('import_data');
    else if (info === 'export') tables.push('export_data');
    else tables.push('export_data', 'import_data');

    const queries = tables.map(tableName => {
      let where = `WHERE chapter IS NOT NULL AND chapter != ''`;
      if (search) {
        const esc = search.replace(/'/g, "''");
        where += ` AND chapter ILIKE '%${esc}%'`;
      }
      if (startDate) {
        where += ` AND shippingBillDate >= '${startDate}'`;
      }
      if (endDate) {
        where += ` AND shippingBillDate <= '${endDate}'`;
      }
      return `SELECT chapter, count() as cnt FROM ${DATABASE_NAME}.${tableName} ${where} GROUP BY chapter`;
    });

    const results = await Promise.all(queries.map(q => clickhouse.query({ query: q })));
    const dataSets = await Promise.all(results.map(r => r.json()));

    let chapters = [];
    for (const ds of dataSets) {
      const rows = ds && ds.data ? ds.data : (Array.isArray(ds) ? ds : []);
      for (const row of rows) {
        if (row && row.chapter) chapters.push(row.chapter.toString());
      }
    }

    // Unique & sorted
    const uniqueChapters = Array.from(new Set(chapters)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return res.status(200).json({
      statusCode: 200,
      chapters: uniqueChapters,
      count: uniqueChapters.length,
      informationOf: info || 'both',
      search: search || null,
      startDate: startDate || null,
      endDate: endDate || null
    });
  } catch (error) {
    console.error('Error fetching chapters:', error && error.message ? error.message : error);
    return res.status(500).json({ statusCode: 500, message: 'Internal server error' });
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

    // Get paginated data - both import and export now use shippingBillDate
    const orderByField = 'shippingBillDate';
    const dataQuery = `
      SELECT *
      FROM ${DATABASE_NAME}.${tableName}
      ${whereClause}
      ORDER BY toDate(${orderByField}) DESC
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
// exports.downloadDataAsCSV = async (req, res) => {
//   try {
//     const query = req.query;
//     const modifiedQuery = queryModifier(query);
//     const tableName = getTableName(modifiedQuery.informationOf);
//     const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

//     // Support for custom columns selection
//     const selectedColumns = query.columns ? query.columns.split(',') : null;

//     console.log('Debug - Download Query:', query);
//     console.log('Debug - Download Modified Query:', modifiedQuery);
//     console.log('Debug - Download Where Clause:', whereClause);
//     console.log('Debug - Download Table Name:', tableName);

//     // First, get the total count to check if data exists
//     const countQuery = `
//       SELECT count(*) as totalCount
//       FROM ${DATABASE_NAME}.${tableName}
//       ${whereClause}
//     `;

//     const countResult = await clickhouse.query({
//       query: countQuery
//     });

//     const countData = await countResult.json();
//     const totalCount = countData && countData.data ? countData.data[0].totalCount : 0;

//     if (totalCount === 0) {
//       return res.status(404).json({
//         statusCode: 404,
//         message: 'No data found for the specified criteria'
//       });
//     }

//     // Check if the dataset is too large (limit to 1,000,000 records for streaming)
//     const maxRecords = 100000;
//     if (totalCount > maxRecords) {
//       return res.status(413).json({
//         statusCode: 413,
//         message: `Dataset too large. Found ${totalCount} records, maximum allowed is ${maxRecords}. Please apply more specific filters.`
//       });
//     }

//     // Get all data (no pagination for download)
//     const selectClause = selectedColumns ? selectedColumns.join(', ') : '*';
//     const dataQuery = `
//       SELECT ${selectClause}
//       FROM ${DATABASE_NAME}.${tableName}
//       ${whereClause}
//       ORDER BY shippingBillDate DESC
//     `;

//     // Set response headers for file download
//     res.setHeader('Content-Type', 'text/csv');
//     res.setHeader('Content-Disposition', `attachment; filename="pharmaceutical_data.csv"`);
//     res.setHeader('Cache-Control', 'no-cache');
//     res.setHeader('X-Total-Records', totalCount);
//     res.setHeader('X-Data-Type', `pharmaceutical_data.csv`);

//     // Define column headers with better formatting
//     const columnMappings = {
//       'billOfEntryDate': 'Date of Entry',
//       'portOfOrigin': 'Indian Port',
//       'portOfDeparture': 'Port of Departure',
//       'H_S_Code': 'HS Code',
//       'productDescription': 'Product Description',
//       'productName': 'Product Name',
//       'standardQuantity': 'Quantity',
//       'quantityUnit': 'Quantity Units',
//       'standardUnitRateUSD': 'Unit Price (USD)',
//       'currency': 'Currency',
//       'supplier': 'Indian Company',
//       'buyer': 'Foreign Company',
//       'buyerCountry': 'Foreign Country',
//       'supplierCountry': 'Supplier Country',
//       'CAS_Number': 'CAS Number',
//       'totalValueInvoice': 'Total Value',
//       'region': 'Region',
//       'year': 'Year',
//       'month': 'Month',
//       'yearMonth': 'Year-Month'
//     };

//     // Helper function to escape CSV values
//     const escapeCSV = (value) => {
//       if (value === null || value === undefined) return '';
//       const str = String(value);
//       // If the value contains comma, newline, or double quote, wrap in quotes and escape quotes
//       if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
//         return `"${str.replace(/"/g, '""')}"`;
//       }
//       return str;
//     };

//     // Helper function to get readable header name
//     const getReadableHeader = (key) => {
//       return columnMappings[key] || key.replace(/([A-Z])/g, ' $1')
//         .replace(/^./, str => str.toUpperCase())
//         .replace(/_/g, ' ')
//         .trim();
//     }

//     let headersWritten = false;
//     let headers = [];
//     let recordCount = 0;

//     // Use streaming query from ClickHouse
//     const resultSet = await clickhouse.query({
//       query: dataQuery,
//       format: 'JSONEachRow'
//     });

//     // Get the stream from the result set
//     const stream = resultSet.stream();

//     // Handle the streaming response
//     stream.on('data', (chunk) => {
//       try {
//         // Parse the chunk (each line is a JSON object)
//         const lines = chunk.toString().split('\n').filter(line => line.trim());
        
//         for (const line of lines) {
//           try {
//             const row = JSON.parse(line);
            
//             // Write headers on first row
//             if (!headersWritten) {
//               headers = Object.keys(row).map(key => getReadableHeader(key));
//               const headerRow = headers.map(escapeCSV).join(',') + '\n';
//               res.write(headerRow);
//               headersWritten = true;
//             }

//             // Write data row
//             const rowData = headers.map(header => {
//               const originalKey = Object.keys(row).find(key => getReadableHeader(key) === header);
//               return escapeCSV(row[originalKey] || '');
//             });
            
//             const csvRow = rowData.join(',') + '\n';
//             res.write(csvRow);
//             recordCount++;

//           } catch (parseError) {
//             console.warn('Error parsing JSON line:', parseError.message, 'Line:', line);
//           }
//         }
//       } catch (chunkError) {
//         console.warn('Error processing chunk:', chunkError.message);
//       }
//     });

//     stream.on('end', () => {
//       console.log(`CSV streaming completed: pharmaceutical_data.csv with ${recordCount} records`);
//       res.end();
//     });

//     stream.on('error', (error) => {
//       console.error('Stream error:', error.message, error.stack);
//       if (!res.headersSent) {
//         res.status(500).json({
//           statusCode: 500,
//           message: 'Error streaming data',
//           error: error.message
//         });
//       } else {
//         res.end();
//       }
//     });

//     // Handle client disconnect
//     req.on('close', () => {
//       console.log('Client disconnected during CSV download');
//       stream.destroy();
//     });

//   } catch (error) {
//     console.error('Error generating CSV file:', error.message, error.stack);

//     // Check if response has already been sent
//     if (!res.headersSent) {
//       return res.status(500).json({
//         statusCode: 500,
//         message: 'Internal server error',
//         error: error.message
//       });
//     }
//   }
// };


exports.downloadDataAsCSV = async (req, res) => {
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

    // Check if the dataset is too large (limit to 100,000 records)
    const maxRecords = 100000;
    if (totalCount > maxRecords) {
      return res.status(413).json({
        statusCode: 413,
        message: `Dataset too large. Found ${totalCount} records, maximum allowed is ${maxRecords}. Please apply more specific filters.`
      });
    }

    // Get all data (no pagination for download) - both import and export now use same fields
    const dateField = 'shippingBillDate';
    const countryField = 'buyerCountry';
    const selectClause = selectedColumns ? selectedColumns.join(', ') : `${dateField}, portOfOrigin, portOfDeparture, H_S_Code, productDescription, productName, standardQuantity, quantityUnit, standardUnitRateUSD, currency, supplier, buyer, ${countryField}, supplierCountry, CAS_Number, totalValueInvoice, region, year`;
    const dataQuery = `
      SELECT ${selectClause}
      FROM ${DATABASE_NAME}.${tableName}
      ${whereClause}
      ORDER BY toDate(${dateField}) DESC
    `;

    // Execute query and get all results
    const result = await clickhouse.query({
      query: dataQuery,
      format: 'JSON'
    });

    const data = await result.json();
    const rows = data.data || [];

    if (rows.length === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: 'No data found for the specified criteria'
      });
    }

    // Define column headers with better formatting
    const columnMappings = {
      'billOfEntryDate': 'Date of Entry',
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

    // Helper function to escape CSV values
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // If the value contains comma, newline, or double quote, wrap in quotes and escape quotes
      if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Helper function to get readable header name
    const getReadableHeader = (key) => {
      return columnMappings[key] || key.replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .replace(/_/g, ' ')
        .trim();
    };

    // Get headers from first row
    const headers = Object.keys(rows[0]).map(key => getReadableHeader(key));
    
    // Create CSV content
    let csvContent = '';
    
    // Add headers
    csvContent += headers.map(escapeCSV).join(',') + '\n';
    
    // Add data rows
    for (const row of rows) {
      const rowData = headers.map(header => {
        const originalKey = Object.keys(row).find(key => getReadableHeader(key) === header);
        return escapeCSV(row[originalKey] || '');
      });
      csvContent += rowData.join(',') + '\n';
    }

    // Set response headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="pharmaceutical_data.csv"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Total-Records', totalCount);
    res.setHeader('X-Data-Type', 'pharmaceutical_data.csv');

    // Send the complete CSV content
    res.send(csvContent);

    console.log(`CSV download completed: pharmaceutical_data.csv with ${rows.length} records`);

  } catch (error) {
    console.error('Error generating CSV file:', error.message, error.stack);
    
    if (!res.headersSent) {
      return res.status(500).json({
        statusCode: 500,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
};

// Alternative streaming CSV download using Node.js Transform streams (more efficient for very large datasets)
exports.downloadDataAsCSVStream = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    // Support for custom columns selection
    const selectedColumns = query.columns ? query.columns.split(',') : null;

    console.log('Debug - Stream Download Query:', query);
    console.log('Debug - Stream Download Modified Query:', modifiedQuery);
    console.log('Debug - Stream Download Where Clause:', whereClause);
    console.log('Debug - Stream Download Table Name:', tableName);

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

    // Generate filename with timestamp and data type
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `pharmaceutical_data_${modifiedQuery.informationOf}_${timestamp}.csv`;

    // Set response headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Total-Records', totalCount);
    res.setHeader('X-Data-Type', modifiedQuery.informationOf);

    // Define column headers with better formatting
    const columnMappings = {
      'billOfEntryDate': 'Date of Entry',
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

    // Helper function to escape CSV values
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // If the value contains comma, newline, or double quote, wrap in quotes and escape quotes
      if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Helper function to get readable header name
    const getReadableHeader = (key) => {
      return columnMappings[key] || key.replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .replace(/_/g, ' ')
        .trim();
    };

    // Get all data using streaming with CSV format directly from ClickHouse - both use shippingBillDate
    const orderByField = 'shippingBillDate';
    const selectClause = selectedColumns ? selectedColumns.join(', ') : '*';
    const dataQuery = `
      SELECT ${selectClause}
      FROM ${DATABASE_NAME}.${tableName}
      ${whereClause}
      ORDER BY toDate(${orderByField}) DESC
    `;

    let headersWritten = false;
    let headers = [];
    let recordCount = 0;

    // Use streaming query with CSV format from ClickHouse
    const resultSet = await clickhouse.query({
      query: dataQuery,
      format: 'JSONEachRow'
    });
    // Get the stream from the result set
    const stream = resultSet.stream();
         
    for await (const rows of resultSet.stream()) {
      rows.forEach(row => {
        console.log(row.json())
      })
    }
    return;
    // Handle the streaming response
    stream.on('data', (chunk) => {
      try {
        const chunkStr = chunk.toString();
        
        // If headers haven't been written yet, we need to add our custom headers
        if (!headersWritten) {
          // Get column names from the first row of data
          const firstLine = chunkStr.split('\n')[0];
          if (firstLine) {
            console.log('Debug - First Line:', firstLine);
            const columnNames = firstLine.split(',');
            headers = columnNames.map(name => getReadableHeader(name.trim().replace(/"/g, '')));
            const headerRow = headers.map(escapeCSV).join(',') + '\n';
            console.log('Debug - Header Row:', headerRow);
            res.write(headerRow);
            headersWritten = true;
            
            // Write the rest of the chunk (skip the first line which was the original header)
            const remainingLines = chunkStr.split('\n').slice(1);
            if (remainingLines.length > 0) {
              // console.log('Debug - Remaining Lines:', remainingLines);
              res.write(remainingLines.join('\n') + '\n');
              recordCount += remainingLines.filter(line => line.trim()).length;
            }
          }
        } else {
          // Just write the chunk as is
          res.write(chunkStr);
          recordCount += chunkStr.split('\n').filter(line => line.trim()).length;
        }
      } catch (chunkError) {
        console.warn('Error processing chunk:', chunkError.message);
      }
    });

    stream.on('end', () => {
      console.log(`CSV streaming completed: pharmaceutical_data.csv with ${recordCount} records`);
      res.end();
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error.message, error.stack);
      if (!res.headersSent) {
        res.status(500).json({
          statusCode: 500,
          message: 'Error streaming data',
          error: error.message
        });
      } else {
        res.end();
      }
    });

    // Handle client disconnect
    req.on('close', () => {
      console.log('Client disconnected during CSV download');
      stream.destroy();
    });

  } catch (error) {
    console.error('Error generating CSV file:', error.message, error.stack);

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

// Most efficient streaming CSV download using pipeline (recommended approach)
// exports.downloadDataAsCSVPipeline = async (req, res) => {
//   try {
//     const query = req.query;
//     const modifiedQuery = queryModifier(query);
//     const tableName = getTableName(modifiedQuery.informationOf);
//     const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

//     // Support for custom columns selection
//     const selectedColumns = query.columns ? query.columns.split(',') : null;

//     console.log('Debug - Pipeline Download Query:', query);
//     console.log('Debug - Pipeline Download Modified Query:', modifiedQuery);
//     console.log('Debug - Pipeline Download Where Clause:', whereClause);
//     console.log('Debug - Pipeline Download Table Name:', tableName);

//     // First, get the total count to check if data exists
//     const countQuery = `
//       SELECT count(*) as totalCount
//       FROM ${DATABASE_NAME}.${tableName}
//       ${whereClause}
//     `;

//     const countResult = await clickhouse.query({
//       query: countQuery
//     });

//     const countData = await countResult.json();
//     const totalCount = countData && countData.data ? countData.data[0].totalCount : 0;

//     if (totalCount === 0) {
//       return res.status(404).json({
//         statusCode: 404,
//         message: 'No data found for the specified criteria'
//       });
//     }

//     // Generate filename with timestamp and data type
//     const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
//     const filename = `pharmaceutical_data_${modifiedQuery.informationOf}_${timestamp}.csv`;

//     // Set response headers for file download
//     res.setHeader('Content-Type', 'text/csv');
//     res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
//     res.setHeader('Cache-Control', 'no-cache');
//     res.setHeader('X-Total-Records', totalCount);
//     res.setHeader('X-Data-Type', modifiedQuery.informationOf);

//     // Get all data using streaming with CSVWithNames format (includes headers)
//     const selectClause = selectedColumns ? selectedColumns.join(', ') : '*';
//     const dataQuery = `
//       SELECT ${selectClause}
//       FROM ${DATABASE_NAME}.${tableName}
//       ${whereClause}
//       ORDER BY shippingBillDate DESC
//     `;

//     // Execute the query with CSVWithNames format (includes column headers)
//     const resultSet = await clickhouse.query({
//       query: dataQuery,
//       format: 'CSVWithNames'
//     });

//     // Get the stream from the result set
//     const stream = resultSet.stream();

//     // Use pipeline to efficiently stream data from ClickHouse to HTTP response
//     await pipelineAsync(stream, res);

//     console.log(`CSV pipeline streaming completed: ${filename} with ${totalCount} records`);

//   } catch (error) {
//     console.error('Error generating CSV file:', error.message, error.stack);

//     // Check if response has already been sent
//     if (!res.headersSent) {
//       return res.status(500).json({
//         statusCode: 500,
//         message: 'Internal server error',
//         error: error.message
//       });
//     }
//   }
// };

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
    const suggestionFieldMappings = getFieldMappings(informationOf);
    const dbSearchType = suggestionFieldMappings[searchType] || searchType;

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

