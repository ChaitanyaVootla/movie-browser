const puppeteer = require('puppeteer');
let page;
const setupPuppeteer = async () => {
    const browser = await puppeteer.launch({args: ['--no-sandbox'], headless: true});
    page = await browser.newPage();
}
const googleData = async (str) => {
    try {
        console.time("getting link");
        await page.goto(str);
        const res = await page.$('div.fOYFme>a');
        let linkString = null;
        if (res) {
            const link = await res.getProperty('href');
            linkString = await link.jsonValue();
        }

        let ratingsDOM = await page.$$('a.NY3LVe');
        const ratings = [];
        for (rating of ratingsDOM) {
            const data = await rating.getProperty('innerText')
            const info = await (await data.jsonValue()).toString();
            let link = await rating.getProperty('href');
            link = await link.jsonValue();
            ratings.push({
                rating: info.split('\n')[0],
                name: info.split('\n')[1],
                link,
            });
        };

        let googleRatingDOM = await page.$('div.srBp4');
        if (googleRatingDOM) {
            const googleRatingItem = await googleRatingDOM.getProperty('innerText')
            let googleRating = await (await googleRatingItem.jsonValue()).toString();
            googleRating = `${googleRating.split('%')[0]}%`;
    
            ratings.push({
                rating: googleRating,
                name: 'google',
                link: str,
            });
        }

        console.timeEnd("getting link");
        return {
            watchLink: linkString,
            ratings,
        };
    }
    catch(e) {
        console.error(e);
        return e;
    }
}

setupPuppeteer();
module.exports = googleData;
