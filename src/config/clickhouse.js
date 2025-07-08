const { createClient } = require('@clickhouse/client');
const dotenv = require('dotenv');

dotenv.config();

// Create a ClickHouse client with connection pooling
const clickhouse = createClient({
    url: process.env.CLICKHOUSE_URL,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
  })


// Test connection and create database if it doesn't exist
const initClickHouse = async () => {
  try {
    // Create database if not exists
    await clickhouse.command({
      query: `CREATE DATABASE IF NOT EXISTS ${process.env.CLICKHOUSE_DB || 'pharma_analytics'}`
    });
    
    console.log('ClickHouse connection established successfully');
    return true;
  } catch (error) {
    console.error('ClickHouse connection error:', error);
    return false;
  }
};

module.exports = {
  clickhouse,
  initClickHouse
}; 