import { uniqBy } from 'lodash';
import { movieGenres, seriesGenres } from './staticConfig';

const sanitizeName = (string) => {
    return string.replace(/\s+/g, '-');
};

const isMovie = (item) => {
    return item.first_air_date ? false : true;
};

const getRatingColor = (rating) => {
    if (rating === 0) {
        return 'grey';
    } else if (rating < 5) {
        return 'red';
    } else if (rating < 6.5) {
        return 'orange';
    } else if (rating < 8) {
        return 'green';
    }
    return 'purple';
};

const getYear = (date) => {
    return new Date(date).getFullYear();
};

const getCurrencyString = (amount) => {
    amount = parseInt(amount);
    let stringCurrency = '';
    if (amount >= 1000000000) {
        const millions = Math.round((amount / 1000000000) * 10) / 10;
        stringCurrency = `${millions} B`;
    } else if (amount >= 1000000) {
        const millions = Math.round((amount / 1000000) * 10) / 10;
        stringCurrency = `${millions} M`;
    } else {
        stringCurrency = `${amount}`;
    }
    return stringCurrency;
};

const getTMDBTimeFormat = (date) => {
    const dateObj = new Date(date);
    let month = dateObj.getMonth() || '';
    if (month < 10) {
        month = `0${month}`;
    }
    let day = dateObj.getDate() || '';
    if (day < 10) {
        day = `0${day}`;
    }
    return `${dateObj.getFullYear()}-${month}-${day}`;
};

const getDateText = (date) => {
    const monthNames = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ];
    const dateObj = new Date(date);
    return `${dateObj.getDate()} ${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
};
const getFullDateText = (date) => {
    const monthNames = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ];
    const dateObj = new Date(date);
    return `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;
};

const isMobile = () => {
    return (window.innerWidth > 0 ? window.innerWidth : screen.width) < 767;
};

const getIconFromLink = (watchLink: string) => {
    let imagePath = null;
    try {
        const url = new URL(watchLink);
        const site = url.hostname.toLowerCase();
        if (site.includes('hotstar')) {
            imagePath = '/images/ott/hotstar.png';
        } else if (site.includes('netflix')) {
            imagePath = '/images/ott/netflix.svg';
        } else if (site.includes('prime')) {
            imagePath = '/images/ott/prime.svg';
        } else if (site.includes('youtube')) {
            imagePath = '/images/ott/youtube.png';
        } else if (site.includes('google')) {
            imagePath = '/images/ott/google.svg';
        } else if (site.includes('sony')) {
            imagePath = '/images/ott/sonyliv.png';
        } else if (site.includes('apple')) {
            imagePath = '/images/ott/apple.png';
        } else if (site.includes('voot')) {
            imagePath = '/images/ott/voot.png';
        } else if (site.includes('zee')) {
            imagePath = '/images/ott/zee.png';
        }
    } catch (error) {
        console.log(error);
    }
    return {
        imagePath,
        link: watchLink,
    };
};

const mapGoogleData = (data: any) => {
    let allWatchOptions = [];

    let ratings = [];
    data.ratings?.forEach((rating) => {
        let imagePath = null;
        if (rating.name === 'IMDb') {
            imagePath = '/images/rating/imdb.svg';
        } else if (rating.name === 'Rotten Tomatoes') {
            imagePath = '/images/rating/rottenTomatoes.svg';
        } else if (rating.name === 'google') {
            imagePath = '/images/rating/google.svg';
        }

        if (imagePath) {
            ratings.push({
                ...rating,
                imagePath,
            });
        }
    });

    data.allWatchOptions?.forEach((watchOption) => {
        let imagePath;
        if (watchOption.name.toLowerCase().includes('hotstar')) {
            imagePath = '/images/ott/hotstar.png';
        } else if (watchOption.name.toLowerCase().includes('netflix')) {
            imagePath = '/images/ott/netflix.svg';
        } else if (watchOption.name.toLowerCase().includes('prime')) {
            imagePath = '/images/ott/prime.svg';
        } else if (watchOption.name.toLowerCase().includes('youtube')) {
            imagePath = '/images/ott/youtube.png';
        } else if (watchOption.name.toLowerCase().includes('google')) {
            imagePath = '/images/ott/google.svg';
        } else if (watchOption.name.toLowerCase().includes('sony')) {
            imagePath = '/images/ott/sonyliv.png';
        } else if (watchOption.name.toLowerCase().includes('apple')) {
            imagePath = '/images/ott/apple.png';
        } else if (watchOption.name.toLowerCase().includes('voot')) {
            imagePath = '/images/ott/voot.png';
        } else if (watchOption.name.toLowerCase().includes('zee')) {
            imagePath = '/images/ott/zee.png';
        }
        allWatchOptions.push({
            imagePath,
            name: watchOption.name,
            link: watchOption.link,
            price: watchOption.price,
        });
    });
    return {
        ...data,
        // imagePath,
        ratings: uniqBy(ratings, 'name'),
        allWatchOptions,
    };
};
const getGoogleLink = (item) => {
    let str = `https://google.com/search?q=${item.title || item.name}`;
    if (item.release_date) {
        const year = new Date(item.release_date).getFullYear();
        str += ` ${year} movie`;
    } else {
        str += ` tv series`;
    }
    return str;
};

const getGrenreFromId = (id) => {
    const genre = movieGenres.concat(seriesGenres).find((genre) => genre.id === id);
    return genre?.name || '';
};

export {
    sanitizeName,
    getRatingColor,
    getYear,
    getCurrencyString,
    getDateText,
    getFullDateText,
    getTMDBTimeFormat,
    isMobile,
    mapGoogleData,
    getGoogleLink,
    isMovie,
    getIconFromLink,
    getGrenreFromId,
};
