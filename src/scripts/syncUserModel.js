// Script to sync only the User model with the database
const { syncUserModel } = require('../models/sync.db');

console.log('Starting User model sync...');

syncUserModel()
  .then(() => {
    console.log('User model sync completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error syncing User model:', error);
    process.exit(1);
  }); 