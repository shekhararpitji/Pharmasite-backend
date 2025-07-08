const express = require('express');
const rateLimit = require('express-rate-limit'); // ✅ New import
const cors = require('cors');
const dotenv = require('dotenv');
const syncDatabase = require('./config/syncModels');
const bodyParser = require("body-parser");
const roleRoutes = require("./routes/roleRoutes");
const dataRoutes = require("./routes/dataRoutes");
const metricsRoutes = require("./routes/metricsRoutes");
const clickhouseMetricsRoutes = require("./routes/clickhouseMetricsRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const syncDb = require('./models/sync.db')
const cron = require('./crons/search-auto-suggestion');
const aggregationCron = require('./crons/data-aggregation');
const cookieParser = require('cookie-parser');
const { initClickHouse } = require('./config/clickhouse');
const { initClickHouseExport } = require('./models/clickhouse/export.model');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
// ✅ Rate limiter middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    statusCode: 429,
    message: 'Too many requests from this IP, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter); // ✅ Apply before all routes

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
app.use("/api/clickhouse-metrics", clickhouseMetricsRoutes);
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
    
    // Initialize ClickHouse connection if enabled
    if (process.env.USE_CLICKHOUSE === 'true') {
      try {
        console.log('Initializing ClickHouse connection...');
        const clickhouseReady = await initClickHouse();
        if (clickhouseReady) {
          console.log('ClickHouse connection established');
          // Initialize ClickHouse tables and views
          await initClickHouseExport();
          console.log('ClickHouse tables and views initialized');
        } else {
          console.warn('ClickHouse connection failed, analytics will use MySQL');
        }
      } catch (clickhouseError) {
        console.error('Error initializing ClickHouse:', clickhouseError);
        console.warn('Continuing without ClickHouse, analytics will use MySQL');
      }
    }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();