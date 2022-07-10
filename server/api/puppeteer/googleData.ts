import { sortBy } from 'lodash';
import puppeteer from 'puppeteer';
let page: puppeteer.Page;
const setupPuppeteer = async () => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'], headless: true });
    page = await browser.newPage();
};
const pageCache = {};
// const api = require('../db');
const HOURS_TO_UPDATE = 72;
const googleData = async (str) => {
    try {
        // const apiResult = await api.GoogleData.findOne({where: {searchString: str}});
        // if (apiResult) {
        //     const createdTime = new Date(apiResult.createdAt);
        //     const hoursSinceUpdate = (Date.now() - createdTime.getTime())/(1000*60*60);
        //     if (hoursSinceUpdate > HOURS_TO_UPDATE) {
        //         await apiResult.destroy();
        //     } else {
        //         return apiResult.data;
        //     }
        // }
    } catch (e) {
        // console.error(e);
    } finally {
        try {
            if (pageCache[str]) {
                console.log('Using cached page');
                forceGetGoogleData(str);
                return pageCache[str];
            } else {
                return forceGetGoogleData(str);
            }
        } catch (e) {
            console.error(e);
        }
    }
};

const forceGetGoogleData = async (str: string) => {
    console.time(`getting link`);
    await page.goto(str, { waitUntil: 'domcontentloaded' });

    let ratingsDOM = await page.$$('a.vIUFYd');
    const ratings = [];
    let imdbId = null;
    for (const ratingDOM of ratingsDOM) {
        const rating = await (
            await (await (await ratingDOM.$('span.KMdzJ')).getProperty('innerText')).jsonValue()
        )
            .toString()
            .split('/')[0];
        const name = await (
            await (await (await ratingDOM.$('span.pVA7K')).getProperty('innerText')).jsonValue()
        ).toString();

        let link = await ratingDOM.getProperty('href');
        let linkStr = (await link.jsonValue()) as string;
        if (linkStr.includes('/title/')) {
            imdbId = linkStr.split('/title/')[1].split('/')[0];
        }
        ratings.push({
            rating,
            name,
            link: linkStr,
        });
    }

    let googleRatingDOM = await page.$('div.srBp4');
    if (googleRatingDOM) {
        const googleRatingItem = await googleRatingDOM.getProperty('innerText');
        let googleRating = (await googleRatingItem.jsonValue()).toString();
        googleRating = `${googleRating.split('%')[0]}%`;
        if (!isNaN(parseInt(googleRating.split('%')[0]))) {
            ratings.push({
                rating: googleRating,
                name: 'google',
                link: str,
            });
        }
    }

    const allWatchOptions = [];
    let watchOptionsDOM = await page.$('span.hVUO8e');
    let secondaryWatchOptionsDOM = await page.$('div.nGOerd');

    if (watchOptionsDOM) {
        await watchOptionsDOM.click();
        await page.waitForSelector('g-expandable-content.rXtXab', { timeout: 2000 });
        let ottDOMContainer = await page.$('g-expandable-content.rXtXab');
        let ottDOMs = await ottDOMContainer.$$('a');
        for (const ottDom of ottDOMs) {
            const link = await (await ottDom.getProperty('href')).jsonValue();
            const name = await (
                await (await (await ottDom.$('div.bclEt')).getProperty('innerText')).jsonValue()
            ).toString();
            let price = null;
            try {
                price = await (
                    await (await (await ottDom.$('div.rsj3fb')).getProperty('innerText')).jsonValue()
                ).toString();
            } catch (e) {}
            allWatchOptions.push({
                link,
                name,
                price,
            });
        }
    } else if (secondaryWatchOptionsDOM) {
        try {
            await (await page.$('g-expandable-container')).click();
            await page.waitForSelector('g-expandable-content.rXtXab', { timeout: 2000 });
        } catch (e) {}
        let ottDOMs = await page.$$('div.nGOerd a');
        for (const ottDom of ottDOMs) {
            const link = await (await ottDom.getProperty('href')).jsonValue();
            const name = await (
                await (await (await ottDom.$('div.bclEt')).getProperty('innerText')).jsonValue()
            ).toString();
            let price = null;
            try {
                price = await (
                    await (await (await ottDom.$('div.rsj3fb')).getProperty('innerText')).jsonValue()
                ).toString();
            } catch (e) {}
            allWatchOptions.push({
                link,
                name,
                price: priceMapper(price),
            });
        }
    } else {
        const res = await page.$('div.fOYFme>a');
        let mainLink = null;
        if (res) {
            const link: string = await (await res.getProperty('href')).jsonValue();
            const hostname = new URL(link).hostname;
            mainLink = {
                link,
                name: hostname,
            };
            let priceDom = await res.$('span');
            if (!priceDom) {
                priceDom = await res.$('.uiBRm');
            }
            if (priceDom) {
                const price = await (await (await priceDom.getProperty('innerText')).jsonValue()).toString();
                mainLink.price = priceMapper(price);
            }
            allWatchOptions.push(mainLink);
        }
    }

    const criticReviewsDOM = await page.$('critic-reviews-container');
    const criticReviews = [];
    if (criticReviewsDOM) {
        const reviewsDOMs = await criticReviewsDOM.$$('div.beulkd');
        for (const reviewDOM of reviewsDOMs) {
            const review = await page.evaluate((el) => el.textContent, await reviewDOM.$('div.NIUoNb i'));
            const author = await page.evaluate((el) => el.textContent, await reviewDOM.$('div.Htriib'));
            const site = await page.evaluate((el) => el.textContent, await reviewDOM.$('div.Htriib a'));
            const link = await page.evaluate((el) => el.href, await reviewDOM.$('div.Htriib a'));
            const imagePath = await page.evaluate((el) => el.src, await reviewDOM.$('div.Htriib img'));
            criticReviews.push({
                review,
                author: author.replace(site, ''),
                site,
                link,
                imagePath,
            });
        }
    }

    console.timeEnd('getting link');
    const result = {
        ratings,
        allWatchOptions: sortBy(allWatchOptions, ({ price }) => price == 'Subscription').reverse(),
        criticReviews,
        imdbId,
    };
    // try {
    //     await api.GoogleData.create({
    //         searchString: str,
    //         data: result,
    //     });
    // } catch(e) {
    //     console.error(e);
    // }
    pageCache[str] = result;
    return result;
}

const priceMapper = (price: string) => {
    if (price.toLowerCase().includes('free')) {
        return 'Subscription';
    }
    return price.replace('.00', '');
};

setupPuppeteer();
export default googleData;
