#!/usr/bin/env node
const dotenv = require('dotenv');
const { program } = require('commander');
const { clickhouse, initClickHouse } = require('../config/clickhouse');
const { initClickHouseUser } = require('../models/clickhouse/user.model');
const { initClickHouseSubscription } = require('../models/clickhouse/subscription.model');
const { initClickHouseActivity } = require('../models/clickhouse/activity.model');
const sequelize = require('../config/db');
const UserModel = require('../models/user.model');
const SubscriptionModel = require('../models/subscription.model');
const ActivityModel = require('../models/activity.model');
const { Transform } = require('stream');
const { Readable } = require('stream');

dotenv.config();

// Configuration
const DATABASE_NAME = process.env.CLICKHOUSE_DB || 'pharma_analytics';
const BATCH_SIZE = 10000; // Process 10k records at a time

// Configure command line options
program
  .version('1.0.0')
  .description('Migrate MySQL data to ClickHouse')
  .option('-t, --table <name>', 'Table to migrate (users, subscriptions, activities, or all)', 'all')
  .option('-b, --batch-size <number>', 'Number of rows per batch', BATCH_SIZE)
  .parse(process.argv);

const options = program.opts();

/**
 * Convert data to a readable stream
 */
function dataToStream(data) {
  return new Readable({
    objectMode: true,
    read() {
      if (data.length > 0) {
        this.push(data.shift());
      } else {
        this.push(null);
      }
    }
  });
}

/**
 * Clean and format user data for ClickHouse
 */
function cleanUserData(record) {
  const cleanedRecord = {
    id: record.id,
    userId: record.userId || '',
    partyName: record.partyName || '',
    name: record.name || '',
    email: record.email || '',
    mobileNumber: record.mobileNumber || '',
    password: record.password || '',
    role: record.role || '',
    parentId: record.parentId || null,
    createdBy: record.createdBy || null,
    isVerified: record.isVerified ? 1 : 0,
    verificationToken: record.verificationToken || null,
    verificationTokenExpiry: record.verificationTokenExpiry 
      ? new Date(record.verificationTokenExpiry).toISOString().replace('T', ' ').split('.')[0]
      : null,
    isActive: record.isActive ? 1 : 0,
    lastLogin: record.lastLogin 
      ? new Date(record.lastLogin).toISOString().replace('T', ' ').split('.')[0]
      : null,
    sessionId: record.sessionId || null,
    createdAt: record.createdAt 
      ? new Date(record.createdAt).toISOString().replace('T', ' ').split('.')[0]
      : '1970-01-01 00:00:00',
    updatedAt: record.updatedAt 
      ? new Date(record.updatedAt).toISOString().replace('T', ' ').split('.')[0]
      : '1970-01-01 00:00:00'
  };
  
  return cleanedRecord;
}

/**
 * Clean and format subscription data for ClickHouse
 */
function cleanSubscriptionData(record) {
  const cleanedRecord = {
    id: record.id,
    clientName: record.clientName || '',
    contactPerson: record.contactPerson || '',
    email: record.email || '',
    subscriptionExport: record.subscriptionExport ? 1 : 0,
    subscriptionImport: record.subscriptionImport ? 1 : 0,
    dataTypeRaw: record.dataTypeRaw ? 1 : 0,
    dataTypeClean: record.dataTypeClean ? 1 : 0,
    chapterNumber: record.chapterNumber ? JSON.stringify(record.chapterNumber) : '[]',
    productCount: record.productCount || null,
    productlimit: record.productlimit || null,
    subscribedDurationDownload: record.subscribedDurationDownload || null,
    subscribedDurationView: record.subscribedDurationView || null,
    accessValidity: record.accessValidity 
      ? new Date(record.accessValidity).toISOString().replace('T', ' ').split('.')[0]
      : null,
    subscriptionExpiryNotification: record.subscriptionExpiryNotification || null,
    accessExpiryNotification: record.accessExpiryNotification || null,
    subscriptionCost: record.subscriptionCost || 0,
    status: record.status || 'pending',
    startDate: record.startDate 
      ? new Date(record.startDate).toISOString().replace('T', ' ').split('.')[0]
      : '1970-01-01 00:00:00',
    endDate: record.endDate 
      ? new Date(record.endDate).toISOString().replace('T', ' ').split('.')[0]
      : null,
    paymentMethod: record.paymentMethod || null,
    paymentId: record.paymentId || null,
    autoRenew: record.autoRenew ? 1 : 0,
    createdAt: record.createdAt 
      ? new Date(record.createdAt).toISOString().replace('T', ' ').split('.')[0]
      : '1970-01-01 00:00:00',
    updatedAt: record.updatedAt 
      ? new Date(record.updatedAt).toISOString().replace('T', ' ').split('.')[0]
      : '1970-01-01 00:00:00'
  };
  
  return cleanedRecord;
}

