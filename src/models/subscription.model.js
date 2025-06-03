const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
// Re-enable the User model import
const UserModel = require('./user.model');

const SubscriptionModel = sequelize.define('Subscription', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  clientName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  contactPerson: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  subscriptionType: {
    type: DataTypes.ENUM('raw', 'cleaned'),
    allowNull: false,
    defaultValue: 'raw'
  },
  dataType: {
    type: DataTypes.STRING,
    allowNull: true
  },
  chapterNumber: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  productCount: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  productlimit: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 10
  },
  subscribedDurationDownload: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Duration in months for download access'
  },
  subscribedDurationView: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Duration in months for view access'
  },
  accessValidity: {
    type: DataTypes.DATE,
    allowNull: true
  },
  subscriptionExpiryNotification: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Notification settings for subscription expiry'
  },
  accessExpiryNotification: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Notification settings for access expiry'
  },
  subscriptionCost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('active', 'expired', 'cancelled', 'pending'),
    allowNull: false,
    defaultValue: 'pending'
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  paymentMethod: {
    type: DataTypes.STRING,
    allowNull: true
  },
  paymentId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  autoRenew: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  timestamps: true
});

// Re-enable the association
// Note: We're adding these associations here after the models are defined
// to avoid circular dependency issues
SubscriptionModel.hasMany(UserModel, { foreignKey: 'subscriptionId' });
UserModel.belongsTo(SubscriptionModel, { foreignKey: 'subscriptionId' });

module.exports = SubscriptionModel; 