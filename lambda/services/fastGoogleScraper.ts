// @ts-ignore - @sparticuz/chromium may not have type definitions
import chromium from '@sparticuz/chromium';
import type { Page, Browser, ElementHandle } from 'puppeteer-core';
// @ts-ignore - puppeteer-extra may not have complete type definitions
import puppeteer from 'puppeteer-extra';
// @ts-ignore - stealth plugin may not have complete type definitions  
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { randomBytes } from 'crypto';
import { logger } from '../utils/logger';

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

const DIRECTOR_SELECTOR = '[data-attrid="kc:/film/film:director"]';

// Fast, minimal configurations
const FAST_RESOLUTIONS = [
    { width: 1366, height: 768 },   // Most common resolution
    { width: 1280, height: 720 },   // Compact
    { width: 1440, height: 900 }    // Reasonable middle ground
];

// Minimal realistic User-Agent list
const FAST_USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0'
];

// Legacy interfaces for backward compatibility
export interface LegacyRating {
    rating: string;
    name: string;
    link: string;
}

export interface LegacyWatchOption {
    link: string;
    name: string;
    price?: string;
}

export interface GoogleScraperResult {
    ratings: LegacyRating[];
    allWatchOptions: LegacyWatchOption[];
    imdbId: string | null;
    directorName: string | null;
    debugText?: string;
    googleError?: string;
}

interface ProxyConfig {
    host: string;
    port: number;
    username?: string;
    password?: string;
}

interface FastFingerprint {
    deviceMemory: number;
    hardwareConcurrency: number;
    platform: string;
}

const priceMapper = (price: string): string => {
    if (!price) return '';
    if (price.toLowerCase().includes('free')) {
        return 'Free';
    }
    return price.replace('.00', '');
};

