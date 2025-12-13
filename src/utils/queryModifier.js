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

    // Process date range - handle both duration and separate startDate/endDate
    if (query.duration) {
        // Handle duration format: '11/06/2020-05/10/2025'
        try {
            const dateRange = query.duration.split('-');
            if (dateRange.length === 2) {
                // Parse DD/MM/YYYY format to YYYY-MM-DD format
                const startDateStr = dateRange[0].trim();
                const endDateStr = dateRange[1].trim();
                
                // Convert various date formats to YYYY-MM-DD
                const parseDate = (dateStr) => {
                    // Handle DD/MM/YYYY format
                    const parts = dateStr.split('/');
                    if (parts.length === 3) {
                        const day = parts[0].padStart(2, '0');
                        const month = parts[1].padStart(2, '0');
                        const year = parts[2];
                        return `${year}-${month}-${day}`;
                    }
                    
                    // Handle MM/DD/YYYY format (if needed)
                    if (dateStr.includes('/') && parts.length === 3) {
                        const month = parts[0].padStart(2, '0');
                        const day = parts[1].padStart(2, '0');
                        const year = parts[2];
                        return `${year}-${month}-${day}`;
                    }
                    
                    // Handle YYYY-MM-DD format (already correct)
                    if (dateStr.includes('-') && dateStr.length === 10) {
                        return dateStr;
                    }
                    
                    return null;
                };
                
                startDate = parseDate(startDateStr);
                endDate = parseDate(endDateStr);
                
                // Validate parsed dates
                if (!startDate || !endDate) {
                    console.warn('Invalid date format in duration:', query.duration);
                    // Fallback to default dates - return date strings only
                    endDate = dayjs().format('YYYY-MM-DD');
                    startDate = dayjs().subtract(1, 'year').format('YYYY-MM-DD');
                }
            }
        } catch (error) {
            console.warn('Error parsing duration:', query.duration, error);
        }
    } else if (query.startDate && query.endDate) {
        // Handle separate startDate and endDate fields
        startDate = query.startDate;
        endDate = query.endDate;
    } else {
        // Default to last year if no date range provided - return date strings only
        endDate = dayjs().format('YYYY-MM-DD');
        startDate = dayjs().subtract(1, 'year').format('YYYY-MM-DD');
    }

    searchQuery.startDate = startDate;
    searchQuery.endDate = endDate;

    // Process search type - normalize field names for database compatibility
    let searchType;
    
    // Special handling for specific database field names
    if (['CAS_Number', 'H_S_Code', '2_Digit_Code', 'productDescription'].includes(query.searchType)) {
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