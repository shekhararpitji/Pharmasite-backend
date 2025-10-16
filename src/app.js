const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const dotenv = require('dotenv');
// const syncDatabase = require('./config/syncModels');
const bodyParser = require("body-parser");
const roleRoutes = require("./routes/roleRoutes");
const dataRoutes = require("./routes/dataRoutes");
const clickhouseMetricsRoutes = require("./routes/clickhouseMetricsRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
// const syncDb = require('./models/sync.db')
const cron = require('./crons/search-auto-suggestion');
const cookieParser = require('cookie-parser');
const { initClickHouse } = require('./config/clickhouse');
const { initClickHouseExport } = require('./models/clickhouse/export.model');
const { initClickHouseImport } = require('./models/clickhouse/import.model');
const { initClickHouseUser } = require('./models/clickhouse/user.model');
const { initClickHouseActivity } = require('./models/clickhouse/activity.model');
const { initClickHouseSubscription } = require('./models/clickhouse/subscription.model');

// Load environment variables from .env file
dotenv.config();

const app = express();

// CORS configuration - Allow cross-origin requests from frontend
app.use(cors({
  origin: true,
  credentials: true
}));

// Rate limiting to prevent abuse - 100 requests per 15 minutes per IP
// const limiter = rateLimit({
//   windowMs: 1 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   message: 'Too many requests from this IP, please try again later.'
// });
// app.use(limiter);

// Body parsing middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes - All routes are prefixed with /api
app.use('/api/auth', roleRoutes);                    // Authentication & user management
app.use('/api/data', dataRoutes);                    // Data operations & analytics
app.use('/api/clickhouse-metrics', clickhouseMetricsRoutes); // ClickHouse analytics
app.use('/api/subscription', subscriptionRoutes);     // Subscription management
app.use('/api/analytics', analyticsRoutes);          // ClickHouse-based user/subscription/activity analytics

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 8080;

/**
 * Initialize application with database sync and optional ClickHouse setup
 * This is the main startup sequence that ensures all systems are ready
 */
const startServer = async () => {
  try {
    // Step 1: Sync MySQL database (creates tables if they don't exist)
    // await syncDatabase(false);
    
    // Step 2: Initialize ClickHouse connection if enabled in environment
    
      try {
        console.log('Initializing ClickHouse connection...');
        const clickhouseReady = await initClickHouse();
        if (clickhouseReady) {
          console.log('ClickHouse connection established');
          // Initialize ClickHouse tables and materialized views for analytics
          await initClickHouseExport();
          await initClickHouseImport();
          await initClickHouseUser();
          await initClickHouseActivity();
          await initClickHouseSubscription();
          console.log('ClickHouse tables and views initialized');
        } else {
          console.warn('ClickHouse connection failed, analytics will use MySQL');
        }
      } catch (clickhouseError) {
        console.error('Error initializing ClickHouse:', clickhouseError);
        console.warn('Continuing without ClickHouse, analytics will use MySQL');
    }
    

    // Step 3: Start the HTTP server
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();