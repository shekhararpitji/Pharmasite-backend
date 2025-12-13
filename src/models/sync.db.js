// const ExportModel = require('../models/export.model')
// const ImportModel = require('../models/import.model')
// const UserModel = require('../models/user.model')
// // Avoid attempting to auto-create tables from models that may not have permissions
// // const SubscriptionModel = require('../models/subscription.model')

// const sequelize = require('../config/db')

// const syncDatabase = async () => {
//   try {
//     // Changed to alter: false to prevent automatic table creation/modification
//     await sequelize.sync({ force: false, alter: false });
//     console.log('Database connected successfully');
    
//     // Check if tables exist without trying to create them
//     try {
//       await ExportModel.findOne();
//       await ImportModel.findOne();
//       await UserModel.findOne();
//       console.log('Verified existing tables');
//     } catch (tableErr) {
//       console.warn('Some tables may not be accessible:', tableErr.message);
//     }
//   } catch (err) {
//     console.error('Error connecting to database:', err)
//   }
// }

// // Function to sync only the User model changes
// const syncUserModel = async () => {
//   try {
//     // This will update only the User table schema
//     await UserModel.sync({ alter: true });
//     console.log('User model synced successfully');
//   } catch (err) {
//     console.error('Error syncing User model:', err);
//   }
// }

// module.exports = syncDatabase;
// module.exports.syncUserModel = syncUserModel;