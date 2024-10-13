const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ShippingDetails = sequelize.define('ShippingDetails', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },  
  uuid: {
    type: DataTypes.STRING,
    allowNull: false,
    unique:true,
  },
  Mode_of_Shipment: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  Shipping_Bill_Number: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  Shipping_Bill_Status: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Shipping_Bill_Type: {
    type: DataTypes.STRING,
    allowNull: true
  },
});

module.exports = ShippingDetails;
