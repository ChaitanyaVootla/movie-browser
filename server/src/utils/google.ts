const getYear = (movieDate: any) => {
    return new Date(movieDate).getFullYear();
};

const getSearchQuery = (item: any) => {
    return `https://google.com/search?q=${item.name || item.title} ${
        item.first_air_date ? 'tv series' : getYear(item.release_date) + ' movie'
    }`;
}

export { getSearchQuery };
