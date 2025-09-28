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
const MAX_RETRIES = 2; // Reduced retries to avoid aggressive behavior
const RETRY_DELAY = 10000; // Increased delay between retries
const MIN_SESSION_DELAY = 15000; // Minimum delay between sessions

// Common screen resolutions
const COMMON_RESOLUTIONS = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 }
];

// Common time zones
const COMMON_TIMEZONES = [
    'America/New_York',
    'America/Los_Angeles',
    'America/Chicago',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Australia/Sydney'
];

// Realistic User-Agent strings for 2024/2025
const REALISTIC_USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15'
];

// More realistic browser languages
const BROWSER_LANGUAGES = [
    'en-US,en;q=0.9',
    'en-GB,en;q=0.9',
    'en-US,en;q=0.8,es;q=0.7',
    'en-CA,en;q=0.9,fr;q=0.8',
    'en-AU,en;q=0.9'
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
    googleError?: string; // Added for better debugging
}

interface ProxyConfig {
    host: string;
    port: number;
    username?: string;
    password?: string;
}

interface Fingerprint {
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

// Helper to generate random delays with natural distribution
const randomDelay = (min: number, max: number): number => {
    // Use a normal distribution for more natural timing
    const mean = (min + max) / 2;
    const stdDev = (max - min) / 6;
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const value = Math.floor(mean + stdDev * z0);
    return Math.max(min, Math.min(max, value));
};

// Get random item from array
const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export class GoogleScraperService {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private currentProxy: ProxyConfig | null = null;
    private retryCount: number = 0;

    constructor(private readonly proxyList?: ProxyConfig[]) {}

    private async rotateProxy(): Promise<ProxyConfig | null> {
        if (!this.proxyList || this.proxyList.length === 0) return null;
        this.currentProxy = getRandomItem(this.proxyList);
        return this.currentProxy;
    }

    private async setupPage(page: Page) {
        const resolution = getRandomItem(COMMON_RESOLUTIONS);
        const timezone = getRandomItem(COMMON_TIMEZONES);
        const userAgent = getRandomItem(REALISTIC_USER_AGENTS);
        const language = getRandomItem(BROWSER_LANGUAGES);

        // Generate a more sophisticated fingerprint
        const fingerprint: Fingerprint = {
            deviceMemory: [4, 8, 16, 32][Math.floor(Math.random() * 4)], // More realistic memory sizes
            hardwareConcurrency: [4, 6, 8, 12, 16][Math.floor(Math.random() * 5)], // More realistic CPU cores
            platform: userAgent.includes('Windows') ? 'Win32' : userAgent.includes('Mac') ? 'MacIntel' : 'Linux x86_64',
        };

        await page.evaluateOnNewDocument((fp: Fingerprint, tz: string) => {
            // Override timezone
            const dateToString = Date.prototype.toString;
            const intlFormat = Intl.DateTimeFormat().resolvedOptions;
            Object.defineProperty(Intl.DateTimeFormat.prototype, 'resolvedOptions', {
                get: () => () => ({ ...intlFormat.call(this), timeZone: tz })
            });
            Object.defineProperty(Date.prototype, 'toString', {
                get: () => () => dateToString.call(this).replace(/GMT[+-]\d{4}/, 'GMT-0500')
            });

            // Override hardware specs
            Object.defineProperty(navigator, 'deviceMemory', { get: () => fp.deviceMemory });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fp.hardwareConcurrency });
            Object.defineProperty(navigator, 'platform', { get: () => fp.platform });
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

            // Override screen properties
            Object.defineProperty(window.screen, 'colorDepth', { get: () => 24 });
            Object.defineProperty(window.screen, 'pixelDepth', { get: () => 24 });

            // Add touch support conditionally
            if (Math.random() > 0.5) {
                Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
            }

            // Override connection
            // @ts-ignore
            Object.defineProperty(navigator, 'connection', {
                get: () => ({
                    effectiveType: ['4g', '3g'][Math.floor(Math.random() * 2)],
                    rtt: Math.floor(Math.random() * 100),
                    downlink: 5 + Math.random() * 5,
                    saveData: false
                })
            });

            // Override permissions
            const originalQuery = window.navigator.permissions.query;
            // @ts-ignore
            window.navigator.permissions.query = (parameters: any) => 
                parameters.name === 'notifications' 
                    ? Promise.resolve({ state: 'default' }) 
                    : originalQuery(parameters);

            // Add plugins (using Math.random instead of randomBytes for browser context)
            Object.defineProperty(navigator, 'plugins', {
                get: () => {
                    const plugins = new Array(3).fill(null).map(() => ({
                        name: Math.random().toString(36).substring(7),
                        filename: Math.random().toString(36).substring(7),
                        description: Math.random().toString(36).substring(7),
                        length: Math.floor(Math.random() * 5) + 1
                    }));
                    return plugins;
                }
            });

        }, fingerprint, timezone);

