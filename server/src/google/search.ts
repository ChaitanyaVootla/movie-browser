import { sortBy } from 'lodash';
import puppeteer from 'puppeteer-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import adBlocker from 'puppeteer-extra-plugin-adblocker';
import { DEFAULT_INTERCEPT_RESOLUTION_PRIORITY } from 'puppeteer';

const getGoogleData = async (str: string) => {
    puppeteer.use(stealth());
    puppeteer.use(adBlocker({
        blockTrackers: true,
        interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
    }));
    let browser = await puppeteer.launch({args: ["--no-sandbox", "--disable-setuid-sandbox"], headless: true });
    const page = await browser.newPage();
    const cookies = [{name: 'Google', value: 'asdawda2easd32q3123', domain: 'https://google.com'}];
    await page.setCookie(...cookies);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36');''
    await page.goto(str, { waitUntil: 'domcontentloaded' });
    try {
        const googleSaidno = await (await (page.content())).match('detected unusual traffic from your computer');
        if (googleSaidno) {
            console.log('--------- Google said no --------', str);
            throw new Error('googleSaidno')
        }
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
                const link: string = await (await res.getProperty('href')).jsonValue() as string;
                const hostname = new URL(link).hostname;
                mainLink = {
                    link,
                    name: hostname,
                };
                let priceDom: any = await res.$('span');
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
        return null;
    } finally {
        await browser.close();
    }
}

const priceMapper = (price: string) => {
    if (price.toLowerCase().includes('free')) {
        return 'Subscription';
    }
    return price.replace('.00', '');
};

export default getGoogleData;
