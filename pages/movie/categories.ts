export const MOVIE_CATEGORIES = [
    {
        name: 'Popular',
        filterParams: {
            media_type: 'movie',
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
    {
        name: 'Post Apocalyptic',
        filterParams: {
            media_type: 'movie',
            with_keywords: [4458, 12332, 186565, 230861, 243810, 272793, 285366, 298669, 322889],
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
    {
        name: 'Action - Comedy',
        filterParams: {
            media_type: 'movie',
            with_genres : [28, 35],
            without_genres : [16],
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
    {
        name: 'Superhero',
        filterParams: {
            media_type: 'movie',
            with_keywords : [
                9715,
                155030,
                191219,
                157677,
                180734,
                209971,
                213104,
                215540,
                270538,
                272493,
                322556,
                180547,
                324477,
                326762,
                849,
                312528
            ],
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
    {
        name: 'Zombie',
        filterParams: {
            media_type: 'movie',
            with_keywords : [9925, 12377, 186565, 301112, 302033, 303750, 304449, 310175, 312469, 313999, 324551, 325469, 325470],
            without_genres : [16, 10751],
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
    {
        name: 'Horror - Comedy',
        filterParams: {
            media_type: 'movie',
            with_genres : [27, 35],
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
    {
        name: 'Arnolds Hits',
        filterParams: {
            media_type: 'movie',
            with_cast: [1100],
            'vote_count.gte': 100,
            'vote_average.gte': 5
        }
    },
];
