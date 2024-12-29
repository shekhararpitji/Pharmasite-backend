const bcrypt = require("bcryptjs");
const { createToken } = require("../utils/authUtil");
const sequelize = require('../config/db');
const UserModel= require('../models/user.model')
const { v4: uuidv4, v4 } = require('uuid');

exports.registerService = async (req) => {
  try {
    const {email, password, confirmPassword, ...rest} = req.body

    if (password !== confirmPassword) {
      throw new Error('Password and Confirm password do not match');
    }

    const user = await UserModel.findOne({
      where:{
         email
      }
    })

    if(user) throw new Error('User already register')

    const hashPassword = await bcrypt.hash(password, 10);


    const newUser = await UserModel.create({
      userId:v4(),
       ...rest,
       email,
       password:hashPassword,
       sessionId:null
    })



    return newUser;

  } catch (error) {
    console.error("Error in registerService:", error.message);
    throw error;
  }
};



exports.loginService = async (req) => {
  const { email, password } = req.body;

  const user = await UserModel.findOne({
    where: { email },
    raw:true
  });

  if (!user) {
    throw new Error("User not found"); 
  }

  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (!isPasswordCorrect) {
    throw new Error("Incorrect password"); 
  }

  const sessionId = v4();
  await UserModel.update(
    { sessionId },
    { where: { email: user.email } }
  );

  const access_token = createToken({ ...user, sessionId });

  return { access_token, sessionId }; 
};



exports.getUser = async (email) => {
  try {
    const user = await UserModel.findOne({
      where:{
         email
      },
      raw:true
    })

    const {password, ...restData} = user;
    return restData;

  } catch (error) {
    console.error("Error in getUser:", error.message);
    throw error;
  }
};

// exports.deleteUser = async (id) => {
//   try {
//     // Check if the user exists
//     let [user] = await db.query(`SELECT * FROM users WHERE userId = ?`, [id]);
    
//     if (user.length === 0) {
//       throw new Error('User not found');
//     }

//     // Toggle the active status of the user
//     const isActive = user[0].active;
//     const [updatedUser] = await db.query(`UPDATE users SET active = ? WHERE userId = ?`, [!isActive, id]);

//     return updatedUser;

//   } catch (error) {
//     console.error("Error in deleteUser:", error.message);
//     throw error;
//   }
// };
