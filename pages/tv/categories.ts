export const TV_CATEGORIES = [
    {
        name: 'Popular',
        filterParams: {
            media_type: 'tv',
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
    {
        name: 'Sci-Fi Action',
        filterParams: {
            media_type: 'tv',
            with_genres: [10759, 10765],
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
    {
        name: 'Post Apocalyptic',
        filterParams: {
            media_type: 'tv',
            with_keywords: [4458],
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
    {
        name: 'Mini Series',
        filterParams: {
            media_type: 'tv',
            with_keywords: [11162],
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
    {
        name: 'Completed series',
        filterParams: {
            media_type: 'tv',
            with_status: 3,
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
    {
        name: 'Popular Anime',
        filterParams: {
            media_type: 'tv',
            with_keywords: [210024],
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
    {
        name: 'Superhero',
        filterParams: {
            media_type: 'tv',
            with_keywords: [9715, 180734, 209971, 213104, 215540, 265979, 270538, 272493, 322556, 197670, 191219, 155030, 157677],
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
    {
        name: 'Marvel',
        filterParams: {
            media_type: 'tv',
            with_keywords: [180547, 324477, 326762],
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
];
