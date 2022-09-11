import { sortBy } from 'lodash';
import puppeteer from 'puppeteer';

let browser: puppeteer.Browser;
const setupPuppeteer = async () => {
    browser = await puppeteer.launch({ args: ['--no-sandbox'], headless: true });
};

const getGoogleData = async (str: string) => {
    const page = await browser.newPage();
    await page.goto(str, { waitUntil: 'domcontentloaded' });
    try {
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
    
        const result = {
            ratings,
            allWatchOptions: sortBy(allWatchOptions, ({ price }) => price == 'Subscription').reverse(),
            imdbId,
        };
        return result;
    } catch(e) {
        console.error('puppeteer failed for string: ', str);
        return {};
    } finally {
        await page.close();
    }
}

const priceMapper = (price: string) => {
    if (price.toLowerCase().includes('free')) {
        return 'Subscription';
    }
    return price.replace('.00', '');
};

setupPuppeteer();
export default getGoogleData;
