const movieParams = {
    SORT_ORDER: {
        popular: 'popularity.desc',
        topRated: 'vote_average.desc',
        latest: 'release_date.desc',
    }
}

const seriesParams = {
    SORT_ORDER: {
        popular: 'popularity.desc',
        topRated: 'vote_average.desc',
        latest: 'release_date.desc',
    }
}

export { movieParams, seriesParams };