// Fast delay - much shorter than the complex version
const fastDelay = (min: number, max: number): number => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Get random item from array
const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export class FastGoogleScraperService {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private currentProxy: ProxyConfig | null = null;

    constructor(private readonly proxyList?: ProxyConfig[]) {}

    private async rotateProxy(): Promise<ProxyConfig | null> {
        if (!this.proxyList || this.proxyList.length === 0) return null;
        this.currentProxy = getRandomItem(this.proxyList);
        return this.currentProxy;
    }

    private async setupPage(page: Page) {
        const resolution = getRandomItem(FAST_RESOLUTIONS);
        const userAgent = getRandomItem(FAST_USER_AGENTS);

        // Minimal but effective fingerprint
        const fingerprint: FastFingerprint = {
            deviceMemory: [4, 8, 16][Math.floor(Math.random() * 3)],
            hardwareConcurrency: [4, 6, 8][Math.floor(Math.random() * 3)],
            platform: userAgent.includes('Windows') ? 'Win32' : userAgent.includes('Mac') ? 'MacIntel' : 'Linux x86_64',
        };

        // Minimal stealth setup - just the essentials
        await page.evaluateOnNewDocument((fp: FastFingerprint) => {
            // Override only the most critical bot indicators
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => fp.deviceMemory });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fp.hardwareConcurrency });
            Object.defineProperty(navigator, 'platform', { get: () => fp.platform });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

            // Basic plugin simulation
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1 }
                ]
            });
        }, fingerprint);

        // Use the selected user agent
        await page.setUserAgent(userAgent);

        // Essential headers only
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Cache-Control': 'max-age=0'
        });
    }

    async initialize() {
        const executablePath = await chromium.executablePath();
        if (!executablePath) {
            throw new Error('Chrome executable path not found');
        }

        // Rotate proxy if available
        const proxy = await this.rotateProxy();
        const proxyArgs = proxy ? [`--proxy-server=${proxy.host}:${proxy.port}`] : [];

        const resolution = getRandomItem(FAST_RESOLUTIONS);

        this.browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                ...proxyArgs,
                '--no-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--no-first-run',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--mute-audio',
                '--disable-background-networking',
                '--disable-features=VizDisplayCompositor',
            ],
            defaultViewport: {
                width: resolution.width,
                height: resolution.height,
                deviceScaleFactor: 1,
                hasTouch: false,
                isLandscape: true,
                isMobile: false,
            },
            executablePath,
            headless: chromium.headless,
        });

        if (!this.browser) {
            throw new Error('Browser not initialized');
        }
        
        this.page = await this.browser.newPage();
        if (!this.page) {
            throw new Error('Failed to create new page');
        }

        // Set up proxy authentication if needed
        if (proxy && proxy.username && proxy.password) {
            await this.page.authenticate({
                username: proxy.username,
                password: proxy.password
            });
        }

        await this.setupPage(this.page);
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }

    private async extractTextFromElement(element: any): Promise<string | null> {
        if (!element) return null;
        const textProperty = await element.getProperty('innerText');
        if (!textProperty) return null;
        return (await textProperty.jsonValue()) as string;
    }

    private async extractHrefFromElement(element: any): Promise<string | null> {
        if (!element) return null;
        const hrefProperty = await element.getProperty('href');
        if (!hrefProperty) return null;
        return (await hrefProperty.jsonValue()) as string;
    }

    private async extractRatings(): Promise<{ ratings: LegacyRating[]; imdbId: string | null }> {
        const ratings: LegacyRating[] = [];
        let imdbId: string | null = null;

        try {
            const ratingsDOM = await this.page!.$$('a.vIUFYd');

            for (const ratingDOM of ratingsDOM) {
                const ratingSpan = await ratingDOM.$('span.KMdzJ');
                const nameSpan = await ratingDOM.$('span.pVA7K');
                const linkStr = await this.extractHrefFromElement(ratingDOM);

                if (ratingSpan && nameSpan && linkStr) {
                    const ratingValue = await this.extractTextFromElement(ratingSpan);
                    const nameValue = await this.extractTextFromElement(nameSpan);

                    if (ratingValue && nameValue) {
                        if (linkStr.includes('/title/')) {
                            imdbId = linkStr.split('/title/')[1].split('/')[0];
                        }
                        ratings.push({
                            rating: ratingValue.split('/')[0],
                            name: nameValue,
                            link: linkStr,
                        });
                    }
                }
            }

            // Extract Google rating if available
            const googleRatingDOM = await this.page!.$('div.srBp4');
            if (googleRatingDOM) {
                const googleRatingValue = await this.extractTextFromElement(googleRatingDOM);
                if (googleRatingValue) {
                    const googleRating = `${googleRatingValue.split('%')[0]}%`;
                    if (!isNaN(parseInt(googleRating.split('%')[0]))) {
                        ratings.push({
                            rating: googleRating,
                            name: 'google',
                            link: this.page!.url(),
                        });
                    }
                }
            }
        } catch (error) {
            logger.debug('Error extracting ratings', error);
        }

        return { ratings, imdbId };
    }

    private async extractDirector(): Promise<string | null> {
        try {
            const directorDOM = await this.page!.$(DIRECTOR_SELECTOR);
            if (!directorDOM) return null;

            const directorText = await this.extractTextFromElement(directorDOM);
            if (!directorText) return null;

            return directorText.split(':')[1]?.trim() || null;
        } catch (error) {
            logger.debug('Error extracting director', error);
            return null;
        }
    }

    private async extractWatchOptions(): Promise<LegacyWatchOption[]> {
        const watchOptions: LegacyWatchOption[] = [];

        try {
            // Try primary source - expandable watch options
            const watchOptionsDOM = await this.page!.$('span.hVUO8e');
            if (watchOptionsDOM) {
                try {
                    await watchOptionsDOM.click();
                    await this.page!.waitForSelector('g-expandable-content.rXtXab', { timeout: 1000 });

                    const ottDOMContainer = await this.page!.$('g-expandable-content.rXtXab');
                    if (ottDOMContainer) {
                        const ottDOMs = await ottDOMContainer.$$('a');
                        for (const ottDom of ottDOMs) {
                            const link = await this.extractHrefFromElement(ottDom);
                            if (!link) continue;

                            const nameDiv = await ottDom.$('div.bclEt');
                            const name = await this.extractTextFromElement(nameDiv);
                            if (!name) continue;

                            const priceDiv = await ottDom.$('div.rsj3fb');
                            const price = await this.extractTextFromElement(priceDiv);

                            watchOptions.push({
                                link,
                                name,
                                ...(price ? { price: priceMapper(price) } : {}),
                            });
                        }
                    }
                } catch (error) {
                    logger.debug('Error with primary watch options', error);
                }
            }

            // If no options found, try secondary source
            if (watchOptions.length === 0) {
                const ottDOMs = await this.page!.$$('div.nGOerd a');
                for (const ottDom of ottDOMs) {
                    const link = await this.extractHrefFromElement(ottDom);
                    if (!link) continue;

                    const nameDiv = await ottDom.$('div.bclEt');
                    let name = await this.extractTextFromElement(nameDiv);
                    if (!name) {
                        name = new URL(link).hostname;
                    }

                    let price = '';
                    try {
                        const priceDiv1 = await ottDom.$('div.rsj3fb');
                        const priceDiv2 = await ottDom.$('div.ZYHQ7e');
                        if (priceDiv1) {
                            price = (await this.extractTextFromElement(priceDiv1)) || '';
                        } else if (priceDiv2) {
                            price = (await this.extractTextFromElement(priceDiv2)) || '';
                        }
                    } catch (e) {
                        // Ignore price extraction errors
                    }

                    watchOptions.push({
                        link,
                        name,
                        price: priceMapper(price),
                    });
                }
            }
        } catch (error) {
            logger.debug('Error extracting watch options', error);
        }

        return watchOptions;
    }

    async scrape(searchString: string, region?: string): Promise<GoogleScraperResult> {
        if (!this.page) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }

        try {
            const searchUrl = new URL('https://www.google.com/search');
            searchUrl.searchParams.set('q', searchString);
            if (region) {
                searchUrl.searchParams.set('gl', region);
            }
            searchUrl.searchParams.set('hl', 'en');

            // Go directly to search results - no homepage visit
            await this.page.goto(searchUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 15000 });
            
            // Minimal delay - just enough to let page stabilize
            await new Promise(resolve => setTimeout(resolve, fastDelay(500, 1000)));

            // Quick check for bot detection - single attempt only
            const pageTitle = await this.page.title();
            const detectionIndicators = [
                'detected unusual traffic',
                'verify you are a human', 
                'captcha',
                'blocked'
            ];
            
            const isDetected = detectionIndicators.some(indicator => 
                pageTitle.toLowerCase().includes(indicator)
            );
            
            if (isDetected) {
                throw new Error(`Bot detected immediately. Page title: ${pageTitle}`);
            }

            // Quick scroll to trigger any lazy loading - minimal
            await this.page.evaluate(() => {
                window.scrollBy(0, 200); // Just a small scroll
            });
            
            await new Promise(resolve => setTimeout(resolve, fastDelay(200, 500)));

            // Extract data quickly - all in parallel
            const [ratingsResult, directorName, allWatchOptions] = await Promise.all([
                this.extractRatings(),
                this.extractDirector(),
                this.extractWatchOptions()
            ]);

            const { ratings, imdbId } = ratingsResult;

            // Quick debug text if no results
            let debugText = '';
            if (!ratings.length && !allWatchOptions.length) {
                try {
                    debugText = await this.page.$eval('body', (el: any) => el.innerText.substring(0, 500));
                } catch (e) {
                    debugText = 'Could not extract debug text';
                }
            }

            return {
                ratings,
                allWatchOptions,
                imdbId,
                directorName,
                debugText
            };
        } catch (error) {
            logger.error('Error in fast Google scraper:', error);
            throw error;
        }
    }

    // Static method for backward compatibility
    static async scrapeGoogleData(searchString: string, region?: string): Promise<GoogleScraperResult | null> {
        const scraper = new FastGoogleScraperService();
        
        try {
            logger.info('Starting fast Google scraper', { searchString });
            
            await scraper.initialize();
            const result = await scraper.scrape(searchString, region);
            
            logger.info('Fast Google scraper completed successfully', {
                ratingsCount: result.ratings.length,
                watchOptionsCount: result.allWatchOptions.length,
                hasImdbId: !!result.imdbId,
                hasDirector: !!result.directorName
            });

            return result;

        } catch (error: any) {
            logger.error('Fast Google scraper failed', error);
            return {
                ratings: [],
                allWatchOptions: [],
                imdbId: null,
                directorName: null,
                debugText: '',
                googleError: error.message || 'Fast Google scraper failed'
            };
        } finally {
            await scraper.close();
        }
    }
}
