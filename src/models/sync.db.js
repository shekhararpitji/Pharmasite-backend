const ExportModel = require('../models/export.model')
const ImportModel = require('../models/import.model')

const sequelize = require('../config/db')

const syncDatabase = async () => {
  try {
    await sequelize.sync({ force: false });
    console.log('Database synced successfully');
  } catch (err) {
    console.error('Error syncing database:', err);
  }
}

module.exports = syncDatabase;