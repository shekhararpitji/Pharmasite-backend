const Joi = require("joi");

const validateRegistration = (req, res, next) => {
  const schema = Joi.object({
    firstName: Joi.string().required(),
    lastName: Joi.string(),
    email: Joi.string().email().required(),
    password: Joi.string()
      .pattern(/^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{}|\\:;'<>,.?\/]{5,30}$/)
      .required(),
    phone: Joi.string().pattern(/^\d{10}$/),
    confirmPassword: Joi.string()
      .pattern(/^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{}|\\:;'<>,.?\/]{5,30}$/)
      .required(),
    role: Joi.string().optional(),
    active: Joi.boolean().optional(),
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    console.error(error);
    return res.status(400).json({ error: error.details[0].message });
  }
    return next();
};

const validateLogin = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string()
      .pattern(/^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{}|\\:;'<>,.?\/]{5,30}$/)
      .required(),
  });

  const { error, value } = schema.validate(req.body);

  if (error) 
    return res.status(400).json({ error: error.details[0].message });
  
 
  return next();
  
  
};

const validateSMS = (req, res, next) => {
  const schema = Joi.object({
    mobile: Joi.string().required(),
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }else{
    req.body = value;
  return next();
  }

  
};

const validateResetPassword = (req, res, next) => {
  const schema = Joi.object({
    mobilenumber: Joi.string().required(),
    password: Joi.string()
      .pattern(/^[a-zA-Z0-9]{5,30}$/)
      .required(),
    sms: Joi.string().required(),
    CPassword: Joi.string()
      .pattern(/^[a-zA-Z0-9]{5,30}$/)
      .required(),
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }else{
    req.body = value;
    return next();
  }

 
};

module.exports = {
  validateRegistration,
  validateLogin,
  validateSMS,
  validateResetPassword,
};