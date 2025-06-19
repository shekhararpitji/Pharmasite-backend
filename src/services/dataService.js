const { Sequelize, Op } = require('sequelize');
const { ImportModel, ExportModel } = require('../models'); // Assuming models are imported from a models directory
const queryModifier = require('../utils/queryModifier'); // Assuming queryModifier is a utility function

// Shared field mappings for frontend vs database field names
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

// Shared utility to build base where clause
const buildBaseWhereClause = (query, modifiedQuery) => {
  const baseWhere = {
    [Op.and]: [
      {
        [modifiedQuery.searchType]: {
          [Op.or]: modifiedQuery.searchValue.map(value => ({
            [Op.like]: `%${value}%`
          }))
        }
      },
      {
        shippingBillDate: {
          [Op.between]: [modifiedQuery.startDate, modifiedQuery.endDate],
        }
      }
    ]
  };

  if (query.filters && typeof query.filters === 'object') {
    for (const [field, values] of Object.entries(query.filters)) {
      if (Array.isArray(values) && values.length > 0) {
        const dbColumnName = fieldMappings[field] || field;
        baseWhere[Op.and].push({
          [dbColumnName]: {
            [Op.in]: values
          }
        });
      }
    }
  }

  return baseWhere;
};

// Shared utility to get grouped data
const getGroupedData = async (model, baseWhere, groupByField, aggregateField, limit = 6) => {
  const results = await model.findAll({
    attributes: [
      [Sequelize.col(groupByField), groupByField],
      [Sequelize.fn('SUM', Sequelize.col(aggregateField)), 'total'],
      [Sequelize.fn('COUNT', Sequelize.col('*')), 'count']
    ],
    where: baseWhere,
    group: [groupByField],
    order: [[Sequelize.literal('total'), 'DESC']],
    limit,
    raw: true
  });

  return results.map(item => ({
    [groupByField]: item[groupByField],
    total: parseFloat(item.total || 0),
    count: parseInt(item.count || 0)
  }));
};

// API to get quantity-based metrics
// API to get top buyers by quantity
exports.getTopBuyersByQuantity = async (req, res) => {
  try {
    const query = req.body;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const data = await getGroupedData(model, baseWhere, 'buyer', 'quantity');

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

// API to get top suppliers by quantity
exports.getTopSuppliersByQuantity = async (req, res) => {
  try {
    const query = req.body;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const data = await getGroupedData(model, baseWhere, 'supplier', 'quantity');

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

// API to get top countries by quantity
exports.getTopCountryByQuantity = async (req, res) => {
  try {
    const query = req.body;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const data = await getGroupedData(model, baseWhere, 'buyerCountry', 'quantity');

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

// API to get top Indian ports by quantity
exports.getTopIndianPortByQuantity = async (req, res) => {
  try {
    const query = req.body;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const data = await getGroupedData(model, baseWhere, 'portOfOrigin', 'quantity');

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

// API to get value-based metrics
exports.getValueMetrics = async (req, res) => {
  try {
    const query = req.body;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const metricsConfig = [
      { key: 'topBuyersByValue', groupBy: 'buyer' },
      { key: 'topSuppliersByValue', groupBy: 'supplier' },
      { key: 'topCountryByValue', groupBy: 'buyerCountry' },
      { key: 'topIndianPortByValue', groupBy: 'portOfOrigin' }
    ];

    const valuePromises = metricsConfig.map(async config => {
      const data = await getGroupedData(model, baseWhere, config.groupBy, 'totalValueInvoice');
      return [config.key, data];
    });

    const valueResults = await Promise.all(valuePromises);
    const metrics = Object.fromEntries(valueResults);

    return res.status(200).json({
      statusCode: 200,
      metrics,
      query
    });
  } catch (error) {
    console.error('Error fetching value metrics:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// API to get value-based metrics
// API to get top buyers by value
exports.getTopBuyersByValue = async (req, res) => {
  try {
    const query = req.body;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const data = await getGroupedData(model, baseWhere, 'buyer', 'totalValueInvoice');

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

// API to get top suppliers by value
exports.getTopSuppliersByValue = async (req, res) => {
  try {
    const query = req.body;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const data = await getGroupedData(model, baseWhere, 'supplier', 'totalValueInvoice');

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

// API to get top countries by value
exports.getTopCountryByValue = async (req, res) => {
  try {
    const query = req.body;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const data = await getGroupedData(model, baseWhere, 'buyerCountry', 'totalValueInvoice');

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

// API to get top Indian ports by value
exports.getTopIndianPortByValue = async (req, res) => {
  try {
    const query = req.body;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const data = await getGroupedData(model, baseWhere, 'portOfOrigin', 'totalValueInvoice');

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
// API to get summary statistics
exports.getSummaryStats = async (req, res) => {
  try {
    const query = req.body;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const results = await model.findAll({
      attributes: [
        [Sequelize.fn('SUM', Sequelize.col('quantity')), 'totalQuantity'],
        [Sequelize.fn('SUM', Sequelize.col('totalValueUSD')), 'totalValueUSD'],
        [Sequelize.fn('COUNT', Sequelize.col('*')), 'totalRecords'],
        [Sequelize.fn('COUNT', Sequelize.fn('DISTINCT', Sequelize.col('buyer'))), 'uniqueBuyers'],
        [Sequelize.fn('COUNT', Sequelize.fn('DISTINCT', Sequelize.col('supplier'))), 'uniqueSuppliers']
      ],
      where: baseWhere,
      raw: true
    });

    const summaryStats = {
      totalQuantity: parseFloat(results[0].totalQuantity || 0),
      totalValueUSD: parseFloat(results[0].totalValueUSD || 0),
      totalRecords: parseInt(results[0].totalRecords || 0),
      uniqueBuyers: parseInt(results[0].uniqueBuyers || 0),
      uniqueSuppliers: parseInt(results[0].uniqueSuppliers || 0)
    };

    return res.status(200).json({
      statusCode: 200,
      metrics: { summary: summaryStats },
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

// API to get distinct filter values
exports.getFilterValues = async (req, res) => {
  try {
    const query = req.body;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const filters = {};

    for (const [displayName, dbColumnName] of Object.entries(fieldMappings)) {
      const distinctValues = await model.findAll({
        attributes: [
          [Sequelize.fn('DISTINCT', Sequelize.col(dbColumnName)), dbColumnName]
        ],
        where: baseWhere,
        raw: true
      });

      filters[displayName] = distinctValues
        .map(item => item[dbColumnName])
        .filter(Boolean);
    }

    return res.status(200).json({
      statusCode: 200,
      filters,
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