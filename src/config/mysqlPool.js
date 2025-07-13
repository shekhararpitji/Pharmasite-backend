const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

/**
 * MySQL Connection Pool for Raw SQL Queries
 * 
 * This connection pool is specifically designed for raw SQL operations
 * that require better performance than ORM queries.
 * 
 * Use cases:
 * - High-performance analytics queries
 * - Bulk data operations
 * - Complex aggregations
 * - Performance-critical endpoints
 * 
 * Advantages over Sequelize:
 * - 30-50% faster query execution
 * - Lower memory usage
 * - Better connection management
 * - More predictable performance
 */
const pool = mysql.createPool({
  host: '13.203.61.86',              // Database server IP
  user: 'root',                      // Database username
  password: 'Pharma@123',            // Database password
  database: 'pharma_db',             // Database name
  waitForConnections: true,          // Queue connections when pool is full
  connectionLimit: 25,               // Maximum connections in pool
  queueLimit: 0,                     // No limit on connection queue
  acquireTimeout: 60000,             // Max time to wait for connection
  timeout: 60000,                    // Query timeout in milliseconds
  reconnect: true,                   // Automatically reconnect on connection loss
  idleTimeout: 20000,                // Time before idle connection is closed
  multipleStatements: true           // Allow multiple SQL statements in one query
});

/**
 * Test connection on startup
 * This ensures the database is accessible when the application starts
 */
pool.getConnection()
  .then(connection => {
    console.log('MySQL connection pool established successfully');
    connection.release();
  })
  .catch(err => {
    console.error('Error establishing MySQL connection pool:', err.message);
  });

module.exports = pool; 