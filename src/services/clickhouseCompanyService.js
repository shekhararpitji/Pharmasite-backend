const { clickhouse } = require('../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'companies';

/**
 * ClickHouse Company Service
 * Handles all company-related operations
 */

/**
 * Create a new company
 */
const createCompany = async (companyData) => {
  try {
    const {
      name,
      email,
      contactPerson,
      address,
      phone,
      status = 'active'
    } = companyData;

    // Get next ID
    const idResult = await clickhouse.query({
      query: `SELECT MAX(id) as maxId FROM ${DATABASE_NAME}.${TABLE_NAME}`,
      format: 'JSONEachRow'
    });
    const idData = await idResult.json();
    const nextId = (parseInt(idData[0]?.maxId || 0) + 1);

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await clickhouse.insert({
      table: `${DATABASE_NAME}.${TABLE_NAME}`,
      values: [{
        id: nextId,
        name,
        email,
        contactPerson: contactPerson || null,
        address: address || null,
        phone: phone || null,
        status,
        createdAt: now,
        updatedAt: now
      }],
      format: 'JSONEachRow'
    });

    return {
      id: nextId,
      name,
      email,
      contactPerson,
      address,
      phone,
      status
    };
  } catch (error) {
    console.error('Error creating company:', error);
    throw error;
  }
};

/**
 * Get company by ID
 */
const getCompanyById = async (companyId) => {
  try {
    const result = await clickhouse.query({
      query: `
        SELECT * FROM ${DATABASE_NAME}.${TABLE_NAME}
        WHERE id = ${companyId}
        LIMIT 1
      `,
      format: 'JSONEachRow'
    });

    const companies = await result.json();
    return companies.length > 0 ? companies[0] : null;
  } catch (error) {
    console.error('Error getting company by ID:', error);
    throw error;
  }
};

/**
 * Get all companies with optional filters
 */
const getAllCompanies = async (filters = {}) => {
  try {
    let whereConditions = [];
    
    if (filters.status) {
      whereConditions.push(`status = '${filters.status}'`);
    }
    if (filters.name) {
      whereConditions.push(`name ILIKE '%${filters.name}%'`);
    }
    if (filters.email) {
      whereConditions.push(`email ILIKE '%${filters.email}%'`);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const result = await clickhouse.query({
      query: `
        SELECT * FROM ${DATABASE_NAME}.${TABLE_NAME}
        ${whereClause}
        ORDER BY updatedAt DESC, createdAt DESC
      `,
      format: 'JSONEachRow'
    });

    return await result.json();
  } catch (error) {
    console.error('Error getting all companies:', error);
    throw error;
  }
};

/**
 * Update company
 */
const updateCompany = async (companyId, updateData) => {
  try {
    const setClauses = [];
    const allowedFields = ['name', 'email', 'contactPerson', 'address', 'phone', 'status'];
    
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        if (typeof updateData[field] === 'string') {
          setClauses.push(`${field} = '${updateData[field].replace(/'/g, "''")}'`);
        } else {
          setClauses.push(`${field} = ${updateData[field]}`);
        }
      }
    }
    
    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClauses.push(`updatedAt = '${new Date().toISOString().slice(0, 19).replace('T', ' ')}'`);

    await clickhouse.command({
      query: `
        ALTER TABLE ${DATABASE_NAME}.${TABLE_NAME}
        UPDATE ${setClauses.join(', ')}
        WHERE id = ${companyId}
      `
    });

    return await getCompanyById(companyId);
  } catch (error) {
    console.error('Error updating company:', error);
    throw error;
  }
};

module.exports = {
  createCompany,
  getCompanyById,
  getAllCompanies,
  updateCompany
};

