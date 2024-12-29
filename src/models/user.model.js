const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const UserModel = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    userId:{
      type:DataTypes.STRING,
      allowNull:false
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull:false,
    },
    password: {
      type: DataTypes.STRING,
      allowNull:false,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING,
      defaultValue:'user'
    },
    active: {
        type: DataTypes.BOOLEAN,
        defaultValue:true
    },
    sessionId: {
      type: DataTypes.STRING,
      allowNull:true,
  }
},
{
    timestamps:true
}
)

module.exports = UserModel;
