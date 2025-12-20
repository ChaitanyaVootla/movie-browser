const formatter = new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' });

export const upcomingMovies: Record<string, any> = {
    name: 'Upcoming Movies',
    key: 'upcoming-movies',
    ignorePromo: true,
    filterParams: {
        media_type: 'movie',
        "primary_release_date.gte": formatter.format(new Date()).split('/').reverse().join('-'),
        with_original_language: 'en',
    },
    transform: (movies: any) => {
        const sortedMovies = movies.sort((a: any, b: any) => {
            return new Date(a.release_date).getTime() - new Date(b.release_date).getTime();
        });
        sortedMovies.forEach((movie: any) => {
            movie.infoText = humanizeDate(movie.release_date);
        });
        return sortedMovies.filter(({popularity, poster_path}: any) => poster_path);
    },
    scrollVariations: [
        {
            name: 'Upcoming Comedy Movies',
            key: 'upcoming-comedy-movies',
            filterParams: {
                with_genres: '35',
            },
        },
        {
            name: 'Upcoming Action Movies',
            key: 'upcoming-action-movies',
            filterParams: {
                with_genres: '28',
            },
        },
        {
            name: 'Upcoming Superhero Movies',
            key: 'upcoming-superhero-movies',
            filterParams: {
                with_keywords: [
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
                ]
            },
        },
        {
            name: 'Upcoming Drama Movies',
            key: 'upcoming-drama-movies',
            filterParams: {
                with_genres: '18',
            },
        },
        {
            name: 'Upcoming Thriller Movies',
            key: 'upcoming-thriller-movies',
            filterParams: {
                with_genres: '53',
            },
        },
        {
            name: 'Upcoming Horror Movies',
            key: 'upcoming-horror-movies',
            filterParams: {
                with_genres: '27',
            },
        },
        {
            name: 'Upcoming Romance Movies',
            key: 'upcoming-romance-movies',
            filterParams: {
                with_genres: '10749',
            },
        },
        {
            name: 'Upcoming Family Movies',
            key: 'upcoming-family-movies',
            filterParams: {
                with_genres: '10751',
            },
        },
        {
            name: 'Upcoming Sci-Fi Movies',
            key: 'upcoming-sci-fi-movies',
            filterParams: {
                with_genres: '878',
            },
        },
        {
            name: 'Upcoming Fantasy Movies',
            key: 'upcoming-fantasy-movies',
            filterParams: {
                with_genres: '14',
            },
        },
        {
            name: 'Upcoming Animation Movies',
            key: 'upcoming-animation-movies',
            filterParams: {
                with_genres: '16',
            },
        },
        {
            name: 'Upcoming Crime Movies',
            key: 'upcoming-crime-movies',
            filterParams: {
                with_genres: '80',
            },
        },
        {
            name: 'Upcoming Mystery Movies',
            key: 'upcoming-mystery-movies',
            filterParams: {
                with_genres: '9648',
            },
        },
        {
            name: 'Upcoming War Movies',
            key: 'upcoming-war-movies',
            filterParams: {
                with_genres: '10752',
            },
        },
        {
            name: 'Upcoming Documentary Movies',
            key: 'upcoming-documentary-movies',
            filterParams: {
                with_genres: '99',
            },
        }
    ]
}
