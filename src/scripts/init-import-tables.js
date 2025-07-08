const { initClickHouseImport, populateImportAggregationTables, getImportTableStats } = require('../models/clickhouse/import.model');

async function initImportTables() {
  try {
    console.log('🚀 Initializing ClickHouse import tables...');
    
    // Initialize import tables and aggregations
    console.log('📊 Creating import tables and aggregation tables...');
    const importInit = await initClickHouseImport();
    if (!importInit) {
      throw new Error('Failed to initialize import tables');
    }
    
    // Get import table statistics
    console.log('📈 Checking import table statistics...');
    const importStats = await getImportTableStats();
    if (importStats) {
      console.log('📈 Import table statistics:');
      console.log(`   Total records: ${importStats.total_records?.toLocaleString()}`);
      console.log(`   Unique buyers: ${importStats.unique_buyers?.toLocaleString()}`);
      console.log(`   Unique suppliers: ${importStats.unique_suppliers?.toLocaleString()}`);
      console.log(`   Unique products: ${importStats.unique_products?.toLocaleString()}`);
      console.log(`   Unique countries: ${importStats.unique_countries?.toLocaleString()}`);
      console.log(`   Total value (USD): $${importStats.total_value_usd?.toLocaleString()}`);
      console.log(`   Total duty paid (USD): $${importStats.total_duty_paid_usd?.toLocaleString()}`);
      console.log(`   Average duty rate: ${(importStats.avg_duty_rate * 100)?.toFixed(2)}%`);
      console.log(`   Date range: ${importStats.earliest_date} to ${importStats.latest_date}`);
    }
    
    // Only populate aggregation tables if we have data
    if (importStats && importStats.total_records > 0) {
      console.log('📊 Populating import aggregation tables...');
      const populateSuccess = await populateImportAggregationTables();
      if (!populateSuccess) {
        throw new Error('Failed to populate import aggregation tables');
      }
      
      console.log('✅ Import aggregation tables populated successfully!');
    } else {
      console.log('⚠️  No import data found, skipping aggregation table population');
      console.log('💡 To populate with data, run: npm run migrate:import');
    }
    
    console.log('✅ Import tables initialized successfully!');
    console.log('🔥 Import analytics queries will now be lightning fast!');
    
    // Show available import analytics
    console.log('\n📋 Available import analytics:');
    console.log('   - Monthly import trends');
    console.log('   - Top importing buyers');
    console.log('   - Supplier analysis');
    console.log('   - Product import patterns');
    console.log('   - Country-wise import data');
    console.log('   - Duty rate analysis');
    
  } catch (error) {
    console.error('❌ Error initializing import tables:', error);
    process.exit(1);
  }
}

// Run the initialization if this script is executed directly
if (require.main === module) {
  initImportTables()
    .then(() => {
      console.log('\n🎉 Import tables ready!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Import table initialization failed:', error);
      process.exit(1);
    });
}

module.exports = {
  initImportTables
}; 