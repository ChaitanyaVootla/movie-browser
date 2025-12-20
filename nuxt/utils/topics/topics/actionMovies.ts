const formatter = new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' });

export const actionMovies: Record<string, any> = {
    name: 'Action Movies',
    key: 'action-movies',
    filterParams: {
        media_type: 'movie',
        with_genres: '28',
        'vote_count.gte': 100,
    },
    scrollVariations: [
        {
            name: 'Action - Comedy Movies',
            key: 'action-comedy-movies',
            filterParams: {
                with_genres: '35,28',
            },
        },
        {
            name: 'Action - Sci-fi Movies',
            key: 'comedy-scifi-movies',
            filterParams: {
                with_genres: '28,878',
            },
        },
        {
            name: 'Action - Horror Movies',
            key: 'action-horror-movies',
            filterParams: {
                with_genres: '28,27',
            },
        },
        {
            name: 'Upcoming Action Movies',
            key: 'upcoming-action-movies',
            filterParams: {
                "primary_release_date.gte": formatter.format(new Date()).split('/').reverse().join('-'),
                with_original_language: 'en',
                'vote_count.gte': 0,
            },
        },
    ]
}
