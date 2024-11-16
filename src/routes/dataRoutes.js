const express = require("express");
const upload = require('../middlewares/multerMiddleware')
const { isLogedIn, isAdmin } = require("../middlewares/roleMiddleware");
const {uploadExcel, getData} = require('../controllers/dataController')


const router = express.Router();
router.post('/upload',upload.single('file'), uploadExcel);
router.get('/records', getData);



module.exports = router;