const dotenv = require('dotenv');
const { Sequelize } = require('sequelize');

dotenv.config();


const sequelize = new Sequelize('pharmasite', 'root', 'root', {
  host: 'localhost',
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


