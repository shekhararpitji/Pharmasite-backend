const express = require("express");
const upload = require('../middlewares/multerMiddleware')
const { isLogedIn, isAdmin } = require("../middlewares/roleMiddleware");
const {uploadExcel} = require('../controllers/dataController')


const router = express.Router();
router.post('/upload',isLogedIn, isAdmin, upload.single('file'), uploadExcel);



module.exports = router;