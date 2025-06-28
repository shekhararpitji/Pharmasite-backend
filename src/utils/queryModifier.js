const dayjs = require('dayjs');


exports.queryModifier = (query) => {
    const searchQuery = {};

    let startDate;
    let endDate;

    if (!query.duration) {
        // Default to last year to current date
        endDate = dayjs().format('YYYY-MM-DD 23:59:59');
        startDate = dayjs().subtract(1, 'year').format('YYYY-MM-DD 00:00:00');
    } else {
        const dateRange = query.duration.split('-')
        startDate = dayjs(dateRange[0], 'DD/MM/YYYY').format('YYYY-MM-DD 00:00:00');
        endDate = dayjs(dateRange[1], 'DD/MM/YYYY').format('YYYY-MM-DD 23:59:59');
    }

    searchQuery.startDate = startDate;
    searchQuery.endDate = endDate;

    let searchType; // Fixed: Added let declaration for searchType
    if (['CAS_Number', 'H_S_Code', '2_Digit_Code'].includes(query.searchType)) {
        searchType = query.searchType
    } else {
        searchType = query.searchType
            ? query.searchType.toLowerCase()
                .split(' ')
                .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
                .join('')
            : 'productName'; // Default if searchType is undefined
    }

    const values = query.searchValue && query.searchValue.includes(',')
        ? query.searchValue.split(',').map(v => v.trim())
        : [query.searchValue];
    
    searchQuery.searchType = searchType;
    searchQuery.chapter = query.chapter;
    searchQuery.searchValue = values;
    searchQuery.informationOf = query.informationOf;
    searchQuery.dataType = query?.dataType ?? 'raw data';
    
    return searchQuery;
};