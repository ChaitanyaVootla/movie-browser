import axios from 'axios';
import constants from '../constants';

async function tmdbPassthrough(path) {
    const url = `${constants.BASE_URL}${path}${path.includes('?')?'':'?'}&api_key=${process.env.TMDB_API_KEY}`;
    const {data: details} = await axios.get(url);
    return details;
}

export default tmdbPassthrough;
