const dotenv = require('dotenv');
const { Sequelize } = require('sequelize');

dotenv.config();


const sequelize = new Sequelize('pharma_db', 'root', 'Pharma@123', {
  host: '13.203.61.86' || 'localhost',
  dialect: 'mysql', 
  logging: false,   
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

module.exports = sequelize;


