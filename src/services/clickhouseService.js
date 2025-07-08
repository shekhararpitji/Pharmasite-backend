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
const getDataFromClickHouse = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      buyer, 
      supplier, 
      product,
      year,
      limit = 1000,
      offset = 0
    } = req.body;

    let conditions = [];
    let params = {};

    // Use year filter for better performance when possible
    if (year) {
      conditions.push('year = {year:UInt16}');
      params.year = year;
    } else if (startDate && endDate) {
      conditions.push('shippingBillDate BETWEEN {startDate:Date} AND {endDate:Date}');
      params.startDate = startDate;
      params.endDate = endDate;
    }

    if (buyer) {
      conditions.push('buyer ILIKE {buyer:String}');
      params.buyer = `%${buyer}%`;
    }

    if (supplier) {
      conditions.push('supplier ILIKE {supplier:String}');
      params.supplier = `%${supplier}%`;
    }

    if (product) {
      conditions.push('productName ILIKE {product:String}');
      params.product = `%${product}%`;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Use PREWHERE for better performance on large datasets
    const prewhere = year ? `PREWHERE year = {year:UInt16}` : '';

    const queryResult = await clickhouse.query({
      query: `
        SELECT *
        FROM ${DATABASE_NAME}.export_data
        ${prewhere}
        ${whereClause}
        ORDER BY shippingBillDate DESC
        LIMIT {limit:UInt32} OFFSET {offset:UInt32}
      `,
      params: {
        ...params,
        limit,
        offset
      }
    });
    const result = await queryResult.json();

    res.json({ success: true, data: result.data, meta: result.meta });
  } catch (error) {
    console.error('Error fetching data from ClickHouse:', error);
    res.status(500).json({ success: false, error: error.message });
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