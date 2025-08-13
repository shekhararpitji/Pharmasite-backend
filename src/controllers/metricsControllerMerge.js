const { Sequelize, Op } = require('sequelize');
const {queryModifier} = require('../utils/queryModifier'); // Assuming queryModifier is a utility function
const ImportModel = require('../models/import.model');
const ExportModel = require('../models/export.model');

// Shared field mappings for frontend vs database field names
const fieldMappings = {
  "Indian Port": "portOfOrigin",
  "H S Code": "H_S_Code",
  // "Product Description": "productDescription",
  "Quantity Units": "quantityUnit",
  // "Quantity": "standardQuantity",
  "Unit Price": "standardUnitRateUSD",
  "Currency": "currency",
  "Product Name": "productName",
  "Indian Company": "supplier",
  "Foreign Company": "buyer",
  "Foreign Country": "buyerCountry",
  "CAS Number": "CAS_Number",
  // "Date of Shipment": "shippingBillDate"
};

// Shared utility to build base where clause
const buildBaseWhereClause = (query, modifiedQuery) => {
  const searchValues = Array.isArray(modifiedQuery.searchValue) ? modifiedQuery.searchValue : [modifiedQuery.searchValue];
  const baseWhere = {
    [Op.and]: [
      {
        [modifiedQuery.searchType]: {
          [Op.or]: searchValues.map(value => ({
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
const getGroupedData = async (model, baseWhere, groupByField) => {
  const results = await model.findAll({
    attributes: [
      [Sequelize.col(groupByField), groupByField],
      [Sequelize.fn('SUM', Sequelize.col('quantity')), 'totalQuantity'],
      [Sequelize.fn('SUM', Sequelize.col('totalValueInvoice')), 'totalValue'],
      [Sequelize.fn('COUNT', Sequelize.col('*')), 'count']
    ],
    where: baseWhere,
    group: [groupByField],
    order: [[Sequelize.literal('totalQuantity'), 'DESC']],
    raw: true
  });

  return results.map(item => ({
    [groupByField]: item[groupByField],
    totalQuantity: parseFloat(item.totalQuantity || 0),
    totalValue: parseFloat(item.totalValue || 0),
    count: parseInt(item.count || 0)
  }));
};

// API to get quantity-based metrics
// API to get top buyers by quantity
exports.getTopBuyers = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const data = await getGroupedData(model, baseWhere, 'buyer');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topBuyers: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top buyers:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

exports.getTopYears = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const data = await getGroupedData(model, baseWhere, 'year');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topYears: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top year:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

exports.getTopHSCode = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const data = await getGroupedData(model, baseWhere, 'H_S_Code');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topHSCode: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top HSCode:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// API to get top suppliers by quantity
exports.getTopSuppliers = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const data = await getGroupedData(model, baseWhere, 'supplier');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topSuppliers: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top suppliers:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// API to get top countries by quantity
exports.getTopCountry = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const data = await getGroupedData(model, baseWhere, 'buyerCountry');

    return res.status(200).json({
      statusCode: 200,
      metrics: { topCountry: data },
      query
    });
  } catch (error) {
    console.error('Error fetching top countries:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// API to get top Indian ports by quantity
exports.getTopIndianPort = async (req, res) => {
  try {
    const query = req.query;
    console.log(query,'top indian port');
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const data = await getGroupedData(model, baseWhere, 'portOfOrigin');

    // Compute top 6 arrays on the Node.js side without changing the Sequelize query
    const topIndianPortByQuantity = [...data]
      .sort((a, b) => (b.totalQuantity || 0) - (a.totalQuantity || 0))
      .slice(0, 6);

    const topIndianPortByValue = [...data]
      .sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0))
      .slice(0, 6);

    return res.status(200).json({
      statusCode: 200,
      metrics: {
        topIndianPort: data, // full list for backward compatibility
        topIndianPortByQuantity,
        topIndianPortByValue
      },
      query
    });
  } catch (error) {
    console.error('Error fetching top Indian ports:', error.message, error.stack);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error'
    });
  }
};

// API to get value-based metrics
exports.getValue = async (req, res) => {
  try {
    const query = req.query;
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
      const data = await getGroupedData(model, baseWhere, config.groupBy);
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
// exports.getTopBuyersByValue = async (req, res) => {
//   try {
//     const query = req.query;
//     const modifiedQuery = queryModifier(query);
//     const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
//     const baseWhere = buildBaseWhereClause(query, modifiedQuery);

//     const data = await getGroupedData(model, baseWhere, 'buyer', 'totalValueInvoice');

//     return res.status(200).json({
//       statusCode: 200,
//       metrics: { topBuyersByValue: data },
//       query
//     });
//   } catch (error) {
//     console.error('Error fetching top buyers by value:', error.message, error.stack);
//     return res.status(500).json({
//       statusCode: 500,
//       message: 'Internal server error'
//     });
//   }
// };

// exports.getTopHSCodeByValue = async (req, res) => {
//   try {
//     const query = req.query;
//     const modifiedQuery = queryModifier(query);
//     const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
//     const baseWhere = buildBaseWhereClause(query, modifiedQuery);

//     const data = await getGroupedData(model, baseWhere, 'H_S_Code', 'totalValueInvoice');

//     return res.status(200).json({
//       statusCode: 200,
//       metrics: { topHSCodeByValue: data },
//       query
//     });
//   } catch (error) {
//     console.error('Error fetching top HS_Code by value:', error.message, error.stack);
//     return res.status(500).json({
//       statusCode: 500,
//       message: 'Internal server error'
//     });
//   }
// };

// exports.getTopYearsByValue = async (req, res) => {
//   try {
//     const query = req.query;
//     const modifiedQuery = queryModifier(query);
//     const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
//     const baseWhere = buildBaseWhereClause(query, modifiedQuery);

//     const data = await getGroupedData(model, baseWhere, 'year', 'totalValueInvoice');

//     return res.status(200).json({
//       statusCode: 200,
//       metrics: { topYearsByValue: data },
//       query
//     });
//   } catch (error) {
//     console.error('Error fetching top years by value:', error.message, error.stack);
//     return res.status(500).json({
//       statusCode: 500,
//       message: 'Internal server error'
//     });
//   }
// };
// // API to get top suppliers by value
// exports.getTopSuppliersByValue = async (req, res) => {
//   try {
//     const query = req.query;
//     const modifiedQuery = queryModifier(query);
//     const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
//     const baseWhere = buildBaseWhereClause(query, modifiedQuery);

//     const data = await getGroupedData(model, baseWhere, 'supplier', 'totalValueInvoice');

//     return res.status(200).json({
//       statusCode: 200,
//       metrics: { topSuppliersByValue: data },
//       query
//     });
//   } catch (error) {
//     console.error('Error fetching top suppliers by value:', error.message, error.stack);
//     return res.status(500).json({
//       statusCode: 500,
//       message: 'Internal server error'
//     });
//   }
// };

// // API to get top countries by value
// exports.getTopCountryByValue = async (req, res) => {
//   try {
//     const query = req.query;
//     const modifiedQuery = queryModifier(query);
//     const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
//     const baseWhere = buildBaseWhereClause(query, modifiedQuery);

//     const data = await getGroupedData(model, baseWhere, 'buyerCountry', 'totalValueInvoice');

//     return res.status(200).json({
//       statusCode: 200,
//       metrics: { topCountryByValue: data },
//       query
//     });
//   } catch (error) {
//     console.error('Error fetching top countries by value:', error.message, error.stack);
//     return res.status(500).json({
//       statusCode: 500,
//       message: 'Internal server error'
//     });
//   }
// };

// // API to get top Indian ports by value
// exports.getTopIndianPortByValue = async (req, res) => {
//   try {
//     const query = req.query;
//     const modifiedQuery = queryModifier(query);
//     const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
//     const baseWhere = buildBaseWhereClause(query, modifiedQuery);

//     const data = await getGroupedData(model, baseWhere, 'portOfOrigin', 'totalValueInvoice');

//     return res.status(200).json({
//       statusCode: 200,
//       metrics: { topIndianPortByValue: data },
//       query
//     });
//   } catch (error) {
//     console.error('Error fetching top Indian ports by value:', error.message, error.stack);
//     return res.status(500).json({
//       statusCode: 500,
//       message: 'Internal server error'
//     });
//   }
// };
// API to get summary statistics
exports.getSummaryStats = async (req, res) => {
  try {
    const query = req.query;
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
// exports.getFilterValues = async (req, res) => {
//   try {
//     const query = req.query;
//     const modifiedQuery = queryModifier(query);
//     const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
//     const baseWhere = buildBaseWhereClause(query, modifiedQuery);

//     const filters = {};

//     for (const [displayName, dbColumnName] of Object.entries(fieldMappings)) {
//       const distinctValues = await model.findAll({
//         attributes: [
//           [Sequelize.fn('DISTINCT', Sequelize.col(dbColumnName)), dbColumnName]
//         ],
//         where: baseWhere,
//         raw: true
//       });

//       filters[displayName] = distinctValues
//         .map(item => item[dbColumnName])
//         .filter(Boolean);
//     }

//     return res.status(200).json({
//       statusCode: 200,
//       filters,
//       query
//     });
//   } catch (error) {
//     console.error('Error fetching filter values:', error.message, error.stack);
//     return res.status(500).json({
//       statusCode: 500,
//       message: 'Internal server error'
//     });
//   }
// };

// Paginated Filter Values API
exports.getFilterValues = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;
    const search = req.query.search || ''; // Search within filter values
    const filterField = req.query.field || null; // Get values for specific field only

    const filters = {};
    
    // If specific field is requested, get only that field
    if (filterField && fieldMappings[filterField]) {
      const dbColumnName = fieldMappings[filterField];
      
      // Build where condition for search
      let whereCondition = baseWhere;
      if (search) {
        whereCondition = {
          [Op.and]: [
            baseWhere,
            {
              [dbColumnName]: {
                [Op.like]: `%${search}%`
              }
            }
          ]
        };
      }

      // Get total count first
      const totalCount = await model.count({
        distinct: true,
        col: dbColumnName,
        where: whereCondition
      });

      // Get paginated distinct values
      const distinctValues = await model.findAll({
        attributes: [
          [Sequelize.fn('DISTINCT', Sequelize.col(dbColumnName)), dbColumnName]
        ],
        where: whereCondition,
        order: [[Sequelize.col(dbColumnName), 'ASC']],
        limit,
        offset,
        raw: true
      });

      const values = distinctValues
        .map(item => item[dbColumnName])
        .filter(Boolean);

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
      let whereCondition = baseWhere;
      if (search) {
        whereCondition = {
          [Op.and]: [
            baseWhere,
            {
              [dbColumnName]: {
                [Op.like]: `%${search}%`
              }
            }
          ]
        };
      }

      // Get total count for this field
      const totalCount = await model.count({
        distinct: true,
        col: dbColumnName,
        where: whereCondition
      });

      // Get paginated distinct values for this field
      const distinctValues = await model.findAll({
        attributes: [
          [Sequelize.fn('DISTINCT', Sequelize.col(dbColumnName)), dbColumnName]
        ],
        where: whereCondition,
        order: [[Sequelize.col(dbColumnName), 'ASC']],
        limit,
        offset,
        raw: true
      });

      const values = distinctValues
        .map(item => item[dbColumnName])
        .filter(Boolean);

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

// Alternative: Separate API for getting filter values for a specific field
exports.getFilterValuesByField = async (req, res) => {
  try {
    const query = req.query;
    const fieldName = req.params.field;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

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
    let whereCondition = baseWhere;
    if (search) {
      whereCondition = {
        [Op.and]: [
          baseWhere,
          {
            [dbColumnName]: {
              [Op.like]: `%${search}%`
            }
          }
        ]
      };
    }

    // Get total count
    const totalCount = await model.count({
      distinct: true,
      col: dbColumnName,
      where: whereCondition
    });

    // Get paginated distinct values
    const distinctValues = await model.findAll({
      attributes: [
        [Sequelize.fn('DISTINCT', Sequelize.col(dbColumnName)), dbColumnName],
        [Sequelize.fn('COUNT', Sequelize.col('*')), 'usage_count'] // How many times this value appears
      ],
      where: whereCondition,
      group: [dbColumnName],
      order: [
        [Sequelize.col(dbColumnName), sortOrder]
      ],
      limit,
      offset,
      raw: true
    });

    const values = distinctValues
      .map(item => ({
        value: item[dbColumnName],
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

// API to get filter metadata (count of unique values per field)
exports.getFilterMetadata = async (req, res) => {
  try {
    const query = req.query;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

    const metadataPromises = Object.entries(fieldMappings).map(async ([displayName, dbColumnName]) => {
      const count = await model.count({
        distinct: true,
        col: dbColumnName,
        where: baseWhere
      });

      return {
        displayName,
        dbColumnName,
        uniqueValueCount: count
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

// Search API for filter values across all fields
exports.searchFilterValues = async (req, res) => {
  try {
    const query = req.query;
    const searchTerm = req.query.search;
    const modifiedQuery = queryModifier(query);
    const model = modifiedQuery.informationOf === 'import' ? ImportModel : ExportModel;
    const baseWhere = buildBaseWhereClause(query, modifiedQuery);

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
      const whereCondition = {
        [Op.and]: [
          baseWhere,
          {
            [dbColumnName]: {
              [Op.like]: `%${searchTerm}%`
            }
          }
        ]
      };

      const distinctValues = await model.findAll({
        attributes: [
          [Sequelize.fn('DISTINCT', Sequelize.col(dbColumnName)), dbColumnName]
        ],
        where: whereCondition,
        order: [[Sequelize.col(dbColumnName), 'ASC']],
        limit,
        raw: true
      });

      const values = distinctValues
        .map(item => item[dbColumnName])
        .filter(Boolean);

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