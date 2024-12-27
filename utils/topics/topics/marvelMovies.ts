const formatter = new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' });

export const marvelMovies: Record<string, any> = {
    name: 'Marvel Movies',
    key: 'marvel-movies',
    filterParams: {
        media_type: 'movie',
        with_keywords: [
            180547,
            324477,
            335767,
            336128,
            336129
        ],
        'with_runtime.gte': 60,
    },
    scrollVariations: [
        {
            name: 'Marvel - Action Movies',
            key: 'marvel-action-movies',
            filterParams: {
                with_genres: '28',
            },
        },
        {
            name: 'Marvel - Comedy Movies',
            key: 'marvel-comedy-movies',
            filterParams: {
                with_genres: '35',
            },
        },
        {
            name: 'Marvel - Horror Movies',
            key: 'marvel-horror-movies',
            filterParams: {
                with_genres: '27',
            },
        },
        {
            name: 'Upcoming Marvel Movies',
            key: 'upcoming-marvel-movies',
            filterParams: {
                "primary_release_date.gte": formatter.format(new Date()).split('/').reverse().join('-'),
                with_original_language: 'en',
                'vote_count.gte': 0,
                'with_runtime.gte': 0,
            },
        },
    ]
}
