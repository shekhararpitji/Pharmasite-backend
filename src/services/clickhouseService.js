const { clickhouse } = require('../config/clickhouse');
const { queryModifier } = require('../utils/queryModifier');
const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';

/**
 * Get fast dashboard metrics using pre-aggregated tables
 */
const getDashboardMetrics = async (req, res) => {
  try {
    const { 
      startYear = 2020, 
      endYear = new Date().getFullYear(),
      limit = 10 
    } = req.query;

    // Get monthly trends (super fast from aggregated table)
    const monthlyTrends = await clickhouse.query({
      query: `
        SELECT 
          year,
          month,
          yearMonth,
          sum(total_transactions) as transactions,
          sum(total_quantity) as quantity,
          sum(total_value_usd) as value_usd,
          sum(total_value_inr) as value_inr,
          avg(avg_transaction_value) as avg_value
        FROM ${DATABASE_NAME}.export_monthly_agg
        WHERE year BETWEEN {startYear:UInt16} AND {endYear:UInt16}
        GROUP BY year, month, yearMonth
        ORDER BY year DESC, month DESC
        LIMIT 24
      `,
      params: { startYear, endYear }
    }).exec();

    // Get top performers from aggregated tables
    const [topBuyers, topSuppliers, topProducts, topCountries] = await Promise.all([
      // Top buyers
      clickhouse.query({
        query: `
          SELECT 
            buyer,
            buyerCountry,
            sum(total_transactions) as transactions,
            sum(total_value_usd) as value_usd,
            sum(total_quantity) as quantity
          FROM ${DATABASE_NAME}.export_buyer_agg
          WHERE year BETWEEN {startYear:UInt16} AND {endYear:UInt16}
          GROUP BY buyer, buyerCountry
          ORDER BY value_usd DESC
          LIMIT {limit:UInt32}
        `,
        params: { startYear, endYear, limit }
      }).exec(),
      
      // Top suppliers
      clickhouse.query({
        query: `
          SELECT 
            supplier,
            supplierCountry,
            sum(total_transactions) as transactions,
            sum(total_value_usd) as value_usd,
            sum(total_quantity) as quantity
          FROM ${DATABASE_NAME}.export_supplier_agg
          WHERE year BETWEEN {startYear:UInt16} AND {endYear:UInt16}
          GROUP BY supplier, supplierCountry
          ORDER BY value_usd DESC
          LIMIT {limit:UInt32}
        `,
        params: { startYear, endYear, limit }
      }).exec(),
      
      // Top products
      clickhouse.query({
        query: `
          SELECT 
            productName,
            H_S_Code,
            sum(total_transactions) as transactions,
            sum(total_value_usd) as value_usd,
            sum(total_quantity) as quantity
          FROM ${DATABASE_NAME}.export_product_agg
          WHERE year BETWEEN {startYear:UInt16} AND {endYear:UInt16}
          GROUP BY productName, H_S_Code
          ORDER BY value_usd DESC
          LIMIT {limit:UInt32}
        `,
        params: { startYear, endYear, limit }
      }).exec(),
      
      // Top countries
      clickhouse.query({
        query: `
          SELECT 
            buyerCountry,
            sum(total_transactions) as transactions,
            sum(total_value_usd) as value_usd,
            sum(total_quantity) as quantity
          FROM ${DATABASE_NAME}.export_country_agg
          WHERE year BETWEEN {startYear:UInt16} AND {endYear:UInt16}
          GROUP BY buyerCountry
          ORDER BY value_usd DESC
          LIMIT {limit:UInt32}
        `,
        params: { startYear, endYear, limit }
      }).exec()
    ]);

    // Get overall summary
    const summary = await clickhouse.query({
      query: `
        SELECT 
          sum(total_transactions) as total_transactions,
          sum(total_quantity) as total_quantity,
          sum(total_value_usd) as total_value_usd,
          sum(total_value_inr) as total_value_inr,
          sum(unique_buyers) as total_buyers,
          sum(unique_suppliers) as total_suppliers
        FROM ${DATABASE_NAME}.export_monthly_agg
        WHERE year BETWEEN {startYear:UInt16} AND {endYear:UInt16}
      `,
      params: { startYear, endYear }
    }).exec();

    res.json({ 
      success: true, 
      data: {
        summary: summary[0] || {},
        monthlyTrends,
        topBuyers,
        topSuppliers,
        topProducts,
        topCountries
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get fast buyer analytics
 */
const getBuyerAnalytics = async (req, res) => {
  try {
    const { 
      year = new Date().getFullYear(),
      limit = 50,
      offset = 0,
      search = ''
    } = req.query;

    let whereClause = 'WHERE year = {year:UInt16}';
    let params = { year, limit, offset };

    if (search) {
      whereClause += ' AND buyer ILIKE {search:String}';
      params.search = `%${search}%`;
    }

    const result = await clickhouse.query({
      query: `
        SELECT 
          buyer,
          buyerCountry,
          sum(total_transactions) as transactions,
          sum(total_quantity) as quantity,
          sum(total_value_usd) as value_usd,
          sum(total_value_inr) as value_inr,
          sum(unique_products) as products,
          min(first_transaction_date) as first_transaction,
          max(last_transaction_date) as last_transaction
        FROM ${DATABASE_NAME}.export_buyer_agg
        ${whereClause}
        GROUP BY buyer, buyerCountry
        ORDER BY value_usd DESC
        LIMIT {limit:UInt32} OFFSET {offset:UInt32}
      `,
      params
    }).exec();

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching buyer analytics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get fast supplier analytics
 */
const getSupplierAnalytics = async (req, res) => {
  try {
    const { 
      year = new Date().getFullYear(),
      limit = 50,
      offset = 0,
      search = ''
    } = req.query;

    let whereClause = 'WHERE year = {year:UInt16}';
    let params = { year, limit, offset };

    if (search) {
      whereClause += ' AND supplier ILIKE {search:String}';
      params.search = `%${search}%`;
    }

    const result = await clickhouse.query({
      query: `
        SELECT 
          supplier,
          supplierCountry,
          sum(total_transactions) as transactions,
          sum(total_quantity) as quantity,
          sum(total_value_usd) as value_usd,
          sum(total_value_inr) as value_inr,
          sum(unique_products) as products,
          sum(unique_buyers) as buyers,
          min(first_transaction_date) as first_transaction,
          max(last_transaction_date) as last_transaction
        FROM ${DATABASE_NAME}.export_supplier_agg
        ${whereClause}
        GROUP BY supplier, supplierCountry
        ORDER BY value_usd DESC
        LIMIT {limit:UInt32} OFFSET {offset:UInt32}
      `,
      params
    }).exec();

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching supplier analytics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get time-series data for charts (optimized)
 */
const getTimeSeriesData = async (req, res) => {
  try {
    const { 
      startYear = 2020, 
      endYear = new Date().getFullYear(),
      groupBy = 'month', // month, quarter, year
      metric = 'value_usd' // value_usd, quantity, transactions
    } = req.query;

    let selectClause, groupByClause, orderByClause;
    
    switch (groupBy) {
      case 'year':
        selectClause = 'year';
        groupByClause = 'year';
        orderByClause = 'year';
        break;
      case 'quarter':
        selectClause = 'year, toQuarter(toDate(concat(toString(year), \'-\', toString(month), \'-01\'))) as quarter';
        groupByClause = 'year, quarter';
        orderByClause = 'year, quarter';
        break;
      default: // month
        selectClause = 'year, month, yearMonth';
        groupByClause = 'year, month, yearMonth';
        orderByClause = 'year, month';
    }

    const metricColumn = metric === 'quantity' ? 'total_quantity' : 
                        metric === 'transactions' ? 'total_transactions' : 'total_value_usd';

    const result = await clickhouse.query({
      query: `
        SELECT 
          ${selectClause},
          sum(${metricColumn}) as value
        FROM ${DATABASE_NAME}.export_monthly_agg
        WHERE year BETWEEN {startYear:UInt16} AND {endYear:UInt16}
        GROUP BY ${groupByClause}
        ORDER BY ${orderByClause}
      `,
      params: { startYear, endYear }
    }).exec();

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching time series data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get data records from ClickHouse with pagination (original function, optimized)
 */
/**
 * Enhanced Get data from ClickHouse with comprehensive filtering and pagination
 * Similar to MySQL getData function but optimized for ClickHouse
 * Uses direct SQL string concatenation with proper escaping (no parameterized queries)
 */
const getDataFromClickHouse = async (req, res) => {
  try {
    const query = req.query;
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;
    const offset = (page - 1) * limit;

    const modifiedQuery = queryModifier(query);
    const tableName = modifiedQuery.informationOf === 'import' ? 'import_data' : 'export_data';

    // Build ClickHouse WHERE clause with direct string concatenation
    let whereConditions = [];

    // Date range filter - both import and export now use shippingBillDate
    const dateField = 'shippingBillDate';
    if (modifiedQuery.startDate && modifiedQuery.endDate) {
      const startDate = modifiedQuery.startDate.replace(/'/g, "''"); // Escape single quotes
      const endDate = modifiedQuery.endDate.replace(/'/g, "''"); // Escape single quotes
      whereConditions.push(`toDate(${dateField}) BETWEEN toDate('${startDate}') AND toDate('${endDate}')`);
      // Also filter out null dates and invalid dates - use proper date type filtering
      whereConditions.push(`${dateField} IS NOT NULL AND ${dateField} != '1970-01-01'`);
    } else {
      // Still filter out null dates even when no date range is specified
      whereConditions.push(`${dateField} IS NOT NULL AND ${dateField} != '1970-01-01'`);
    }

    // Search filter
    if (modifiedQuery.searchType && query.searchValue) {
      const searchValues = Array.isArray(query.searchValue) ? query.searchValue : [query.searchValue];
      const searchConditions = searchValues.map(value => {
        const escapedValue = value.replace(/'/g, "''"); // Escape single quotes
        return `${modifiedQuery.searchType} ILIKE '%${escapedValue}%'`;
      });
      whereConditions.push(`(${searchConditions.join(' OR ')})`);
    }

    // Field mappings for filters
    const fieldMappings = {
      "Indian Port": "portOfOrigin",
      "H S Code": "H_S_Code",
      "Product Description": "productDescription",
      "Quantity Units": "quantityUnit",
      "Quantity": "standardQuantity",
      "Unit Price": "standardUnitRateUSD",
      "Currency": "currency",
      "Product Name": "productName",
      "Indian Company": "supplier",
      "Foreign Company": "buyer",
      "Foreign Country": "buyerCountry",
      "CAS Number": "CAS_Number",
      "Date of Shipment": "shippingBillDate"
    };

    // Apply additional filters
    if (query.filters && typeof query.filters === 'object') {
      for (const [displayName, values] of Object.entries(query.filters)) {
        const dbColumnName = fieldMappings[displayName] || displayName;
        
        // Handle range filters for Quantity, Quantity Units and Unit Price
        // Expected format: { "Quantity": { min: 10, max: 100 } } or { "Quantity Units": { min: 10, max: 100 } } or { "Unit Price": { min: 5.5, max: 25.0 } }
        if ((displayName === 'Quantity' || displayName === 'Quantity Units' || displayName === 'Unit Price') && 
            typeof values === 'object' && values.min !== undefined && values.max !== undefined) {
          
          console.log('Processing range filter for:', displayName, 'min:', values.min, 'max:', values.max);
          
          // Validate and convert min/max values to numbers
          const minValue = parseFloat(values.min);
          const maxValue = parseFloat(values.max);
          
          if (!isNaN(minValue) && !isNaN(maxValue)) {
            // Ensure min is not greater than max
            if (minValue <= maxValue) {
              whereConditions.push(`${dbColumnName} >= ${minValue} AND ${dbColumnName} <= ${maxValue}`);
            } else {
              console.warn(`Invalid range: min (${minValue}) is greater than max (${maxValue}) for field ${displayName}`);
            }
          } else {
            console.warn(`Invalid numeric values for range filter on field ${displayName}: min=${values.min}, max=${values.max}`);
          }
        } else if (Array.isArray(values) && values.length > 0) {
          // Handle regular comma-separated values (existing logic)
          // Handle numeric fields differently
          const isNumericField = dbColumnName === 'quantity' || dbColumnName === 'standardQuantity' || dbColumnName === 'totalValueInvoice' || dbColumnName === 'standardUnitRateUSD';
          
          if (isNumericField) {
            // For numeric fields, filter out empty strings and convert to numbers
            const numericValues = values.filter(v => v !== '' && v !== null && !isNaN(v));
            if (numericValues.length > 0) {
              const numericConditions = numericValues.map(value => {
                return `${dbColumnName} = ${parseFloat(value)}`;
              });
              whereConditions.push(`(${numericConditions.join(' OR ')})`);
            }
          } else {
            // For string fields, use normal string comparison with escaping
            const stringConditions = values.map(value => {
              const escapedValue = value.replace(/'/g, "''"); // Escape single quotes
              return `${dbColumnName} = '${escapedValue}'`;
            });
            whereConditions.push(`(${stringConditions.join(' OR ')})`);
          }
        }
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

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
      query: modifiedQuery
    });

  } catch (error) {
    console.error('Error fetching data from ClickHouse:', error);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get aggregated data for specific analysis
 */
const getAggregatedAnalysis = async (req, res) => {
  try {
    const { 
      groupBy = 'buyer', // buyer, supplier, product, country, year
      metric = 'value_usd', // value_usd, quantity, transactions
      year,
      limit = 20
    } = req.query;

    let tableName, selectFields, whereClause = '';
    let params = { limit };

    if (year) {
      whereClause = 'WHERE year = {year:UInt16}';
      params.year = year;
    }

    const metricColumn = metric === 'quantity' ? 'total_quantity' : 
                        metric === 'transactions' ? 'total_transactions' : 'total_value_usd';

    switch (groupBy) {
      case 'buyer':
        tableName = 'export_buyer_agg';
        selectFields = 'buyer, buyerCountry';
        break;
      case 'supplier':
        tableName = 'export_supplier_agg';
        selectFields = 'supplier, supplierCountry';
        break;
      case 'product':
        tableName = 'export_product_agg';
        selectFields = 'productName, H_S_Code';
        break;
      case 'country':
        tableName = 'export_country_agg';
        selectFields = 'buyerCountry';
        break;
      default:
        tableName = 'export_monthly_agg';
        selectFields = 'year';
    }

    const result = await clickhouse.query({
      query: `
        SELECT 
          ${selectFields},
          sum(${metricColumn}) as total_value,
          sum(total_transactions) as total_transactions
        FROM ${DATABASE_NAME}.${tableName}
        ${whereClause}
        GROUP BY ${selectFields}
        ORDER BY total_value DESC
        LIMIT {limit:UInt32}
      `,
      params
    }).exec();

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching aggregated analysis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getDashboardMetrics,
  getBuyerAnalytics,
  getSupplierAnalytics,
  getTimeSeriesData,
  getDataFromClickHouse,
  getAggregatedAnalysis
}; 