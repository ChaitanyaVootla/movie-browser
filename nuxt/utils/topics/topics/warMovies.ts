const formatter = new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' });

export const warMovies: Record<string, any> = {
    name: 'War Movies',
    key: 'war-movies',
    filterParams: {
        media_type: 'movie',
        with_genres: [10752],
        'vote_count.gte': 100,
    },
    scrollVariations: [
        {
            name: 'World War II Movies',
            key: 'world-war-ii-movies',
            filterParams: {
                with_keywords: [1956, 323764, 326488]
            },
        },
        {
            name: 'War - Comedy Movies',
            key: 'war-comedy-movies',
            filterParams: {
                with_genres: [10752, 35],
            },
        },
        {
            name: 'War - Sci-fi Movies',
            key: 'war-scifi-movies',
            filterParams: {
                with_genres: [10752, 878],
            },
        },
        {
            name: 'Upcoming War Movies',
            key: 'upcoming-war-movies',
            filterParams: {
                "primary_release_date.gte": formatter.format(new Date()).split('/').reverse().join('-'),
                with_original_language: 'en',
                'vote_count.gte': 0,
            },
        },
    ]
}
