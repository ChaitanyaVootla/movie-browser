export const watchProviderItems = [
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
    // {
    //     logo: '/images/ott/aha.svg',
    //     name: 'aha',
    //     url: 'https://www.aha.video/',
    //     filterParams: {
    //         with_watch_providers: [532],
    //         media_type: 'movie',
    //         watch_region: 'IN'
    //     }
    // },
]
