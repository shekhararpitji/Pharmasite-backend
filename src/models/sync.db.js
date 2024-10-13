const models = require('./index')
const sequelize = require('../config/db')

const syncDatabase = async () => {
  try {
    await sequelize.sync({ force: true });
    console.log('Database synced successfully');
  } catch (err) {
    console.error('Error syncing database:', err);
  }
}

module.exports = syncDatabase;