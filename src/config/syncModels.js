const sequelize = require('./db');
const User = require('../models/user.model');
const Activity = require('../models/activity.model');
const Subscription = require('../models/subscription.model');

// Flag to prevent multiple association setups
let associationsSetup = false;

// Define model associations
const setupAssociations = () => {
  // Prevent duplicate association setup
  if (associationsSetup) {
    console.log('Associations already set up, skipping...');
    return;
  }

  try {
    // User associations
    User.hasMany(Activity, { foreignKey: 'userId' });
    Activity.belongsTo(User, { foreignKey: 'userId' });

    // Parent-Child relationship
    User.hasMany(User, { as: 'children', foreignKey: 'parentId' });
    User.belongsTo(User, { as: 'parent', foreignKey: 'parentId' });

    // User-Subscription relationship
    User.hasOne(Subscription, { foreignKey: 'userId' });
    Subscription.belongsTo(User, { foreignKey: 'userId' });

    associationsSetup = true;
    console.log('Associations set up successfully');
  } catch (error) {
    console.error('Error setting up associations:', error);
    throw error;
  }
};

// Sync all models with database
const syncDatabase = async (force = false) => {
  try {
    // Setup associations (will only run once)
    // setupAssociations();

    // Sync all models
    await sequelize.sync({ force : false, alter : false });
    console.log('Database synchronized successfully');

    // If force is true, create default admin user
    if (force) {
      const bcrypt = require('bcryptjs');
      
      // Check if admin already exists
      const existingAdmin = await User.findOne({ where: { email: 'admin@example.com' } });
      
      if (!existingAdmin) {
        const adminUser = await User.create({
          name: 'Admin',
          email: 'admin@example.com',
          password: await bcrypt.hash('admin123', 10),
          role: 'admin',
          partyName: 'Admin',
          mobileNumber: '1234567890',
          isVerified: true
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