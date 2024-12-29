const express = require("express");
const {
  registerCtrl,
  loginCtrl,
  get1Ctrl,
  getAllCtrl,
  deleteCtrl,
} = require("../controllers/roleController");
const {
  validateRegistration,
  validateLogin,
} = require("../validators/roleValidator");
const { isLogedIn, isAdmin } = require("../middlewares/roleMiddleware");

const router = express.Router();

router.post("/register", validateRegistration, isLogedIn, isAdmin, registerCtrl);

router.post("/login", validateLogin, loginCtrl);

router.get("/get-all", isLogedIn, isAdmin, getAllCtrl);

router.get("/get/:id", isLogedIn, isAdmin,get1Ctrl);

router.delete("/delete/:id", isLogedIn, isAdmin, deleteCtrl);

module.exports = router;