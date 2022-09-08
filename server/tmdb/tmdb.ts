const axios = require('axios').default;
import { tmdb } from './';
const nodeCache = require('node-cache');
import { Db } from 'mongodb';

const ttl = 60 * 60 * 3;
const cache = new nodeCache({checkperiod: 120});

async function tmdbPassthrough(path, db: Db) {
    if (cache.has(path)) {
        // db.collection('tmdb').insertOne(cache.get(path))
        return cache.get(path);
    }
    const url = `${tmdb.BASE_URL}${path}${path.includes('?')?'':'?'}&api_key=${process.env.TMDB_API_KEY}`;
    const {data: details} = await axios.get(url);
    cache.set(path, details, ttl);
    return details;
}

export {tmdbPassthrough};
