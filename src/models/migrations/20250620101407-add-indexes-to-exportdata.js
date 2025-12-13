'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addIndex('ExportData', ['shippingBillDate'], {
      name: 'idx_shipping_bill_date'
    });

    await queryInterface.addIndex('ExportData', ['buyer'], {
      name: 'idx_buyer'
    });

    await queryInterface.addIndex('ExportData', ['supplier'], {
      name: 'idx_supplier'
    });

    await queryInterface.addIndex('ExportData', ['buyerCountry'], {
      name: 'idx_buyer_country'
    });

    await queryInterface.addIndex('ExportData', ['portOfOrigin'], {
      name: 'idx_port_of_origin'
    });

    await queryInterface.addIndex('ExportData', ['H_S_Code'], {
      name: 'idx_h_s_code'
    });

    await queryInterface.addIndex('ExportData', ['productDescription'], {
      name: 'idx_product_description'
    });

    await queryInterface.addIndex('ExportData', ['quantityUnit'], {
      name: 'idx_quantity_unit'
    });

    await queryInterface.addIndex('ExportData', ['standardQuantity'], {
      name: 'idx_standard_quantity'
    });

    await queryInterface.addIndex('ExportData', ['standardUnitRateUSD'], {
      name: 'idx_standard_unit_rate_usd'
    });

    await queryInterface.addIndex('ExportData', ['currency'], {
      name: 'idx_currency'
    });

    await queryInterface.addIndex('ExportData', ['CAS_Number'], {
      name: 'idx_cas_number'
    });

    // Composite index
    await queryInterface.addIndex('ExportData', ['shippingBillDate', 'productDescription', 'buyer', 'supplier'], {
      name: 'idx_composite_search'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('ExportData', 'idx_shipping_bill_date');
    await queryInterface.removeIndex('ExportData', 'idx_buyer');
    await queryInterface.removeIndex('ExportData', 'idx_supplier');
    await queryInterface.removeIndex('ExportData', 'idx_buyer_country');
    await queryInterface.removeIndex('ExportData', 'idx_port_of_origin');
    await queryInterface.removeIndex('ExportData', 'idx_h_s_code');
    await queryInterface.removeIndex('ExportData', 'idx_product_description');
    await queryInterface.removeIndex('ExportData', 'idx_quantity_unit');
    await queryInterface.removeIndex('ExportData', 'idx_standard_quantity');
    await queryInterface.removeIndex('ExportData', 'idx_standard_unit_rate_usd');
    await queryInterface.removeIndex('ExportData', 'idx_currency');
    await queryInterface.removeIndex('ExportData', 'idx_cas_number');
    await queryInterface.removeIndex('ExportData', 'idx_composite_search');
  }
};
