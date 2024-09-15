const JWT = require("jsonwebtoken");
exports.createToken = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    role: user.role
  };
  const token = JWT.sign(payload, process.env.SECRET);
  return token;
};

exports.validateToken = async (req, res) => {
    try{
        const token = req.get("authorization")?.split(" ")[1];
  const payload = JWT.verify(token, process.env.SECRET);
  if(!payload){
    throw new Error('Authorization Failed');
  }
  return payload;
    }catch(error){
        console.error(error.message)
    }
  
};