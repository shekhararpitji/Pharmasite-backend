const JWT = require("jsonwebtoken");
exports.createToken = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    sessionId:user.sessionId,
    role: user.role
  };
  const token = JWT.sign(payload, "klhdhsd&jigisd6$jhds#uds");
  return token;
};

exports.validateToken = async (token) => {
    try{      
      const payload = JWT.verify(token, "klhdhsd&jigisd6$jhds#uds");
  if(!payload){
    throw new Error('Authorization Failed');
  }
  return payload;
    }catch(error){
        console.error(error.message)
    }
  
};