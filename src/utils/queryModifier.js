const dayjs = require('dayjs');


exports.queryModifier = (query) => {
    const searchQuery = {};

    let startDate;
    let endDate;

    if (!query.duration) {
        startDate = dayjs().format('YYYY-MM-DD 00:00:00');
        endDate = dayjs().subtract(1, 'year').format('YYYY-MM-DD 23:59:59');
    } else {
        const dateRange = query.duration.split('-')
        startDate = dayjs(dateRange[0], 'DD/MM/YYYY').format('YYYY-MM-DD 00:00:00');
        endDate = dayjs(dateRange[1], 'DD/MM/YYYY').format('YYYY-MM-DD 23:59:59');
    }

    searchQuery.startDate = startDate;
    searchQuery.endDate = endDate;

    if (['CAS_Number', 'H_S_Code', '2_Digit_Code'].includes(query.searchType)) {
        searchType = query.searchType
    } else {
        searchType = query.searchType
            .toLowerCase()
            .split(' ')
            .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
    }

    const values = query.searchValue
    searchQuery.searchType = searchType ?? 'productName';
    searchQuery.chapter = query.chapter;
    searchQuery.searchValue = values;
    searchQuery.informationOf = query.informationOf;
    searchQuery.dataType = query?.dataType ?? 'raw data';
    console.log("searching Query");
    return searchQuery;
};