const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const syncDatabase = require('./config/syncModels');
const bodyParser = require("body-parser");
const roleRoutes = require("./routes/roleRoutes");
const dataRoutes = require("./routes/dataRoutes");
const metricsRoutes = require("./routes/metricsRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const syncDb = require('./models/sync.db')
const cron = require('./crons/search-auto-suggestion');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Middleware
app.use(cors({
    origin:  'http://65.1.119.54:3000', // Exact frontend origin
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed methods
    allowedHeaders: ['Content-Type', 'Authorization', 'Session-ID'], // Allowed headers
  }));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/roles', roleRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/subscriptions", subscriptionRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    statusCode: 500,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 8080;

// Sync database and start server
const startServer = async () => {
  try {
    // Sync database (set force: true to reset database)
    await syncDatabase(false);

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();