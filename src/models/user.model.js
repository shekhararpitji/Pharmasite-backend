const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const UserModel = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      unique: true
    },
    partyName: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Company/Organization name'
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    mobileNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      validate: {
        is: /^[0-9]{10}$/
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('admin', 'parent', 'kid'),
      allowNull: false
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      },
      comment: 'ID of the admin who created this account'
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    verificationToken: {
      type: DataTypes.STRING,
      allowNull: true
    },
    verificationTokenExpiry: {
      type: DataTypes.DATE,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true
    },
    sessionId: {
      type: DataTypes.STRING,
      allowNull: true
    }
},
{
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['email']
      },
      {
        unique: true,
        fields: ['mobileNumber']
      },
      {
        fields: ['partyName']
      },
      {
        fields: ['parentId']
      }
    ]
}
);

// Self-referential relationship for parent-child relationship
UserModel.hasMany(UserModel, { as: 'children', foreignKey: 'parentId' });
UserModel.belongsTo(UserModel, { as: 'parent', foreignKey: 'parentId' });

// Relationship for created by
UserModel.hasMany(UserModel, { as: 'createdUsers', foreignKey: 'createdBy' });
UserModel.belongsTo(UserModel, { as: 'creator', foreignKey: 'createdBy' });

// Note: The association with SubscriptionModel is handled in subscription.model.js
// This avoids circular dependencies and prevents errors when Subscription table doesn't exist

module.exports = UserModel;
