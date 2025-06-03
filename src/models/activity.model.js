const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const UserModel = require('./user.model');

const ActivityModel = sequelize.define('Activity', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: UserModel,
      key: 'id'
    }
  },
  activityType: {
    type: DataTypes.ENUM('login', 'download', 'search', 'view'),
    allowNull: false
  },
  details: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional details about the activity (e.g., search query, downloaded file)'
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true
  },
  userAgent: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['activityType']
    },
    {
      fields: ['createdAt']
    }
  ]
});

// Relationship with User model
ActivityModel.belongsTo(UserModel, { foreignKey: 'userId' });
UserModel.hasMany(ActivityModel, { foreignKey: 'userId' });

module.exports = ActivityModel; 