const multer = require('multer');
const path = require('path')
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); 
  },
  filename: (req, file, cb) => {
    const uniquePrefix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null,`${uniquePrefix}-${file.originalname}`);
  }
});

module.exports = multer({ storage: storage });
