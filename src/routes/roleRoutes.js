const express = require("express");
const {
  registerCtrl,
  loginCtrl,
  verifyEmailCtrl,
  get1Ctrl,
  getAllCtrl,
  deleteCtrl,
  getUserActivitiesCtrl,
  updateUserAccessCtrl,
  exportUserDataCtrl,
  createChildUserCtrl,
  getChildUsersCtrl,
  updateChildUserCtrl,
  deleteChildUserCtrl,
  getDecodedUser
} = require("../controllers/roleController");
const {
  validateRegistration,
  validateLogin,
  validateChildUserRegistration
} = require("../validators/roleValidator");
const { isLogedIn, isAdmin, isParent } = require("../middlewares/roleMiddleware");

const router = express.Router();

// Public routes
router.post("/login", validateLogin, loginCtrl);
router.get("/verify-email", verifyEmailCtrl);

// Admin routes
router.post("/register", validateRegistration, isLogedIn, isAdmin, registerCtrl);
router.get("/me", getDecodedUser);
router.get("/users", isLogedIn, isAdmin, getAllCtrl);
router.get("/users/:id", isLogedIn, isAdmin, get1Ctrl);
router.delete("/users/:id", isLogedIn, isAdmin, deleteCtrl);
router.put("/users/:id/access", isLogedIn, isAdmin, updateUserAccessCtrl);
router.get("/users/export", isLogedIn, isAdmin, exportUserDataCtrl);


// Parent routes for managing child users
// router.post("/children", isLogedIn, isParent, createChildUserCtrl);
router.get("/children", isLogedIn, isParent, getChildUsersCtrl);
// router.put("/children/:id", isLogedIn, isParent, updateChildUserCtrl);
// router.delete("/children/:id", isLogedIn, isParent, deleteChildUserCtrl);

// Activity tracking routes
router.get("/users/:userId/activities", isLogedIn, getUserActivitiesCtrl);

module.exports = router;