        // Use the randomly selected realistic user agent
        await page.setUserAgent(userAgent);

        // Extract browser info from user agent for consistent headers
        const isChrome = userAgent.includes('Chrome') && !userAgent.includes('Edg');
        const isFirefox = userAgent.includes('Firefox');
        const isSafari = userAgent.includes('Safari') && !userAgent.includes('Chrome');
        
        // Get Chrome version from user agent for consistent headers
        const chromeMatch = userAgent.match(/Chrome\/(\d+)/);
        const chromeVersion = chromeMatch ? chromeMatch[1] : '131';

        // Set realistic headers based on browser type
        const headers: Record<string, string> = {
            'Accept-Language': language,
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
        };

        // Add Chrome-specific headers
        if (isChrome) {
            headers['sec-ch-ua'] = `"Google Chrome";v="${chromeVersion}", "Chromium";v="${chromeVersion}", "Not_A Brand";v="99"`;
            headers['sec-ch-ua-mobile'] = '?0';
            headers['sec-ch-ua-platform'] = `"${fingerprint.platform === 'Win32' ? 'Windows' : fingerprint.platform === 'MacIntel' ? 'macOS' : 'Linux'}"`;
            headers['sec-ch-ua-platform-version'] = fingerprint.platform === 'Win32' ? '"15.0.0"' : '"14.6.1"';
        }

        await page.setExtraHTTPHeaders(headers);
        
