const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const BuyerDetails = sequelize.define('BuyerDetails', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  uuid: {
    type: DataTypes.STRING,
    allowNull: false,
    unique:true
  },
  Buyer: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  Buyer_Address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Buyer_City: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Buyer_Pin: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Buyer_State: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Buyer_Phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Buyer_Email: {
    type: DataTypes.STRING,
    allowNull: true
  }
});

module.exports = BuyerDetails;
