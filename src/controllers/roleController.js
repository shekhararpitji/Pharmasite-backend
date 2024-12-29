
const db = require("../config/db");
const {
  loginService,
  registerService,
  get1Service,
  getUser,
  deleteUser,
} = require("../services/roleServies");
const { validateToken } = require("../utils/authUtil");

exports.registerCtrl = async (req, res) => {
 try{
   const user= await registerService(req);
    
   if (user) {
      const role = user.role;
    return res.status(201).json({ message: `${role} Registered successfully ..`, });
  }}catch(error){
    return res.status(500).json({ error: error.message });
}  
};

exports.loginCtrl = async (req, res) => {
  try {
    const { access_token, sessionId } = await loginService(req);
    return res.status(200).json({ token: access_token, sessionId });
  } catch (error) {
    if (error.message === "User not found") {
      return res.status(404).json({ message: "User not found" });
    }
    if (error.message === "Incorrect password") {
      return res.status(401).json({ message: "Incorrect password" });
    }
    return res.status(500).json({ message: "An internal server error occurred" });
  }
};


exports.getAllCtrl = async (req, res) => {
  try {
    let [user] = await db.query(`SELECT * FROM users`);
    if (!user[0]) {
      return res.status(400).json({ message: "Not found" });
    }
    res.status(200).json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
}
};

exports.get1Ctrl = async (req, res) => {
  try {
    let email=req.params.email
    const user = await getUser(email);
    if (!user) {
      return res.status(400).send({ message: "User not found" });
    }
    res.status(200).json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
}
};

exports.deleteCtrl = async (req, res) => {
  try {
    const id =req.params.id;
   let user = await deleteUser(id)
    res.status(200).json({ user });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
};