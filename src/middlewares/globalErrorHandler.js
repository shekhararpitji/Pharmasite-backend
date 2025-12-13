
const globalErrorHandler = (err, req, res, next) => {

  console.error(`[Error] ${err.stack}`);
  let message = err.message || 'An unexpected error occurred';
  

  if (err.name === 'SequelizeValidationError') {
    message = 'Database validation error occurred';
  } else if (err.name === 'UnauthorizedError') {
    message = 'You are not authorized to access this resource';
  }

  
  const errorResponse = {
    message: message,
    path: req.originalUrl,
    method: req.method, 
    timestamp: new Date().toISOString(), 
  };

  
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  const statusCode = err.status || 500;
  res.status(statusCode).json(errorResponse);
};

module.exports = globalErrorHandler;