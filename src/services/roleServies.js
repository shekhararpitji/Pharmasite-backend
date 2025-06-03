const bcrypt = require("bcryptjs");
const { createToken } = require("../utils/authUtil");
const sequelize = require('../config/db');
const UserModel = require('../models/user.model');
const { v4: uuidv4 } = require('uuid');

exports.registerService = async (req, role) => {
  try {
    const { email, password, confirmPassword, ...rest } = req.body;

    if (password !== confirmPassword) {
      throw new Error('Password and Confirm password do not match');
    }

    const existingUser = await UserModel.findOne({
      where: { email }
    });

    if (existingUser) {
      throw new Error('User already registered');
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const newUser = await UserModel.create({
      userId: uuidv4(),
      ...rest,
      email,
      password: hashPassword,
      role,
      sessionId: null
    });

    return newUser;
  } catch (error) {
    console.error("Error in registerService:", error.message);
    throw error;
  }
};

exports.createChildUserService = async (req) => {
  try {
    const { email, password, confirmPassword, ...rest } = req.body;
    const parentId = req.user.id;

    if (password !== confirmPassword) {
      throw new Error('Password and Confirm password do not match');
    }

    const existingUser = await UserModel.findOne({
      where: { email }
    });

    if (existingUser) {
      throw new Error('User already registered');
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const newChildUser = await UserModel.create({
      userId: uuidv4(),
      ...rest,
      email,
      password: hashPassword,
      role: 'child',
      parentId,
      sessionId: null
    });

    return newChildUser;
  } catch (error) {
    console.error("Error in createChildUserService:", error.message);
    throw error;
  }
};

exports.getChildUsersService = async (parentId) => {
  try {
    const children = await UserModel.findAll({
      where: { parentId, role: 'child' },
      attributes: { exclude: ['password'] }
    });
    return children;
  } catch (error) {
    console.error("Error in getChildUsersService:", error.message);
    throw error;
  }
};

exports.updateChildUserService = async (parentId, childId, updateData) => {
  try {
    const childUser = await UserModel.findOne({
      where: { id: childId, parentId, role: 'child' }
    });

    if (!childUser) {
      throw new Error('Child user not found or unauthorized');
    }

    const updatedUser = await childUser.update(updateData);
    return updatedUser;
  } catch (error) {
    console.error("Error in updateChildUserService:", error.message);
    throw error;
  }
};

exports.deleteChildUserService = async (parentId, childId) => {
  try {
    const childUser = await UserModel.findOne({
      where: { id: childId, parentId, role: 'child' }
    });

    if (!childUser) {
      throw new Error('Child user not found or unauthorized');
    }

    await childUser.destroy();
    return true;
  } catch (error) {
    console.error("Error in deleteChildUserService:", error.message);
    throw error;
  }
};

exports.loginService = async (req) => {
  const { email, password } = req.body;

  const user = await UserModel.findOne({
    where: { email },
    raw: true
  });

  if (!user) {
    throw new Error("User not found");
  }

  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (!isPasswordCorrect) {
    throw new Error("Incorrect password");
  }

  const sessionId = uuidv4();
  await UserModel.update(
    { sessionId },
    { where: { email: user.email } }
  );

  const access_token = createToken({ ...user, sessionId });

  return { access_token, sessionId };
};

exports.getUser = async (id) => {
  try {
    const user = await UserModel.findByPk(id, {
      attributes: { exclude: ['password'] }
    });
    return user;
  } catch (error) {
    console.error("Error in getUser:", error.message);
    throw error;
  }
};

exports.deleteUser = async (id) => {
  try {
    const user = await UserModel.findByPk(id);
    if (!user) {
      throw new Error('User not found');
    }
    await user.destroy();
    return user;
  } catch (error) {
    console.error("Error in deleteUser:", error.message);
    throw error;
  }
};
