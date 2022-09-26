const configuration = {
    images: {
        base_url: 'http://image.tmdb.org/t/p/',
        secure_base_url: 'https://image.tmdb.org/t/p/',
        backdrop_sizes: ['w300', 'w780', 'w1280', 'original'],
        logo_sizes: ['w45', 'w92', 'w154', 'w185', 'w300', 'w500', 'original'],
        poster_sizes: ['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original'],
        profile_sizes: ['w45', 'w185', 'h632', 'original'],
        still_sizes: ['w92', 'w185', 'w300', 'original'],
        imageSizes: {
            w300: 'w300',
            w1280: 'w1280',
            original: 'original',
            w500: 'w500',
        }
    },
}

const movieGenres = [
    {
        id: 28,
        name: 'Action',
    },
    {
        id: 12,
        name: 'Adventure',
    },
    {
        id: 16,
        name: 'Animation',
    },
    {
        id: 35,
        name: 'Comedy',
    },
    {
        id: 80,
        name: 'Crime',
    },
    {
        id: 99,
        name: 'Documentary',
    },
    {
        id: 18,
        name: 'Drama',
    },
    {
        id: 10751,
        name: 'Family',
    },
    {
        id: 14,
        name: 'Fantasy',
    },
    {
        id: 36,
        name: 'History',
    },
    {
        id: 27,
        name: 'Horror',
    },
    {
        id: 10402,
        name: 'Music',
    },
    {
        id: 9648,
        name: 'Mystery',
    },
    {
        id: 10749,
        name: 'Romance',
    },
    {
        id: 878,
        name: 'Science Fiction',
    },
    {
        id: 10770,
        name: 'TV Movie',
    },
    {
        id: 53,
        name: 'Thriller',
    },
    {
        id: 10752,
        name: 'War',
    },
    {
        id: 37,
        name: 'Western',
    },
]

const movieGenresById = {
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
} as any

const seriesGenres = [
    {
        id: 10759,
        name: 'Action & Adventure',
    },
    {
        id: 16,
        name: 'Animation',
    },
    {
        id: 35,
        name: 'Comedy',
    },
    {
        id: 80,
        name: 'Crime',
    },
    {
        id: 99,
        name: 'Documentary',
    },
    {
        id: 18,
        name: 'Drama',
    },
    {
        id: 10751,
        name: 'Family',
    },
    {
        id: 10762,
        name: 'Kids',
    },
    {
        id: 9648,
        name: 'Mystery',
    },
    {
        id: 10763,
        name: 'News',
    },
    {
        id: 10764,
        name: 'Reality',
    },
    {
        id: 10765,
        name: 'Sci-Fi & Fantasy',
    },
    {
        id: 10766,
        name: 'Soap',
    },
    {
        id: 10767,
        name: 'Talk',
    },
    {
        id: 10768,
        name: 'War & Politics',
    },
    {
        id: 37,
        name: 'Western',
    },
]
const seriesGenreById = {
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
} as any

export { configuration, movieGenres, seriesGenres, movieGenresById, seriesGenreById }
