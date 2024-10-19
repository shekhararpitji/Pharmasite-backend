const bcrypt = require("bcryptjs");
const { createToken } = require("../utils/authUtil");
const db = require("../config/db");
const { v4: uuidv4 } = require('uuid');

// Register a new user
exports.registerService = async (req) => {
  try {
    const { email, password, cPassword, phone, role, active, firstName, lastName } = req.body;

    // Check if password and confirm password match
    if (password !== cPassword) {
      throw new Error('Password and Confirm password do not match');
    }

    // Check if the email already exists in the database
    const [existingUserEmail] = await db.query(`SELECT email FROM users WHERE email = ? LIMIT 1`, [email]);
    if (existingUserEmail.length > 0 && existingUserEmail[0].email === email) {
      throw new Error('Email already registered');
    }

    // Hash the user's password for security
    const hashPassword = await bcrypt.hash(password, 10);

    // Prepare user data to be inserted into the database
    const saveUser = {
      userId: uuidv4(),
      email,
      password: hashPassword,
      phone,
      role,
      active,
      firstName,
      lastName,
      createdDate: new Date(),
      updatedDate: new Date(),
    };

    // Insert user into the database
    const [user] = await db.query(`INSERT INTO users SET ?`, saveUser);
    if (!user) {
      throw new Error('Error in saving the user!');
    }

    // Return the newly created user data
    return saveUser;

  } catch (error) {
    console.error("Error in registerService:", error.message);
    throw error;
  }
};

// User login service
exports.loginService = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if the user exists by email
    let [user] = await db.query(`SELECT * FROM users WHERE email = ?`, [email]);

    if (!user.length) {
      return res.status(404).json({ message: "User not found" });
    }

    user = user[0];

    // Compare provided password with stored hash
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    // Create a JWT token for the authenticated user
    const access_token = createToken(user);
    return { access_token };

  } catch (error) {
    console.error("Error in loginService:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Get user by email
exports.getUser = async (email) => {
  try {
    const [user] = await db.query(`SELECT * FROM users WHERE email = ?`, [email]);
    if (user.length === 0) {
      throw new Error('User not found');
    }
    return user[0];
  } catch (error) {
    console.error("Error in getUser:", error.message);
    throw error;
  }
};

// Delete or deactivate a user by ID
exports.deleteUser = async (id) => {
  try {
    // Check if the user exists
    let [user] = await db.query(`SELECT * FROM users WHERE userId = ?`, [id]);
    
    if (user.length === 0) {
      throw new Error('User not found');
    }

    // Toggle the active status of the user
    const isActive = user[0].active;
    const [updatedUser] = await db.query(`UPDATE users SET active = ? WHERE userId = ?`, [!isActive, id]);

    return updatedUser;

  } catch (error) {
    console.error("Error in deleteUser:", error.message);
    throw error;
  }
};