/**
 * Clean and format activity data for ClickHouse
 */
function cleanActivityData(record) {
  const cleanedRecord = {
    id: record.id,
    userId: record.userId,
    activityType: record.activityType || '',
    details: record.details ? JSON.stringify(record.details) : '{}',
    ipAddress: record.ipAddress || null,
    userAgent: record.userAgent || null,
    createdAt: record.createdAt 
      ? new Date(record.createdAt).toISOString().replace('T', ' ').split('.')[0]
      : '1970-01-01 00:00:00',
    updatedAt: record.updatedAt 
      ? new Date(record.updatedAt).toISOString().replace('T', ' ').split('.')[0]
      : '1970-01-01 00:00:00'
  };
  
  return cleanedRecord;
}

/**
 * Migrate Users table
 */
async function migrateUsers(batchSize = BATCH_SIZE) {
  try {
    console.log('\n📊 Starting Users migration...');
    
    // Initialize ClickHouse table
    await initClickHouseUser();
    
    // Get total count
    const totalCount = await UserModel.count();
    console.log(`Found ${totalCount} users to migrate`);
    
    if (totalCount === 0) {
      console.log('No users to migrate');
      return true;
    }
    
    // Process in batches
    let offset = 0;
    let migratedCount = 0;
    
    while (offset < totalCount) {
      console.log(`Processing batch: ${offset} to ${Math.min(offset + batchSize, totalCount)}`);
      
      // Fetch batch from MySQL
      const users = await UserModel.findAll({
        limit: batchSize,
        offset: offset,
        raw: true
      });
      
      if (users.length === 0) break;
      
      // Convert to stream and transform
      const dataStream = dataToStream([...users]);
      
      const transformer = new Transform({
        objectMode: true,
        transform(record, encoding, callback) {
          try {
            const cleanedRecord = cleanUserData(record);
            
            // Convert to TSV line
            const values = Object.values(cleanedRecord).map(value => {
              if (value === null) return '\\N'; // ClickHouse null representation
              if (typeof value === 'string') {
                return value.replace(/[\t\n\r\\]/g, ' ');
              }
              return value;
            });
            
            callback(null, values.join('\t') + '\n');
          } catch (error) {
            console.error('Error transforming user record:', error);
            callback(null); // Skip problematic records
          }
        }
      });
      
      // Create a final non-object mode transform stream
      const finalTransform = new Transform({
        objectMode: false,
        transform(chunk, encoding, callback) {
          callback(null, chunk);
        }
      });
      
      // Import to ClickHouse
      await new Promise((resolve, reject) => {
        dataStream.pipe(transformer).pipe(finalTransform);
        
        clickhouse.insert({
          table: `${DATABASE_NAME}.users`,
          values: finalTransform,
          format: 'TabSeparated',
          compression: false
        })
        .then(() => {
          migratedCount += users.length;
          console.log(`✅ Migrated ${migratedCount}/${totalCount} users`);
          resolve();
        })
        .catch(reject);
      });
      
      offset += batchSize;
    }
    
    console.log(`✅ Users migration completed: ${migratedCount} records migrated`);
    return true;
  } catch (error) {
    console.error('❌ Error migrating users:', error);
    return false;
  }
}

/**
 * Migrate Subscriptions table
 */
async function migrateSubscriptions(batchSize = BATCH_SIZE) {
  try {
    console.log('\n📊 Starting Subscriptions migration...');
    
    // Initialize ClickHouse table
    await initClickHouseSubscription();
    
    // Get total count
    const totalCount = await SubscriptionModel.count();
    console.log(`Found ${totalCount} subscriptions to migrate`);
    
    if (totalCount === 0) {
      console.log('No subscriptions to migrate');
      return true;
    }
    
    // Process in batches
    let offset = 0;
    let migratedCount = 0;
    
    while (offset < totalCount) {
      console.log(`Processing batch: ${offset} to ${Math.min(offset + batchSize, totalCount)}`);
      
      // Fetch batch from MySQL
      const subscriptions = await SubscriptionModel.findAll({
        limit: batchSize,
        offset: offset,
        raw: true
      });
      
      if (subscriptions.length === 0) break;
      
      // Convert to stream and transform
      const dataStream = dataToStream([...subscriptions]);
      
      const transformer = new Transform({
        objectMode: true,
        transform(record, encoding, callback) {
          try {
            const cleanedRecord = cleanSubscriptionData(record);
            
            // Convert to TSV line
            const values = Object.values(cleanedRecord).map(value => {
              if (value === null) return '\\N';
              if (typeof value === 'string') {
                return value.replace(/[\t\n\r\\]/g, ' ');
              }
              return value;
            });
            
            callback(null, values.join('\t') + '\n');
          } catch (error) {
            console.error('Error transforming subscription record:', error);
            callback(null);
          }
        }
      });
      
      // Create a final non-object mode transform stream
      const finalTransform = new Transform({
        objectMode: false,
        transform(chunk, encoding, callback) {
          callback(null, chunk);
        }
      });
      
      // Import to ClickHouse
      await new Promise((resolve, reject) => {
        dataStream.pipe(transformer).pipe(finalTransform);
        
        clickhouse.insert({
          table: `${DATABASE_NAME}.subscriptions`,
          values: finalTransform,
          format: 'TabSeparated',
          compression: false
        })
        .then(() => {
          migratedCount += subscriptions.length;
          console.log(`✅ Migrated ${migratedCount}/${totalCount} subscriptions`);
          resolve();
        })
        .catch(reject);
      });
      
      offset += batchSize;
    }
    
    console.log(`✅ Subscriptions migration completed: ${migratedCount} records migrated`);
    return true;
  } catch (error) {
    console.error('❌ Error migrating subscriptions:', error);
    return false;
  }
}

