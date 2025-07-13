const sequelize = require('./db');

// Import all models for database synchronization
const User = require('../models/user.model');
const ExportModel = require('../models/export.model');
const ImportModel = require('../models/import.model');
const SubscriptionModel = require('../models/subscription.model');
const ActivityModel = require('../models/activity.model');
const BuyerDetailsModel = require('../models/buyer-details.model');
const SupplierDetailsModel = require('../models/supplier-details.model');
const ItemDetailsModel = require('../models/item-details.model');
const ShippingDetailsModel = require('../models/shipping-details.model');

/**
 * Database Model Associations
 * 
 * This function sets up relationships between different models
 * Defines foreign key constraints and navigation properties
 * 
 * Key relationships:
 * - User -> Subscription (One-to-Many)
 * - User -> Activity (One-to-Many)
 * - User -> User (Parent-Child relationship)
 * - User -> User (Creator relationship)
 */
const setupAssociations = () => {
  // User-Subscription relationship
  User.hasMany(SubscriptionModel, { foreignKey: 'userId', as: 'subscriptions' });
  SubscriptionModel.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // User-Activity relationship (for audit trail)
  User.hasMany(ActivityModel, { foreignKey: 'userId', as: 'activities' });
  ActivityModel.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // Self-referential relationships for user hierarchy
  User.hasMany(User, { as: 'children', foreignKey: 'parentId' });
  User.belongsTo(User, { as: 'parent', foreignKey: 'parentId' });

  // User creation tracking
  User.hasMany(User, { as: 'createdUsers', foreignKey: 'createdBy' });
  User.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });

  console.log('Database associations set up successfully');
};

/**
 * Database Synchronization Function
 * 
 * This function handles the complete database setup process:
 * 1. Establishes model associations
 * 2. Synchronizes all models with the database
 * 3. Creates tables if they don't exist
 * 4. Optionally creates default admin user
 * 
 * @param {boolean} force - If true, drops existing tables and recreates them
 *                         WARNING: This will delete all data!
 */
const syncDatabase = async (force = false) => {
  try {
    // Step 1: Setup model associations
    setupAssociations();

    // Step 2: Sync all models with database
    // force: false (default) - Create tables if they don't exist
    // alter: false - Don't modify existing table structure
    await sequelize.sync({ force: false, alter: false });
    console.log('Database synchronized successfully');

    // Step 3: Create default admin user if force is true (usually in development)
    if (force) {
      const bcrypt = require('bcryptjs');
      
      // Check if admin already exists to avoid duplicates
      const existingAdmin = await User.findOne({ where: { email: 'admin@example.com' } });
      
      if (!existingAdmin) {
        const adminUser = await User.create({
          name: 'Admin',
          email: 'admin@example.com',
          password: await bcrypt.hash('admin123', 10), // Hash password for security
          role: 'admin',
          partyName: 'Admin',
          mobileNumber: '1234567890',
          isVerified: true // Admin is pre-verified
        });
        console.log('Default admin user created:', adminUser.email);
      } else {
        console.log('Admin user already exists');
      }
    }
  } catch (error) {
    console.error('Error synchronizing database:', error);
    throw error;
  }
};

module.exports = syncDatabase;