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
        for (ratingDOM of ratingsDOM) {
            const rating = await (await (await (await ratingDOM.$('span.gsrt'))
                .getProperty('innerText')).jsonValue()).toString()
            const name = await (await (await (await ratingDOM.$('span.wDgjf'))
                .getProperty('innerText')).jsonValue()).toString()
            let link = await ratingDOM.getProperty('href');
            link = await link.jsonValue();
            ratings.push({
                rating,
                name,
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

        const watchOptionsDOM = await page.$('span.hVUO8e');
        const allWatchOptions = [];
        if (watchOptionsDOM) {
            await watchOptionsDOM.click();
            await page.waitForSelector("g-expandable-content.rXtXab", {timeout: 2000})
            let ottDOMContainer = await page.$("g-expandable-content.rXtXab");
            let ottDOMs = await ottDOMContainer.$$("a");
            for (ottDom of ottDOMs) {
                const link = await (await ottDom.getProperty('href')).jsonValue();
                const name = await (await (await (await ottDom.$('div.bclEt'))
                    .getProperty('innerText')).jsonValue()).toString();
                allWatchOptions.push({
                    link,
                    name,
                });
            }
        }

        console.timeEnd("getting link");
        return {
            watchLink: linkString,
            ratings,
            allWatchOptions,
        };
    }
    catch(e) {
        console.error(e);
        return e;
    }
}

setupPuppeteer();
module.exports = googleData;
