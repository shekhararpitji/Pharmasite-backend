const express = require("express");

const { isLogedIn, isAdmin } = require("../middlewares/roleMiddleware");

const router = express.Router();

const multer = require('multer');
const { uploadExcel } = require("../controllers/dataController");

const upload = multer({ dest: 'uploads/' });

router.post('/upload',isLogedIn, isAdmin, upload.single('file'), uploadExcel);



module.exports = router;