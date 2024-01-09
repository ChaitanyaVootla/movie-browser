const configuration = {
    images: {
        base_url: 'http://image.tmdb.org/t/p/',
        secure_base_url: 'https://image.tmdb.org/t/p/',
        backdrop_sizes: {
            w300: 'w300',
            w780: 'w780',
            w1280: 'w1280',
            original: 'original',
        },
        logo_sizes: {
            w45: 'w45',
            w92: 'w92',
            w154: 'w154',
            w185: 'w185',
            w300: 'w300',
            w500: 'w500',
            original: 'original',
        },
        poster_sizes: {
            w92: 'w92',
            w154: 'w154',
            w185: 'w185',
            w342: 'w342',
            w500: 'w500',
            w780: 'w780',
            original: 'original',
        },
        profile_sizes: {
            w45: 'w45',
            w185: 'w185',
            h632: 'h632',
            original: 'original',
        },
        still_sizes: {
            w92: 'w92',
            w185: 'w185',
            w300: 'w300',
            original: 'original',
        },
    },
};

const movieGenres = {
    "12": {
        "id": 12,
        "name": "Adventure"
    },
    "14": {
        "id": 14,
        "name": "Fantasy"
    },
    "16": {
        "id": 16,
        "name": "Animation"
    },
    "18": {
        "id": 18,
        "name": "Drama"
    },
    "27": {
        "id": 27,
        "name": "Horror"
    },
    "28": {
        "id": 28,
        "name": "Action"
    },
    "35": {
        "id": 35,
        "name": "Comedy"
    },
    "36": {
        "id": 36,
        "name": "History"
    },
    "37": {
        "id": 37,
        "name": "Western"
    },
    "53": {
        "id": 53,
        "name": "Thriller"
    },
    "80": {
        "id": 80,
        "name": "Crime"
    },
    "99": {
        "id": 99,
        "name": "Documentary"
    },
    "878": {
        "id": 878,
        "name": "Science Fiction"
    },
    "9648": {
        "id": 9648,
        "name": "Mystery"
    },
    "10402": {
        "id": 10402,
        "name": "Music"
    },
    "10749": {
        "id": 10749,
        "name": "Romance"
    },
    "10751": {
        "id": 10751,
        "name": "Family"
    },
    "10752": {
        "id": 10752,
        "name": "War"
    },
    "10770": {
        "id": 10770,
        "name": "TV Movie"
    }
} as Record<string, any>;

const seriesGenres = {
    "16": {
        "id": 16,
        "name": "Animation"
    },
    "18": {
        "id": 18,
        "name": "Drama"
    },
    "35": {
        "id": 35,
        "name": "Comedy"
    },
    "37": {
        "id": 37,
        "name": "Western"
    },
    "80": {
        "id": 80,
        "name": "Crime"
    },
    "99": {
        "id": 99,
        "name": "Documentary"
    },
    "9648": {
        "id": 9648,
        "name": "Mystery"
    },
    "10751": {
        "id": 10751,
        "name": "Family"
    },
    "10759": {
        "id": 10759,
        "name": "Action & Adventure"
    },
    "10762": {
        "id": 10762,
        "name": "Kids"
    },
    "10763": {
        "id": 10763,
        "name": "News"
    },
    "10764": {
        "id": 10764,
        "name": "Reality"
    },
    "10765": {
        "id": 10765,
        "name": "Sci-Fi & Fantasy"
    },
    "10766": {
        "id": 10766,
        "name": "Soap"
    },
    "10767": {
        "id": 10767,
        "name": "Talk"
    },
    "10768": {
        "id": 10768,
        "name": "War & Politics"
    }
} as Record<string, any>;

export { configuration, movieGenres, seriesGenres };

export const baseDiscoverQuery = {
    media_type: 'movie',
    sort_by: 'popularity.desc',
    with_genres: [],
    with_keywords: [],
    with_original_language: null,
    without_genres: [],
    with_watch_providers: [],
    with_watch_monetization_types: '',
    // TODO udpate with user region
    watch_region: 'IN',
    "with_runtime.gte": '',
    "with_runtime.lte": '',
    with_release_type: '',
    "vote_average.gte": null,
    "vote_count.gte": null,
};
