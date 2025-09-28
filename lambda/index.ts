import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GoogleScraperService } from './services/googleScraper';
import { FastGoogleScraperService } from './services/fastGoogleScraper';
import { WikidataService } from './services/wikidataService';
import { ImdbScraperService } from './services/imdbScraper';
import { RottenTomatoesScraperService } from './services/rottenTomatoesScraper';
import { logger } from './utils/logger';

// Input interface
interface ScraperInput {
    wikidataId?: string;
    tmdbId?: string;
    imdbId?: string;
    searchString: string; // For Google search
    mediaType?: 'movie' | 'tv'; // For determining RT URL structure
    googleScraperMode?: 'fast' | 'complex'; // Choose Google scraper type - defaults to 'fast', if not provided skips Google scraping
}

// Legacy rating format for backward compatibility
interface LegacyRating {
    rating: string;
    name: string;
    link: string;
}

// Legacy watch option format for backward compatibility
interface LegacyWatchOption {
    link: string;
    name: string;
    price?: string;
}

// Detailed IMDb rating data
interface DetailedImdbData {
    rating: number | null;
    ratingCount: number | null;
    sourceUrl?: string;
    error?: string | null;
}

// Detailed RT critic data
interface DetailedRtCriticData {
    score: number | null;
    ratingCount: number | null;
    certified: boolean | null;
    sentiment: string | null;
    consensus?: string | null;
}

// Detailed RT audience data
interface DetailedRtAudienceData {
    score: number | null;
    ratingCount: number | null;
    certified: boolean | null;
    sentiment: string | null;
    consensus?: string | null;
}

// Detailed RT data
interface DetailedRtData {
    critic: DetailedRtCriticData | null;
    audience: DetailedRtAudienceData | null;
    sourceUrl?: string;
    error?: string | null;
}

// External IDs from Wikidata
interface ExternalIds {
    imdb_id?: string | null;
    tmdb_id?: string | null;
    rottentomatoes_id?: string | null;
    metacritic_id?: string | null;
    letterboxd_id?: string | null;
    netflix_id?: string | null;
    prime_id?: string | null;
    apple_id?: string | null;
    hotstar_id?: string | null;
}