/**
 * Migrate Activities table
 */
async function migrateActivities(batchSize = BATCH_SIZE) {
  try {
    console.log('\n📊 Starting Activities migration...');
    
    // Initialize ClickHouse table
    await initClickHouseActivity();
    
    // Get total count
    const totalCount = await ActivityModel.count();
    console.log(`Found ${totalCount} activities to migrate`);
    
    if (totalCount === 0) {
      console.log('No activities to migrate');
      return true;
    }
    
    // Process in batches
    let offset = 0;
    let migratedCount = 0;
    
    while (offset < totalCount) {
      console.log(`Processing batch: ${offset} to ${Math.min(offset + batchSize, totalCount)}`);
      
      // Fetch batch from MySQL
      const activities = await ActivityModel.findAll({
        limit: batchSize,
        offset: offset,
        raw: true
      });
      
      if (activities.length === 0) break;
      
      // Convert to stream and transform
      const dataStream = dataToStream([...activities]);
      
      const transformer = new Transform({
        objectMode: true,
        transform(record, encoding, callback) {
          try {
            const cleanedRecord = cleanActivityData(record);
            
            // Convert to TSV line
            const values = Object.values(cleanedRecord).map(value => {
              if (value === null) return '\\N';
              if (typeof value === 'string') {
                return value.replace(/[\t\n\r\\]/g, ' ');
              }
              return value;
            });
            
            callback(null, values.join('\t') + '\n');
          } catch (error) {
            console.error('Error transforming activity record:', error);
            callback(null);
          }
        }
      });
      
      // Create a final non-object mode transform stream
      const finalTransform = new Transform({
        objectMode: false,
        transform(chunk, encoding, callback) {
          callback(null, chunk);
        }
      });
      
      // Import to ClickHouse
      await new Promise((resolve, reject) => {
        dataStream.pipe(transformer).pipe(finalTransform);
        
        clickhouse.insert({
          table: `${DATABASE_NAME}.activities`,
          values: finalTransform,
          format: 'TabSeparated',
          compression: false
        })
        .then(() => {
          migratedCount += activities.length;
          console.log(`✅ Migrated ${migratedCount}/${totalCount} activities`);
          resolve();
        })
        .catch(reject);
      });
      
      offset += batchSize;
    }
    
    console.log(`✅ Activities migration completed: ${migratedCount} records migrated`);
    return true;
  } catch (error) {
    console.error('❌ Error migrating activities:', error);
    return false;
  }
}

/**
 * Main migration function
 */
async function main() {
  try {
    console.log('🚀 Starting MySQL to ClickHouse migration...\n');
    
    // Initialize ClickHouse connection
    const clickhouseReady = await initClickHouse();
    if (!clickhouseReady) {
      console.error('Failed to initialize ClickHouse connection');
      process.exit(1);
    }
    
    // Connect to MySQL
    await sequelize.authenticate();
    console.log('✅ Connected to MySQL database\n');
    
    const { table, batchSize } = options;
    
    // Migrate based on the table option
    if (table === 'all' || table === 'users') {
      const success = await migrateUsers(batchSize);
      if (!success) {
        console.error('❌ Users migration failed');
      }
    }
    
    if (table === 'all' || table === 'subscriptions') {
      const success = await migrateSubscriptions(batchSize);
      if (!success) {
        console.error('❌ Subscriptions migration failed');
      }
    }
    
    if (table === 'all' || table === 'activities') {
      const success = await migrateActivities(batchSize);
      if (!success) {
        console.error('❌ Activities migration failed');
      }
    }
    
    console.log('\n🎉 Migration completed successfully!');
    
    // Close connections
    await sequelize.close();
    await clickhouse.close();
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

// Run the script
main();

