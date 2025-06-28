const dotenv = require('dotenv');
const { Sequelize } = require('sequelize');

dotenv.config();


const sequelize = new Sequelize('pharma_db', 'root', 'Pharma@123', {
  host: '13.203.61.86' || 'localhost',
  dialect: 'mysql', 
  logging: false,   
  pool: {
    max: 25,
    min: 5,
    acquire: 60000,
    idle: 20000
  },
  dialectOptions: {
    connectTimeout: 60000
  }
});

module.exports = sequelize;


