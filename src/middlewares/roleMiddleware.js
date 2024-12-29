const { getUser } = require("../services/roleServies");
const { validateToken } = require("../utils/authUtil");

exports.authMiddleware = async (req, res, next) => {
  try {
    const decodedToken = validateToken(req);
    next();
  } catch (error) {
    console.error(error);
    return res.status(401).json(error);
  }
};

exports.isLogedIn = async (req, res, next) => {
  const sessionId = req.query?.session ;
  const token = req.get("authorization")?.split(" ")[1];
  const jsonPayload = await validateToken(token);
  
  if (!jsonPayload)
      return res.status(403).send({ message: "token is invalid" });

  if(sessionId !==jsonPayload.sessionId)
    return res.status(403).send({ message: "Session Expired" });

  req.body.data = jsonPayload;
  next();
};

exports.isAdmin = async (req, res, next) => {
  const payload = req.body.data;
  const userData = await getUser(payload.email);

  if (userData && userData.role === "admin") return next();

  return res.status(401).send({ message: "you are not admin" });
};

exports.isOperator = async (req, res, next) => {
  const payload = req.body.data;
  const userData = await getUser(payload.email);
  if (userData && userData.role === "operator") {
    return next();
  }

  return res.status(401).send({ message: "you are not operator or not login" });
};

exports.isUser = async (req, res, next) => {
  const payload = req.body.data;
  const userData = await getUser(payload.email);
  if (userData && userData.role === "user") {
    return next();
  }

  return res.status(401).send({ message: "you are not user or not login" });
};