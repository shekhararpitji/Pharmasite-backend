const bcrypt = require("bcryptjs");
const { createToken } = require("../utils/authUtil");
const db = require("../config/db");
const { v4: uuidv4 } = require('uuid');
exports.registerService = async (req) => {
  const { email, password, cPassword, phone, role, active, firstName, lastName} =
    req.body;

    if (password !== cPassword) {
      throw new Error('Password and Confirm password does not match');  
    }
    const existingUserEmail = await db.query(`SELECT email FROM users WHERE email = ? LIMIT 1`, [email]);
    if (existingUserEmail.length > 0 && existingUserEmail[0][0].email === email) {
      throw new Error('Email already registered');
    }
    
    const hashPassword = await bcrypt.hash(password, 10);
    const saveUser = {
      userId : uuidv4(),
      email,
      password: hashPassword,
      phone,
      role,
      active,
      firstName,
      lastName,
      createdDate: new Date(),
      updatedDate: new Date()
    };
    const user = await db.query(`INSERT INTO users SET ? `, saveUser)
    if (!user) {
      throw new Error('Error in saving!!!');
    }
    return saveUser;
};

exports.loginService = async (req, res) => {
  const { email, password } = req.body;

  let [user] = await db.query(`SELECT * FROM users WHERE email = ? `,[email]);
  user = user[0];
  const result = await bcrypt.compare(password, user.password);
  if (!user) {
    return res.status(404).json({ message: "Not found" });
  } else if (!result) {
    return res.status(404).json({ message: "Wrong password" });
  }

  const access_token = createToken(user);
  return { access_token };
};

exports.getUser = async (email) => {
  const [user] = await db.query(`SELECT * FROM users WHERE email = ?`,[email]);
  return user[0];
};

exports.deleteUser = async (id) => {
  let [active] = await db.query(`SELECT * FROM users WHERE userId = ?`[id]);
  if (active.length > 0 && active[0].id === id) {
      active= active[0].active
    }else{
      throw new Error('User not found');
    }
  const [user] = await db.query(`UPDATE users SET active = ? WHERE userId = ?`[!active,id]);
  return user
}