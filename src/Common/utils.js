const sanitizeName = (string) => {
  return string.replace(/\s+/g, '-');
}

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
}

const getYear = (date) => {
    return new Date(date).getFullYear();
}

const getCurrencyString = (amount) => {
    amount = parseInt(amount);
    let stringCurrency = '';
    if (amount >= 1000000000) {
        const millions = Math.round(amount/1000000000 * 10)/10;
        stringCurrency = `${millions} B`;
    } else if (amount >= 1000000) {
        const millions = Math.round(amount/1000000 * 10)/10;
        stringCurrency = `${millions} M`;
    } else {
        stringCurrency = `${amount}`;
    }
    return stringCurrency;
}

const getTMDBTimeFormat = (date) => {
    const dateObj = new Date(date);
    let month = dateObj.getMonth() || '';
    if (month < 10) {
        month = `0${month}`
    }
    let day = dateObj.getDate() || '';
    if (day < 10) {
        day = `0${day}`
    }
    return `${dateObj.getFullYear()}-${month}-${day}`
}

const getDateText = (date) => {
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const dateObj = new Date(date);
    return `${dateObj.getDate()} ${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}
const getFullDateText = (date) => {
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const dateObj = new Date(date);
    return `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;
}

const isMobile = () => {
    return ((window.innerWidth > 0) ? window.innerWidth : screen.width) < 767;
}

const mapGoogleData = (data) => {
    let imagePath;
    if (data.watchLink) {
        if (data.watchLink.includes('hotstar')) {
            imagePath = '/images/ott/hotstar.svg';
        } else if (data.watchLink.includes('netflix')) {
            imagePath = '/images/ott/netflix.svg';
        } else if (data.watchLink.includes('prime')) {
            imagePath = '/images/ott/prime.svg';
        } else if (data.watchLink.includes('youtube')) {
            imagePath = '/images/ott/youtube.png';
        } else if (data.watchLink.includes('google')) {
            imagePath = '/images/ott/google.svg';
        }
    }

    let ratings = [];
    data.ratings.forEach(
        rating => {
            let imagePath = null;
            if (rating.name === 'IMDb') {
                imagePath = '/images/rating/imdb.svg'
            } else if (rating.name === 'Rotten Tomatoes') {
                imagePath = '/images/rating/rottenTomatoes.svg'
            } else if (rating.name === 'google') {
                imagePath = '/images/rating/google.svg'
            }

            if (imagePath) {
                ratings.push({
                    ...rating,
                    imagePath,
                });
            }
        }
    );
    return {
        ...data,
        imagePath,
        ratings,
    }
}


export { sanitizeName, getRatingColor, getYear, getCurrencyString, getDateText, getFullDateText, getTMDBTimeFormat, isMobile, mapGoogleData };
