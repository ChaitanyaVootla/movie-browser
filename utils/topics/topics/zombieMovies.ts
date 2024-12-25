const formatter = new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' });

export const zombieMovies: Record<string, any> = {
    name: 'Zombie Movies',
    key: 'zombie-movies',
    filterParams: {
        media_type: 'movie',
        with_keywords: [
            9925,
            12377,
            186565,
            301112,
            302033,
            303750,
            304449,
            310175,
            312469,
            313999,
            324551,
            325469,
            325470
        ],
        'vote_count.gte': 100,
    },
    scrollVariations: [
        {
            name: 'Zombie - Comedy Movies',
            key: 'zombie-comedy-movies',
            filterParams: {
                with_genres: '35',
            },
        },
        {
            name: 'Zombie - Action Movies',
            key: 'zombie-action-movies',
            filterParams: {
                with_genres: '28',
            },
        },
        {
            name: 'Zombie - Sci-fi Movies',
            key: 'zombie-scifi-movies',
            filterParams: {
                with_genres: '878',
            },
        },
        {
            name: 'Zombie - Horror Movies',
            key: 'zombie-horror-movies',
            filterParams: {
                with_genres: '27',
            },
        },
        {
            name: 'Upcoming Zombie Movies',
            key: 'upcoming-zombie-movies',
            filterParams: {
                "primary_release_date.gte": formatter.format(new Date()).split('/').reverse().join('-'),
                with_original_language: 'en',
                'vote_count.gte': 0,
            },
        },
    ]
}
