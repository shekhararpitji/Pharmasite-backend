const dayjs = require('dayjs');

/**
 * Query Modifier Utility
 * 
 * This utility transforms raw query parameters from the frontend into 
 * standardized format for database queries. It handles:
 * 
 * - Date range processing and validation
 * - Search type normalization
 * - Search value parsing (comma-separated values)
 * - Default value assignment
 * 
 * Used by all data retrieval endpoints to ensure consistent query processing
 * 
 * @param {Object} query - Raw query parameters from request
 * @returns {Object} Standardized query object
 */
exports.queryModifier = (query) => {
    const searchQuery = {};

    let startDate;
    let endDate;

    // Process date range - defaults to last year if not provided
    if (!query.duration) {
        // Default to last year to current date for better performance
        endDate = dayjs().format('YYYY-MM-DD 23:59:59');
        startDate = dayjs().subtract(1, 'year').format('YYYY-MM-DD 00:00:00');
    } else {
        // Parse date range from frontend format (DD/MM/YYYY-DD/MM/YYYY)
        const dateRange = query.duration.split('-')
        startDate = dayjs(dateRange[0], 'DD/MM/YYYY').format('YYYY-MM-DD 00:00:00');
        endDate = dayjs(dateRange[1], 'DD/MM/YYYY').format('YYYY-MM-DD 23:59:59');
    }

    searchQuery.startDate = startDate;
    searchQuery.endDate = endDate;

    // Process search type - normalize field names for database compatibility
    let searchType;
    
    // Special handling for specific database field names
    if (['CAS_Number', 'H_S_Code', '2_Digit_Code'].includes(query.searchType)) {
        searchType = query.searchType
    } else {
        // Convert frontend field names to camelCase for database queries
        // e.g., "product name" -> "productName", "buyer country" -> "buyerCountry"
        searchType = query.searchType
            ? query.searchType.toLowerCase()
                .split(' ')
                .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
                .join('')
            : 'productName'; // Default search field if not provided
    }

    // Process search values - handle comma-separated values
    const values = query.searchValue && query.searchValue.includes(',')
        ? query.searchValue.split(',').map(v => v.trim()) // Split and trim whitespace
        : [query.searchValue]; // Single value as array for consistent processing
    
    // Build final search query object
    searchQuery.searchType = searchType;
    searchQuery.chapter = query.chapter;
    searchQuery.searchValue = values;
    searchQuery.informationOf = query.informationOf; // 'import' or 'export'
    searchQuery.dataType = query?.dataType ?? 'raw data'; // Default to raw data
    
    return searchQuery;
};