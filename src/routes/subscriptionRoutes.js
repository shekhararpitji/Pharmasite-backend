const express = require("express");
const { isLogedIn, isAdmin, isParent } = require("../middlewares/roleMiddleware");
const { 
  getAllSubscriptions, 
  getSubscription, 
  createSubscription, 
  updateSubscription, 
  deleteSubscription,
  assignSubscription,
  getUserSubscription
} = require('../controllers/subscriptionController');

const router = express.Router();

// Public routes - available to all users
// router.get('/plans', getAllSubscriptions);

// Admin-only routes
router.post('/', isAdmin, createSubscription);
router.put('/:id', isAdmin, updateSubscription);
router.delete('/:id', isAdmin, deleteSubscription);
router.post('/assign', isAdmin, assignSubscription);

// Search routes
router.get('/', isLogedIn, getAllSubscriptions); // Supports query params for clientName, contactPerson, email

// Authenticated user routes
router.get('/:id', isLogedIn, getSubscription);
router.get('/user/:userId?', isLogedIn, getUserSubscription);

module.exports = router; 