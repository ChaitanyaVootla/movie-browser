export default defineEventHandler(async (event) => {
    const q = (getQuery(event)?.query || null) as string | null;
    const type = (getQuery(event)?.type || 'all') as string;
    if (!q) {
        return [];
    }

    const encoded = encodeURIComponent(q);

    // Decide endpoint based on type
    let endpoint = `https://api.themoviedb.org/3/search/multi?api_key=${process.env.TMDB_API_KEY}&query=${encoded}`;
    if (type === 'movie') {
        endpoint = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encoded}`;
    } else if (type === 'tv') {
        endpoint = `https://api.themoviedb.org/3/search/tv?api_key=${process.env.TMDB_API_KEY}&query=${encoded}`;
    } else if (type === 'person') {
        endpoint = `https://api.themoviedb.org/3/search/person?api_key=${process.env.TMDB_API_KEY}&query=${encoded}`;
    }

    const res: any = await $fetch(endpoint, {
        retry: 3,
    });

    const results = res.results || [];

    // Normalize media_type for non-multi endpoints
    const normalized = results.map((item: any) => {
        if (type === 'movie') return { ...item, media_type: 'movie' };
        if (type === 'tv') return { ...item, media_type: 'tv' };
        if (type === 'person') return { ...item, media_type: 'person' };
        return item;
    });

    // For multi search, filter out collections; otherwise just return normalized
    return (type === 'all'
        ? normalized.filter(({ media_type }: any) => media_type !== 'collection')
        : normalized) || [];
});
