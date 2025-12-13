# Pharmasite Backend

Backend API for Pharmasite with MySQL and ClickHouse integration for analytics.

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file based on `.env.example`
4. Start the server:
   ```
   npm run dev
   ```

## ClickHouse Integration for Analytics

The application now supports ClickHouse for analytics processing. This significantly improves query performance for large datasets.

### Configuration

Add the following to your `.env` file:

```
# ClickHouse Configuration
CLICKHOUSE_URL=http://localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DB=pharma_analytics
CLICKHOUSE_AUTH=false
USE_CLICKHOUSE=true
```

### Data Migration

To migrate data from MySQL to ClickHouse:

```bash
npm run migrate:clickhouse
```

This script:
1. Reads data from MySQL in batches
2. Transforms it for ClickHouse compatibility
3. Writes to CSV files
4. Imports the CSV files into ClickHouse
5. Creates optimized materialized views for common queries

### Direct CSV Import

To import a CSV file directly into ClickHouse:

```bash
npm run import:csv -- -f /path/to/your/file.csv
```

Options:
- `-f, --file <path>`: Path to CSV file (required)
- `-d, --delimiter <char>`: CSV delimiter (default: ',')
- `-h, --has-header`: CSV has header row (default: true)
- `-s, --skip-rows <number>`: Number of rows to skip (default: 0)
- `-b, --batch-size <number>`: Number of rows per batch (default: 50000)

### API Endpoints

The following endpoints use ClickHouse for improved analytics performance:

- `GET /api/data/analytics/metrics`: Get metrics data from ClickHouse
- `POST /api/data/analytics/data`: Get data records from ClickHouse with pagination
- `GET /api/clickhouse-metrics/suggestion`: Get auto-suggestions from ClickHouse data

For detailed API documentation, see [CLICKHOUSE_SUGGESTIONS_API.md](CLICKHOUSE_SUGGESTIONS_API.md).

## Performance Optimization

The ClickHouse integration provides:

1. Significantly faster query execution for large datasets
2. Efficient aggregation operations for metrics
3. Reduced load on the primary MySQL database
4. Materialized views for common analytics queries
5. Partitioning by date for improved query performance
6. Parallel query processing

## Troubleshooting

If you encounter issues with the ClickHouse connection:

1. Verify ClickHouse is running: `curl http://localhost:8123/ping`
2. Check connection parameters in `.env`
3. Ensure the database has been created: `clickhouse-client --query="CREATE DATABASE IF NOT EXISTS pharma_analytics"`
4. Check logs for specific error messages