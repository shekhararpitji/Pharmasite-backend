const { clickhouse } = require('../../config/clickhouse');

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const TABLE_NAME = 'export_data';

async function initClickHouseExport() {
  try {
    // Create the export_data table
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.${TABLE_NAME} (
          id String,
          informationOf String,
          yearMonth String,
          year UInt16,
          portOfOrigin String,
          modeOfShipment String,
          indianPortCode String,
          shippingBillDate Date,
          shippingBillNumber String,
          shippingBillStatus String,
          invoiceNumber String,
          itemNumber String,
          H_S_Code String,
          chapter String,
          productDescription String,
          productName String,
          CAS_Number String,
          quantity Float64,
          quantityUnit String,
          standardQuantity Float64,
          standardQuantityUnit String,
          standardUnitRateINR Float64,
          standardUnitRateUSD Float64,
          itemRateINR Float64,
          itemRateUSD Float64,
          totalValueINR Float64,
          totalValueUSD Float64,
          itemRateInvoice Float64,
          currency String,
          totalValueInvoice Float64,
          freightOnBoardINR Float64,
          freightOnBoardUSD Float64,
          importExportCode String,
          supplier String,
          supplierRaw String,
          supplierAddress String,
          supplierCity String,
          supplierCountry String,
          buyer String,
          buyerRaw String,
          companyStatus String,
          portOfDeparture String,
          buyerCountry String,
          region String,
          createdAt DateTime,
          updatedAt DateTime
        ) 
        ENGINE = MergeTree()
        ORDER BY (year, shippingBillDate)
        PARTITION BY year
        SETTINGS index_granularity = 8192
      `
    });

    return true;
  } catch (error) {
    console.error('Error initializing ClickHouse tables:', error);
    return false;
  }
}

module.exports = {
  initClickHouseExport
}; 