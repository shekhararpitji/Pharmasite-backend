const ImportExportData = require('./import-export.model');
const ItemDetails = require('./item-details.model');
const ShippingDetails = require('./shipping-details.model');
const SupplierDetails = require('./supplier-details.model');
const BuyerDetails = require('./buyer-details.model');

ImportExportData.hasOne(ItemDetails, { foreignKey: 'importExportId' });
ImportExportData.hasOne(ShippingDetails, { foreignKey: 'importExportId' });
ImportExportData.hasOne(SupplierDetails, { foreignKey: 'importExportId' });
ImportExportData.hasOne(BuyerDetails, { foreignKey: 'importExportId' });

ItemDetails.belongsTo(ImportExportData, { foreignKey: 'importExportId' });
ShippingDetails.belongsTo(ImportExportData, { foreignKey: 'importExportId' });
SupplierDetails.belongsTo(ImportExportData, { foreignKey: 'importExportId' });
BuyerDetails.belongsTo(ImportExportData, { foreignKey: 'importExportId' });


module.exports = {
  ImportExportData,
  ItemDetails,
  ShippingDetails,
  SupplierDetails,
  BuyerDetails
};
