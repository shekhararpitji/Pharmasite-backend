const JWT = require("jsonwebtoken");
exports.createToken = (user) => {
  console.log(user, '+++++')
  const payload = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    sessionId:user.sessionId,
    role: user.role
  };
  const token = JWT.sign(payload, process.env.SECRET);
  return token;
};

exports.validateToken = async (token) => {
    try{      
      const payload = JWT.verify(token, process.env.SECRET);
  if(!payload){
    throw new Error('Authorization Failed');
  }
  return payload;
    }catch(error){
        console.error(error.message)
    }
  
};