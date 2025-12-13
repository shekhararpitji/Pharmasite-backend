const { body, validationResult } = require('express-validator');

// Common validation rules
const commonValidationRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters long'),
  
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format'),
  
  body('mobileNumber')
    .trim()
    .notEmpty()
    .withMessage('Mobile number is required')
    .matches(/^[0-9]{10}$/)
    .withMessage('Mobile number must be 10 digits'),
  
  body('password')
    .trim()
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

// Parent/Admin registration validation
const validateRegistration = [
  ...commonValidationRules,
  body('partyName')
    .trim()
    .notEmpty()
    .withMessage('Party name is required')
    .isLength({ min: 2 })
    .withMessage('Party name must be at least 2 characters long'),
  
  body('role')
    .trim()
    .notEmpty()
    .withMessage('Role is required')
    .isIn(['parent', 'kid'])
    .withMessage('Invalid role. Must be either parent or kid'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        statusCode: 400,
        errors: errors.array()
      });
    }
    next();
  }
];

// Child user registration validation
const validateChildUserRegistration = [
  ...commonValidationRules,
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        statusCode: 400,
        errors: errors.array()
      });
    }
    next();
  }
];

// Login validation
const validateLogin = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format'),
  
  body('password')
    .trim()
    .notEmpty()
    .withMessage('Password is required'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        statusCode: 400,
        errors: errors.array()
      });
    }
    next();
  }
];

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