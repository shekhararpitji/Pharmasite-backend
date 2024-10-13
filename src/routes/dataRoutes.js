const express = require("express");
const upload = require('../config/multer')
const { isLogedIn, isAdmin } = require("../middlewares/roleMiddleware");


const router = express.Router();
router.post('/upload',isLogedIn, isAdmin, upload.single('file'), uploadExcel);



module.exports = router;