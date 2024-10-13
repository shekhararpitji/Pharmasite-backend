const { DataTypes } = require('sequelize');
const ItemDetails = require('./item-details.model')
const ShippingDetails= require('./shipping-details.model');
const SupplierDetails = require('./supplier-details.model');
const BuyerDetails= require('./buyer-details.model')
const sequelize = require('../config/db');

const ImportExportData = sequelize.define('ImportExportData', {
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
  Information_Of: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  Year_Month: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  Product_Description: {
    type: DataTypes.STRING,
    allowNull:false,
  },
  Import_Export_Code: {
    type: DataTypes.STRING,
    allowNull:true,
  },
   Port_Of_Origin: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Origin_Port_Code: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Port_Of_Departure: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Departure_Port_Code: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Invoice_Number: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  Invoice_Currency: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  Total_Value_Invoice:{
    type: DataTypes.STRING,
    allowNull: true,
  },
  Director: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  Custom_House_Agent: {
    type: DataTypes.STRING,
    allowNull: true,
  }
});

module.exports = ImportExportData;
