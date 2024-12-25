const formatter = new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' });

export const comedyMovies: Record<string, any> = {
    name: 'Comedy Movies',
    key: 'comedy-movies',
    filterParams: {
        media_type: 'movie',
        with_genres: '35',
        'vote_count.gte': 100,
    },
    scrollVariations: [
        {
            name: 'Comedy - Action Movies',
            key: 'comedy-action-movies',
            filterParams: {
                with_genres: '35,28',
            },
        },
        {
            name: 'Comedy - Horror Movies',
            key: 'comedy-horror-movies',
            filterParams: {
                with_genres: '35,27',
            },
        },
        {
            name: 'Comedy - Sci-fi Movies',
            key: 'comedy-scifi-movies',
            filterParams: {
                with_genres: '35,878',
            },
        },
        {
            name: 'Upcoming Comedy Movies',
            key: 'upcoming-comedy-movies',
            filterParams: {
                "primary_release_date.gte": formatter.format(new Date()).split('/').reverse().join('-'),
                with_original_language: 'en',
                'vote_count.gte': 0,
            },
        },
    ]
}
