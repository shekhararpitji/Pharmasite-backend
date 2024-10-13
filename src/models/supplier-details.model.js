const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const SupplierDetails = sequelize.define('SupplierDetails', {
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
  Supplier: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  Supplier_Phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Supplier_Email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Supplier_Address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  supplier_Pin: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Supplier_City: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Supplying_Country: {
    type: DataTypes.STRING,
    allowNull: true
  },
  Supplier_State: {
    type: DataTypes.STRING,
    allowNull: true
  },
});

module.exports = SupplierDetails;
