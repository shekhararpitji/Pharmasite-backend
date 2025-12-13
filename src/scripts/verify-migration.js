#!/usr/bin/env node
const dotenv = require('dotenv');
const { clickhouse } = require('../config/clickhouse');
const sequelize = require('../config/db');
const UserModel = require('../models/user.model');
const SubscriptionModel = require('../models/subscription.model');
const ActivityModel = require('../models/activity.model');

dotenv.config();

const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';

/**
 * Verification script to compare MySQL and ClickHouse data
 */
async function verifyMigration() {
  console.log('🔍 Starting migration verification...\n');
  
  try {
    // Connect to MySQL
    await sequelize.authenticate();
    console.log('✅ Connected to MySQL database');
    
    // Test ClickHouse connection
    await clickhouse.ping();
    console.log('✅ Connected to ClickHouse database\n');
    
    // Verify Users
    console.log('📊 Verifying Users table:');
    const mysqlUserCount = await UserModel.count();
    const clickhouseUserResult = await clickhouse.query({
      query: `SELECT COUNT(*) as count FROM ${DATABASE_NAME}.users`,
      format: 'JSONEachRow'
    });
    const clickhouseUserData = await clickhouseUserResult.json();
    const clickhouseUserCount = parseInt(clickhouseUserData[0]?.count || 0);
    
    console.log(`  MySQL:      ${mysqlUserCount} records`);
    console.log(`  ClickHouse: ${clickhouseUserCount} records`);
    
    if (mysqlUserCount === clickhouseUserCount) {
      console.log('  ✅ Counts match!\n');
    } else {
      console.log('  ⚠️  Warning: Counts do not match!\n');
    }
    
    // Verify Subscriptions
    console.log('📊 Verifying Subscriptions table:');
    const mysqlSubCount = await SubscriptionModel.count();
    const clickhouseSubResult = await clickhouse.query({
      query: `SELECT COUNT(*) as count FROM ${DATABASE_NAME}.subscriptions`,
      format: 'JSONEachRow'
    });
    const clickhouseSubData = await clickhouseSubResult.json();
    const clickhouseSubCount = parseInt(clickhouseSubData[0]?.count || 0);
    
    console.log(`  MySQL:      ${mysqlSubCount} records`);
    console.log(`  ClickHouse: ${clickhouseSubCount} records`);
    
    if (mysqlSubCount === clickhouseSubCount) {
      console.log('  ✅ Counts match!\n');
    } else {
      console.log('  ⚠️  Warning: Counts do not match!\n');
    }
    
    // Verify Activities
    console.log('📊 Verifying Activities table:');
    const mysqlActCount = await ActivityModel.count();
    const clickhouseActResult = await clickhouse.query({
      query: `SELECT COUNT(*) as count FROM ${DATABASE_NAME}.activities`,
      format: 'JSONEachRow'
    });
    const clickhouseActData = await clickhouseActResult.json();
    const clickhouseActCount = parseInt(clickhouseActData[0]?.count || 0);
    
    console.log(`  MySQL:      ${mysqlActCount} records`);
    console.log(`  ClickHouse: ${clickhouseActCount} records`);
    
    if (mysqlActCount === clickhouseActCount) {
      console.log('  ✅ Counts match!\n');
    } else {
      console.log('  ⚠️  Warning: Counts do not match!\n');
    }
    
    // Sample data verification
    console.log('📋 Sample Data Verification:\n');
    
    // Check a random user
    if (mysqlUserCount > 0) {
      const randomUser = await UserModel.findOne({ 
        order: sequelize.random(),
        raw: true 
      });
      
      if (randomUser) {
        console.log('  Checking user sample:');
        console.log(`    User ID: ${randomUser.id}`);
        console.log(`    Email: ${randomUser.email}`);
        
        const chUserResult = await clickhouse.query({
          query: `SELECT * FROM ${DATABASE_NAME}.users WHERE id = ${randomUser.id}`,
          format: 'JSONEachRow'
        });
        const chUser = await chUserResult.json();
        
        if (chUser.length > 0) {
          console.log('    ✅ User found in ClickHouse');
          
          // Compare key fields
          if (chUser[0].email === randomUser.email) {
            console.log('    ✅ Email matches');
          } else {
            console.log('    ⚠️  Email mismatch');
          }
          
          if (chUser[0].name === randomUser.name) {
            console.log('    ✅ Name matches');
          } else {
            console.log('    ⚠️  Name mismatch');
          }
        } else {
          console.log('    ❌ User not found in ClickHouse');
        }
      }
    }
    
    console.log('\n');
    
    // Summary
    const totalMysql = mysqlUserCount + mysqlSubCount + mysqlActCount;
    const totalClickhouse = clickhouseUserCount + clickhouseSubCount + clickhouseActCount;
    
    console.log('📈 Migration Summary:');
    console.log(`  Total MySQL records:      ${totalMysql}`);
    console.log(`  Total ClickHouse records: ${totalClickhouse}`);
    
    if (totalMysql === totalClickhouse && 
        mysqlUserCount === clickhouseUserCount && 
        mysqlSubCount === clickhouseSubCount && 
        mysqlActCount === clickhouseActCount) {
      console.log('\n  ✅ Migration verification PASSED! All data migrated successfully.\n');
    } else {
      console.log('\n  ⚠️  Migration verification FAILED! Please check the migration logs.\n');
    }
    
    // Close connections
    await sequelize.close();
    await clickhouse.close();
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during verification:', error);
    process.exit(1);
  }
}

// Run verification
verifyMigration();





