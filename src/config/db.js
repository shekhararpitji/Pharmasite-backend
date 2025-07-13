const dotenv = require('dotenv');
const { Sequelize } = require('sequelize');

// Load environment variables
dotenv.config();

/**
 * MySQL Database Configuration using Sequelize ORM
 * 
 * This is the primary database connection for the application
 * Used for:
 * - User authentication and management
 * - Main data storage (import/export records)
 * - Subscription management
 * - Activity logging
 * 
 * Database: pharma_db
 * Engine: MySQL
 * Host: 13.203.61.86 (Production server)
 */
const sequelize = new Sequelize('pharma_db', 'root', 'Pharma@123', {
  host: '13.203.61.86' || 'localhost',
  dialect: 'mysql', 
  logging: false,   // Disable SQL query logging for production
  
  // Connection pool configuration for optimal performance
  pool: {
    max: 25,        // Maximum number of connections in pool
    min: 5,         // Minimum number of connections in pool
    acquire: 60000, // Maximum time (ms) to try getting connection
    idle: 20000     // Maximum time (ms) connection can be idle
  },
  
  // Connection timeout settings
  dialectOptions: {
    connectTimeout: 60000  // Connection timeout in milliseconds
  }
});

module.exports = sequelize;


