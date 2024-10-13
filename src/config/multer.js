const multer = require('multer');
const { uploadExcel } = require("../controllers/dataController");

const upload = multer({ dest: 'uploads/' });


module.exports = upload