        // Add some additional stealth measures
        await page.evaluateOnNewDocument(() => {
            // Override the permissions API to be more realistic
            const originalQuery = navigator.permissions.query;
            navigator.permissions.query = (parameters: any) => {
                if (parameters.name === 'notifications') {
                    return Promise.resolve({ state: 'default' });
                }
                return originalQuery.call(navigator.permissions, parameters);
            };
            
            // Override getBattery to simulate realistic battery info
            if ('getBattery' in navigator) {
                // @ts-ignore
                navigator.getBattery = () => Promise.resolve({
                    charging: Math.random() > 0.5,
                    chargingTime: Infinity,
                    dischargingTime: Math.random() * 10000 + 5000,
                    level: Math.random() * 0.5 + 0.5
                });
            }
        });
    }

    async initialize() {
        const executablePath = await chromium.executablePath();
        if (!executablePath) {
            throw new Error('Chrome executable path not found');
        }

        // Rotate proxy if available
        const proxy = await this.rotateProxy();
        const proxyArgs = proxy ? [
            `--proxy-server=${proxy.host}:${proxy.port}`,
        ] : [];

        const resolution = getRandomItem(COMMON_RESOLUTIONS);

        this.browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                ...proxyArgs,
                '--no-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-accelerated-2d-canvas',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-breakpad',
                '--disable-component-extensions-with-background-pages',
                '--disable-extensions',
                '--disable-features=TranslateUI,BlinkGenPropertyTrees,VizDisplayCompositor',
                '--disable-ipc-flooding-protection',
                '--enable-features=NetworkService,NetworkServiceInProcess',
                '--force-color-profile=srgb',
                '--metrics-recording-only',
                '--font-render-hinting=none',
                // Additional stealth arguments
                '--disable-web-security',
                '--disable-site-isolation-trials',
                '--no-first-run',
                '--no-service-autorun',
                '--password-store=basic',
                '--use-mock-keychain',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--mute-audio',
                '--no-zygote',
                '--disable-background-networking',
                '--disable-background-mode',
                '--disable-client-side-phishing-detection',
                '--disable-hang-monitor',
                '--disable-prompt-on-repost',
                '--disable-domain-reliability',
                '--disable-features=VizDisplayCompositor,AudioServiceOutOfProcess',
                '--user-data-dir=/tmp/chrome-user-data',
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
                        rating: ratingValue.split('/')[0], // Keep consistent with legacy format
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

        return { ratings, imdbId };
    }

    private async extractDirector(): Promise<string | null> {
        const directorDOM = await this.page!.$(DIRECTOR_SELECTOR);
        if (!directorDOM) return null;

        const directorText = await this.extractTextFromElement(directorDOM);
        if (!directorText) return null;

        return directorText.split(':')[1]?.trim() || null;
    }

    private async extractWatchOptionsFromPrimarySource(): Promise<LegacyWatchOption[]> {
        const watchOptions: LegacyWatchOption[] = [];
        const watchOptionsDOM = await this.page!.$('span.hVUO8e');

        if (!watchOptionsDOM) return watchOptions;

        try {
            await watchOptionsDOM.click();
            await this.page!.waitForSelector('g-expandable-content.rXtXab', {
                timeout: 2000,
            });
            // Wait up to 500ms for a price DOM to appear
            await Promise.race([
                this.page!.waitForSelector('div.rsj3fb', { timeout: 500 }).catch(() => {}),
                this.page!.waitForSelector('div.ZYHQ7e', { timeout: 500 }).catch(() => {}),
            ]);

            const ottDOMContainer = await this.page!.$('g-expandable-content.rXtXab');
            if (!ottDOMContainer) return watchOptions;

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
        } catch (error) {
            logger.debug('Error extracting primary watch options', error);
            }

            return watchOptions;
    }

    private async extractWatchOptionsFromSecondarySource(): Promise<LegacyWatchOption[]> {
        const watchOptions: LegacyWatchOption[] = [];
        const secondaryWatchOptionsDOM = await this.page!.$('div.nGOerd');

        if (!secondaryWatchOptionsDOM) return watchOptions;

        try {
            const expandButton = await this.page!.$('.zu8h9c');
                if (expandButton) {
                    await expandButton.click();
                await this.page!.waitForSelector('.zu8h9c[aria-expanded="true"]', {
                    timeout: 2000,
                });
                }
            } catch (e) {
            // Ignore expansion errors
        }

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

        return watchOptions;
    }

    private async extractWatchOptionsFromFallbackSource(): Promise<LegacyWatchOption[]> {
        const watchOptions: LegacyWatchOption[] = [];
        const res = await this.page!.$('div.fOYFme>a');

        if (!res) return watchOptions;

        const link = await this.extractHrefFromElement(res);
        if (!link) return watchOptions;

        const hostname = new URL(link).hostname;
        const mainLink: LegacyWatchOption = {
            link,
            name: hostname,
        };

        let priceDom: ElementHandle | null = await res.$('span');
        if (!priceDom) {
            priceDom = await res.$('.uiBRm');
        }

        if (priceDom) {
            const price = await this.extractTextFromElement(priceDom);
            if (price) {
                mainLink.price = priceMapper(price);
            }
        }

        watchOptions.push(mainLink);
            return watchOptions;
    }

    private squashWatchOptions(watchOptions: LegacyWatchOption[]): LegacyWatchOption[] {
        const uniqueWatchOptions = new Map<string, LegacyWatchOption>();

        for (const option of watchOptions) {
            const existingOption = uniqueWatchOptions.get(option.link);

            // If this option doesn't exist yet, or if this option has price info and the existing one doesn't
            if (!existingOption || (option.price && !existingOption.price)) {
                uniqueWatchOptions.set(option.link, option);
            }
        }

        return Array.from(uniqueWatchOptions.values());
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

            // Add random hl parameter for language
            searchUrl.searchParams.set('hl', 'en');
            
            // Add random parameters that real browsers send
            searchUrl.searchParams.set('source', 'hp');
            searchUrl.searchParams.set('ei', randomBytes(12).toString('hex'));
            searchUrl.searchParams.set('iflsig', randomBytes(12).toString('hex'));
            if (Math.random() > 0.5) {
                searchUrl.searchParams.set('oq', searchString);
            }

            // Add initial delay to simulate opening browser
            await new Promise(resolve => setTimeout(resolve, randomDelay(2000, 4000)));

            // Navigate to Google homepage first (more realistic)
            await this.page.goto('https://www.google.com', { waitUntil: 'networkidle2', timeout: 20000 });
            await new Promise(resolve => setTimeout(resolve, randomDelay(1000, 3000)));

            // Simulate some basic interaction on homepage
            await this.page.evaluate(() => {
                // Simulate mouse movement with lower-level approach
                // @ts-ignore - document is available in browser context
                const event = document.createEvent('MouseEvents');
                event.initMouseEvent('mousemove', true, true, window,
                    0, 0, 0, Math.random() * window.innerWidth, Math.random() * window.innerHeight,
                    false, false, false, false, 0, null);
                window.dispatchEvent(event);
            });
            
            await new Promise(resolve => setTimeout(resolve, randomDelay(500, 1500)));

            // Now navigate to the search results
            await this.page.goto(searchUrl.toString(), { waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(resolve => setTimeout(resolve, randomDelay(2000, 4000)));

            // Simulate realistic reading behavior with scrolling
            await this.page.evaluate(async () => {
                // Simulate reading the page from top
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
                
                // Realistic scrolling behavior
                const scrollStep = () => {
                    const step = 50 + Math.random() * 100; // Larger, more human-like scrolls
                    window.scrollBy(0, step);
                    // @ts-ignore - document is available in browser context
                    return document.documentElement.scrollTop;
                };

                const maxScroll = Math.min(
                    // @ts-ignore - document is available in browser context
                    document.documentElement.scrollHeight - window.innerHeight,
                    800 // Reduced to avoid looking like aggressive bot behavior
                );

                let currentScroll = 0;
                let scrollCount = 0;
                while (currentScroll < maxScroll && scrollCount < 5) { // Limit scrolls
                    currentScroll = scrollStep();
                    scrollCount++;
                    // Variable delays between scrolls (250ms to 800ms)
                    await new Promise(resolve => setTimeout(resolve, 250 + Math.random() * 550));
                    
                    // Sometimes pause as if reading
                    if (Math.random() > 0.7) {
                        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
                    }
                }
            });

            // Check for captcha/detection with more sophisticated detection
            const pageContent = await this.page.content();
            const pageTitle = await this.page.title();
            
            const detectionIndicators = [
                'detected unusual traffic',
                'verify you are a human',
                'captcha',
                'blocked',
                'unusual traffic from your computer network',
                'automated requests',
                'robot'
            ];
            
            const isDetected = detectionIndicators.some(indicator => 
                pageContent.toLowerCase().includes(indicator) || 
                pageTitle.toLowerCase().includes(indicator)
            );
            
            if (isDetected) {
                this.retryCount++;
                logger.warn(`Bot detected (attempt ${this.retryCount}/${MAX_RETRIES}). Page title: ${pageTitle}`);
                
                if (this.retryCount < MAX_RETRIES) {
                    await this.close();
                    // Exponential backoff with jitter
                    const delay = RETRY_DELAY * Math.pow(2, this.retryCount - 1) + Math.random() * 5000;
                    logger.info(`Waiting ${Math.round(delay / 1000)}s before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    await this.initialize();
                    return this.scrape(searchString, region);
                }
                throw new Error(`Bot detection limit reached after ${MAX_RETRIES} retries. Last page title: ${pageTitle}`);
            }

            // Reset retry count on successful request
            this.retryCount = 0;

            // Random delay before extraction
            await new Promise(resolve => setTimeout(resolve, randomDelay(500, 1500)));

            // Extract data with random delays between operations
            const { ratings, imdbId } = await this.extractRatings();
            await new Promise(resolve => setTimeout(resolve, randomDelay(300, 800)));

            const directorName = await this.extractDirector();
            await new Promise(resolve => setTimeout(resolve, randomDelay(400, 1000)));

            const primaryWatchOptions = await this.extractWatchOptionsFromPrimarySource();
            const secondaryWatchOptions = await this.extractWatchOptionsFromSecondarySource();
            const fallbackWatchOptions = await this.extractWatchOptionsFromFallbackSource();

            const allWatchOptions = [...primaryWatchOptions, ...secondaryWatchOptions, ...fallbackWatchOptions];
            const squashedWatchOptions = this.squashWatchOptions(allWatchOptions);

            let debugText = '';
            if (!ratings.length) {
                const bodyElement = await this.page.$('body');
                if (bodyElement) {
                    debugText = (await this.extractTextFromElement(bodyElement)) || '';
                }
            }

            return {
                ratings,
                allWatchOptions: squashedWatchOptions,
                imdbId,
                directorName,
                debugText
            };
        } catch (error) {
            logger.error('Error in Google scraper:', error);
            throw error;
        }
    }

    // Static method for backward compatibility with existing code
    static async scrapeGoogleData(searchString: string, region?: string): Promise<GoogleScraperResult | null> {
        const scraper = new GoogleScraperService();
        
        try {
            logger.info('Starting Google scraper', { searchString });
            
            await scraper.initialize();
            const result = await scraper.scrape(searchString, region);
            
            logger.info('Google scraper completed successfully', {
                ratingsCount: result.ratings.length,
                watchOptionsCount: result.allWatchOptions.length,
                hasImdbId: !!result.imdbId,
                hasDirector: !!result.directorName
            });

            return result;

        } catch (error: any) {
            logger.error('Google scraper failed', error);
            // Return a result with error information for debugging
            return {
                ratings: [],
                allWatchOptions: [],
                imdbId: null,
                directorName: null,
                debugText: '',
                googleError: error.message || 'Unknown error occurred'
            };
        } finally {
            await scraper.close();
        }
    }
}
