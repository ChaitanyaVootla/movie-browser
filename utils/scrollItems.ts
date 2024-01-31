const formatter = new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' });

export const watchProviderItems = [
    {
        name: 'Upcoming Movies',
        url: '/upcoming-movies',
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
            return sortedMovies;
        }
    },
    {
        logo: '/images/ott/large/netflix.png',
        name: 'netflix',
        url: 'https://www.netflix.com/browse',
        filterParams: {
            with_watch_providers: [8],
            media_type: 'movie',
            watch_region: "IN"
        }
    },
    {
        logo: '/images/ott/large/prime.svg',
        name: 'prime',
        url: 'https://www.primevideo.com/',
        filterParams: {
            with_watch_providers: [9, 119],
            media_type: 'movie',
            watch_region: 'IN'
        }
    },
    {
        logo: '/images/ott/large/hotstar.svg',
        name: 'hotstar',
        url: 'https://www.hotstar.com/',
        filterParams: {
            with_watch_providers: [377, 122],
            media_type: 'movie',
            watch_region: 'IN'
        }
    },
    {
        logo: '/images/ott/large/apple.svg',
        name: 'apple',
        url: 'https://www.apple.tv/',
        filterParams: {
            with_watch_providers: [2, 350],
            media_type: 'movie',
            watch_region: 'IN'
        }
    },
]
