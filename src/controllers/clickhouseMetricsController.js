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

// Build ClickHouse WHERE clause from query parameters
const buildClickHouseWhereClause = (query, modifiedQuery) => {
  let whereConditions = [];
  let params = {};

  // Date range filter
  if (modifiedQuery.startDate && modifiedQuery.endDate) {
    whereConditions.push('shippingBillDate BETWEEN {startDate:String} AND {endDate:String}');
    params.startDate = modifiedQuery.startDate;
    params.endDate = modifiedQuery.endDate;
  }

  // Search filter
  if (modifiedQuery.searchType && modifiedQuery.searchValue) {
    const searchValues = Array.isArray(modifiedQuery.searchValue) ? modifiedQuery.searchValue : [modifiedQuery.searchValue];
    const searchConditions = searchValues.map((value, index) => {
      const paramKey = `searchValue${index}`;
      params[paramKey] = `%${value}%`;
      return `${modifiedQuery.searchType} ILIKE {${paramKey}:String}`;
    });
    whereConditions.push(`(${searchConditions.join(' OR ')})`);
  }

  // Additional filters
  if (query.filters && typeof query.filters === 'object') {
    for (const [field, values] of Object.entries(query.filters)) {
      if (Array.isArray(values) && values.length > 0) {
        const dbColumnName = fieldMappings[field] || field;
        const paramKey = `filter_${field.replace(/\s+/g, '_')}`;
        params[paramKey] = values;
        whereConditions.push(`${dbColumnName} IN {${paramKey}:Array(String)}`);
      }
    }
  }

  return {
    whereClause: whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '',
    params
  };
};

// Get table name based on information type
const getTableName = (informationOf) => {
  return informationOf === 'import' ? 'import_data' : 'export_data';
};

// Generic function to get grouped data from ClickHouse
const getClickHouseGroupedData = async (tableName, whereClause, params, groupByField, aggregateField, limit = 6) => {
  const query = `
    SELECT 
      ${groupByField},
      sum(${aggregateField}) as total,
      count(*) as count
    FROM ${DATABASE_NAME}.${tableName}
    ${whereClause}
    GROUP BY ${groupByField}
    ORDER BY total DESC
    LIMIT {limit:UInt32}
  `;

  const result = await clickhouse.query({
    query,
    params: { ...params, limit }
  }).json();

  return result.data.map(item => ({
    [groupByField]: item[groupByField],
    total: parseFloat(item.total || 0),
    count: parseInt(item.count || 0)
  }));
};

// QUANTITY-BASED METRICS

// Get top buyers by quantity
exports.getTopBuyersByQuantity = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const tableName = getTableName(modifiedQuery.informationOf);
    const { whereClause, params } = buildClickHouseWhereClause(query, modifiedQuery);

    const data = await getClickHouseGroupedData(tableName, whereClause, params, 'buyer', 'quantity');

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

    const data = await getClickHouseGroupedData(tableName, whereClause, params, 'year', 'quantity');

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

    const data = await getClickHouseGroupedData(tableName, whereClause, params, 'H_S_Code', 'quantity');

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

    const data = await getClickHouseGroupedData(tableName, whereClause, params, 'supplier', 'quantity');

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

    const data = await getClickHouseGroupedData(tableName, whereClause, params, 'buyerCountry', 'quantity');

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

    const data = await getClickHouseGroupedData(tableName, whereClause, params, 'portOfOrigin', 'quantity');

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

    const data = await getClickHouseGroupedData(tableName, whereClause, params, 'buyer', 'totalValueInvoice');

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

    const data = await getClickHouseGroupedData(tableName, whereClause, params, 'year', 'totalValueInvoice');

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

    const data = await getClickHouseGroupedData(tableName, whereClause, params, 'H_S_Code', 'totalValueInvoice');

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

    const data = await getClickHouseGroupedData(tableName, whereClause, params, 'supplier', 'totalValueInvoice');

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

    const data = await getClickHouseGroupedData(tableName, whereClause, params, 'buyerCountry', 'totalValueInvoice');

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

    const data = await getClickHouseGroupedData(tableName, whereClause, params, 'portOfOrigin', 'totalValueInvoice');

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
      query: summaryQuery,
      params
    }).json();

    return res.status(200).json({
      statusCode: 200,
      metrics: { summaryStats: result.data[0] || {} },
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
        query: filterQuery,
        params
      }).json();

      return [key, result.data.map(item => item.value)];
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
      query: metadataQuery,
      params
    }).json();

    return res.status(200).json({
      statusCode: 200,
      metrics: { filterMetadata: result.data[0] || {} },
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

    const searchQuery = `
      SELECT DISTINCT ${field} as value
      FROM ${DATABASE_NAME}.${tableName}
      WHERE ${field} ILIKE {search:String}
      AND ${field} IS NOT NULL
      AND ${field} != ''
      ORDER BY ${field}
      LIMIT {limit:UInt32}
    `;

    const result = await clickhouse.query({
      query: searchQuery,
      params: { search: `%${search}%`, limit }
    }).json();

    return res.status(200).json({
      statusCode: 200,
      metrics: { searchResults: result.data.map(item => item.value) },
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
    let queryParams = { limit, offset };

    if (search) {
      whereCondition += ` AND ${field} ILIKE {search:String}`;
      queryParams.search = `%${search}%`;
    }

    const valuesQuery = `
      SELECT 
        ${field} as value,
        count(*) as count
      FROM ${DATABASE_NAME}.${tableName}
      ${whereCondition}
      GROUP BY ${field}
      ORDER BY count DESC, ${field}
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    `;

    const result = await clickhouse.query({
      query: valuesQuery,
      params: queryParams
    }).json();

    return res.status(200).json({
      statusCode: 200,
      metrics: { 
        field,
        values: result.data.map(item => ({
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