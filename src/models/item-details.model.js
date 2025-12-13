const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ItemDetails = sequelize.define('ItemDetails', {
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
  Item_Number: {
    type: DataTypes.DECIMAL,
    allowNull: true,
  },
  Quantity: {
    type: DataTypes.DECIMAL,
    allowNull: true,
  },
  Quantity_Unit: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  Standard_Quantity: {
    type: DataTypes.DECIMAL,
    allowNull:true,
  },
  Standard_Quantity_Unit: {
    type: DataTypes.STRING,
    allowNull:true,
  },
  Standard_Unit_Rate_INR: {
    type: DataTypes.DECIMAL,
    allowNull:true,
  },
  Standard_Unit_Rate_USD: {
    type: DataTypes.DECIMAL,
    allowNull:true,
  },
  Item_Rate_INR: {
    type: DataTypes.DECIMAL,
    allowNull: false,
    uniqui:true
  },
  Item_Rate_USD: {
    type: DataTypes.DECIMAL,
    allowNull: false,
    uniqui:true
  },
  
  Invoice_Currency: {
    type: DataTypes.STRING,
    allowNull: false,
    uniqui:true
  },
  Total_Value_INR: {
    type: DataTypes.DECIMAL,
    allowNull: false,
    uniqui:true
  },
  Total_Value_USD: {
    type: DataTypes.DECIMAL,
    allowNull: false,
    uniqui:true
  },
  Total_Duty_Paid_INR: {
    type: DataTypes.DECIMAL,
    allowNull: false,
    uniqui:true
  },
  Total_Duty_Paid_USD: {
    type: DataTypes.DECIMAL,
    allowNull: false,
    uniqui:true
  }
});

module.exports = ItemDetails;