// Response structure maintaining backward compatibility
interface ScraperResponse {
    ratings: LegacyRating[];
    allWatchOptions: LegacyWatchOption[];
    imdbId: string | null;
    directorName: string | null;
    externalIds: ExternalIds;
    detailedRatings: {
        imdb: DetailedImdbData | null;
        rottenTomatoes: DetailedRtData | null;
    };
    debugText?: string;
    googleError?: string; // Added for better debugging
}

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    try {
        logger.info('Lambda handler started', { event: event.queryStringParameters });

        // Parse input
        const input: ScraperInput = {
            wikidataId: event.queryStringParameters?.wikidataId,
            tmdbId: event.queryStringParameters?.tmdbId,
            imdbId: event.queryStringParameters?.imdbId,
            searchString: event.queryStringParameters?.searchString || '',
            mediaType: event.queryStringParameters?.mediaType as 'movie' | 'tv' || 'movie', // Default to movie if not specified
            googleScraperMode: event.queryStringParameters?.googleScraperMode as 'fast' | 'complex' // No default - if not provided, skips Google scraping
        };

        if (!input.searchString) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'searchString is required'
                })
            };
        }

        // Initialize response structure
        const response: ScraperResponse = {
            ratings: [],
            allWatchOptions: [],
            imdbId: input.imdbId || null,
            directorName: null,
            externalIds: {},
            detailedRatings: {
                imdb: null,
                rottenTomatoes: null
            }
        };

        // Run all scrapers in parallel where possible
        const scraperPromises = [];

        // 1. Google scraper (legacy format for backward compatibility) - only if googleScraperMode is specified
        if (input.googleScraperMode) {
            // Configure residential proxies if available (see PROXY_SETUP.md)
            const proxyList = [];
            if (process.env.PROXY_ENDPOINT_1 && process.env.PROXY_USERNAME) {
                const [host1, port1] = process.env.PROXY_ENDPOINT_1.split(':');
                proxyList.push({
                    host: host1,
                    port: parseInt(port1),
                    username: process.env.PROXY_USERNAME,
                    password: process.env.PROXY_PASSWORD
                });
            }
            if (process.env.PROXY_ENDPOINT_2 && process.env.PROXY_USERNAME) {
                const [host2, port2] = process.env.PROXY_ENDPOINT_2.split(':');
                proxyList.push({
                    host: host2,
                    port: parseInt(port2),
                    username: process.env.PROXY_USERNAME,
                    password: process.env.PROXY_PASSWORD
                });
            }

            scraperPromises.push(
                (async () => {
                    try {
                        let googleData;
                        
                        if (input.googleScraperMode === 'complex') {
                            // Use complex scraper with full stealth features
                            logger.info('Using complex Google scraper with full stealth features');
                            if (proxyList.length > 0) {
                                const scraper = new GoogleScraperService(proxyList);
                                await scraper.initialize();
                                googleData = await scraper.scrape(input.searchString);
                                await scraper.close();
                            } else {
                                googleData = await GoogleScraperService.scrapeGoogleData(input.searchString);
                            }
                        } else {
                            // Use fast scraper - optimized for speed and cost
                            logger.info('Using fast Google scraper - optimized for speed');
                            if (proxyList.length > 0) {
                                const scraper = new FastGoogleScraperService(proxyList);
                                await scraper.initialize();
                                googleData = await scraper.scrape(input.searchString);
                                await scraper.close();
                            } else {
                                googleData = await FastGoogleScraperService.scrapeGoogleData(input.searchString);
                            }
                        }
                        
                        if (googleData) {
                            response.ratings = googleData.ratings || [];
                            response.allWatchOptions = googleData.allWatchOptions || [];
                            response.imdbId = googleData.imdbId || response.imdbId;
                            response.directorName = googleData.directorName || null;
                            response.debugText = googleData.debugText;
                            response.googleError = googleData.googleError; // Include Google error for debugging
                        }
                    } catch (error: any) {
                        logger.error(`Google scraper (${input.googleScraperMode}) failed`, error);
                        response.googleError = error.message || 'Google scraper failed';
                        // Don't fail the whole request
                    }
                })()
            );
        } else {
            logger.info('Skipping Google scraping - googleScraperMode not specified');
        }

        // 2. Wikidata service (for external IDs)
        let wikidataPromise = Promise.resolve();
        if (input.wikidataId) {
            wikidataPromise = WikidataService.fetchExternalIds(input.wikidataId)
                .then(externalIds => {
                    response.externalIds = { ...response.externalIds, ...externalIds };
                })
                .catch(error => {
                    logger.error('Wikidata service failed', error);
                    // Don't fail the whole request
                });
            scraperPromises.push(wikidataPromise);
        }

        // Wait for initial scrapers to complete
        await Promise.allSettled(scraperPromises);

        // 3. Direct IMDb scraping (enhanced ratings)
        const finalImdbId = response.externalIds.imdb_id || response.imdbId;
        if (finalImdbId) {
            try {
                const imdbData = await ImdbScraperService.scrapeImdbRating(finalImdbId);
                response.detailedRatings.imdb = imdbData;
            } catch (error) {
                logger.error('IMDb scraper failed', error);
                // Don't fail the whole request
            }
        }

        // 4. Direct Rotten Tomatoes scraping (enhanced ratings)
        const rtId = response.externalIds.rottentomatoes_id;
        if (rtId) {
            try {
                // Determine URL prefix based on media type
                const urlPrefix = input.mediaType === 'tv' ? 'tv' : 'm';
                
                // Handle RT IDs that may or may not already include the prefix
                let rtUrl: string;
                if (rtId.startsWith('m/') || rtId.startsWith('tv/')) {
                    rtUrl = `https://www.rottentomatoes.com/${rtId}`;
                } else {
                    rtUrl = `https://www.rottentomatoes.com/${urlPrefix}/${rtId}`;
                }
                
                const rtData = await RottenTomatoesScraperService.scrapeRottenTomatoesRating(rtUrl);
                response.detailedRatings.rottenTomatoes = rtData;
            } catch (error) {
                logger.error('Rotten Tomatoes scraper failed', error);
                // Don't fail the whole request
            }
        }

        logger.info('Lambda handler completed successfully', {
            ratingsCount: response.ratings.length,
            watchOptionsCount: response.allWatchOptions.length,
            hasDetailedImdb: !!response.detailedRatings.imdb,
            hasDetailedRt: !!response.detailedRatings.rottenTomatoes
        });

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(response)
        };

    } catch (error: any) {
        logger.error('Lambda handler error', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};
