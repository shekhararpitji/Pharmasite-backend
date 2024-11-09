const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ExportModel = sequelize.define('ExportData', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  informationOf: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  yearMonth: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  year: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  portOfOrigin: {
    type: DataTypes.STRING,
    allowNull: true
  },
  modeOfShipment: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  indianPortCode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  shippingBillDate: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  shippingBillNumber: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  shippingBillStatus: {
    type: DataTypes.STRING,
    allowNull: true
  },
  invoiceNumber: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  itemNumber: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  H_S_Code: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  productDescription: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  productName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  CAS_Number: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  quantity: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
  },
  quantityUnit: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  standardQuantity: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
  },
  standardQuantityUnit: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  standardUnitRateINR: {
    type: DataTypes.DECIMAL(20, 5),
    allowNull: true,
  },
  standardUnitRateUSD: {
    type: DataTypes.DECIMAL(20, 2),
  },
  itemRateINR: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
  },
  itemRateUSD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
  },
  totalValueINR: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
  },
  totalValueUSD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
  },
  itemRateInvoice: {
    type: DataTypes.STRING,
    allowNull: true
  },
  currency: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  totalValueInvoice: {
    type: DataTypes.DECIMAL(20,2),
    allowNull: true,
  },
  freightOnBoardINR: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true
  },
  freightOnBoardUSD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true
  },
  importExportCode: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  supplier: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  supplierRaw: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  supplierAddress: {
    type: DataTypes.STRING,
    allowNull: true
  },
  supplierCity: {
    type: DataTypes.STRING,
    allowNull: true
  },
  supplierCountry:{
    type:DataTypes.STRING,
    allowNull:true
  },
  buyer: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  buyerRaw: {
    type: DataTypes.STRING,
    allowNull: true
  },
  companyStatus: {
    type: DataTypes.STRING,
    allowNull: true
  },
  portOfDeparture: {
    type: DataTypes.STRING,
    allowNull: true
  },
  buyerCountry: {
    type: DataTypes.STRING,
    allowNull: true
  },
  region:{
    type:DataTypes.STRING,
    allowNull:true
  }
});

module.exports = ExportModel;
