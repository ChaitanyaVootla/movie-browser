import { getBaseUrl } from "~/utils/url";

export const watchOptionImageMapper = {
    'youtube': {
        image: '/images/ott/youtube.png',
        name: 'YouTube'
    },
    'netflix': {
        image: '/images/ott/netflix.svg',
        name: 'Netflix',
        linkMorph: (link: string) => {
            return link.replace('https://www.netflix.com/title/', 'https://www.netflix.com/watch/')
        }
    },
    'apple': {
        image: '/images/ott/apple.png',
        name: 'Apple'
    },
    'google': {
        image: '/images/ott/google.svg',
        name: 'Google'
    },
    'amazon': {
        image: '/images/ott/prime.svg',
        name: 'Amazon'
    },
    'prime': {
        image: '/images/ott/prime.svg',
        name: 'Amazon'
    },
    'hotstar': {
        image: '/images/ott/hotstar.png',
        name: 'Hotstar'
    },
    'sonyliv': {
        image: '/images/ott/sonyliv.png',
        name: 'SonyLIV'
    },
    'voot': {
        image: '/images/ott/voot.png',
        name: 'Voot'
    },
    'zee5': {
        image: '/images/ott/zee.png',
        name: 'Zee5'
    },
    'jio': {
        image: '/images/ott/jio.png',
        name: 'JioCinema'
    },
    'mubi': {
        image: '/images/ott/mubi.webp',
        name: 'MUBI'
    },
    'mx': {
        image: '/images/ott/mx.png',
        name: 'MX Player'
    },
    'aha': {
        image: '/images/ott/aha.svg',
        name: 'aha'
    },
    'plex': {
        image: '/images/ott/plex.png',
        name: 'plex'
    },
    'crunchyroll': {
        image: '/images/ott/crunchyroll.png',
        name: 'crunchyroll'
    },
    'viki': {
        image: '/images/ott/viki.png',
        name: 'Viki'
    },
} as Record<string, {
    image: string,
    name: string
}>;

export const mapWatchProvider = (name: string, link: string) => {
    const mappedWatchOption = Object.entries(watchOptionImageMapper).find(([key, value]) =>
        (name || getBaseUrl(link)).toLowerCase().includes(key));

    return {
        name: name,
        displayName: mappedWatchOption?.[1]?.name,
        link: (mappedWatchOption?.[1] as any)?.linkMorph ? (mappedWatchOption?.[1] as any).linkMorph(link) : link,
        image: mappedWatchOption?.[1]?.image,
        key: mappedWatchOption?.[0]
    }
}