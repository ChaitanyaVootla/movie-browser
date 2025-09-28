const fetch = require('node-fetch');
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';

// Detailed IMDb rating data
interface DetailedImdbData {
    rating: number | null;
    ratingCount: number | null;
    sourceUrl?: string;
    error?: string | null;
}

export class ImdbScraperService {
    
    /**
     * Fetches HTML content from a given URL.
     */
    private static async fetchHtml(url: string): Promise<string> {
        const response = await fetch(url, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            },
            timeout: 30000, // 30 second timeout
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        }
        
        return await response.text();
    }

    /**
     * Scrapes IMDb rating data for a given IMDb ID.
     */
    static async scrapeImdbRating(imdbId: string): Promise<DetailedImdbData> {
        const url = `https://www.imdb.com/title/${imdbId}/`;
        
        try {
            logger.info('Scraping IMDb rating', { imdbId, url });
            
            const html = await this.fetchHtml(url);
            const result = this.parseImdbHtml(html, url);
            
            logger.info('Successfully scraped IMDb rating', {
                imdbId,
                rating: result.rating,
                ratingCount: result.ratingCount,
                hasError: !!result.error
            });
            
            return result;
            
        } catch (error: any) {
            logger.error('Failed to scrape IMDb rating', { 
                imdbId, 
                url,
                error: error.message,
                stack: error.stack 
            });
            
            return {
                rating: null,
                ratingCount: null,
                sourceUrl: url,
                error: `IMDb scrape failed: ${error.message}`,
            };
        }
    }

    /**
     * Parses IMDb HTML to extract ratings data.
     * Note: Selectors are based on observed structure and may need updates.
     */
    private static parseImdbHtml(html: string, url: string): DetailedImdbData {
        try {
            const $ = cheerio.load(html);
            let rating: number | null = null;
            let ratingCount: number | null = null;
            let jsonParsed = false;

            logger.debug('Parsing IMDb HTML', { url });

            // Attempt 1: Parse JSON-LD structured data
            $('script[type="application/ld+json"]').each((_, element) => {
                try {
                    const scriptContent = $(element).html();
                    if (!scriptContent) return true; // Continue to next iteration
                    
                    const jsonData = JSON.parse(scriptContent);

                    // Check if it's the main Movie schema and has aggregateRating
                    if ((jsonData['@type'] === 'Movie' || jsonData['@type'] === 'TVSeries') && jsonData.aggregateRating) {
                        const aggRating = jsonData.aggregateRating;
                        
                        if (aggRating.ratingValue) {
                            rating = parseFloat(String(aggRating.ratingValue));
                        }
                        
                        if (aggRating.ratingCount) {
                            ratingCount = parseInt(String(aggRating.ratingCount), 10);
                        }
                        
                        // If we found both rating and count in JSON, we can likely stop
                        if (rating !== null && ratingCount !== null) {
                            jsonParsed = true;
                            logger.debug('Successfully parsed IMDb data from JSON-LD', { rating, ratingCount });
                            return false; // Exit .each loop
                        }
                    }
                } catch (e) {
                    logger.debug('Error parsing JSON-LD script tag', e);
                    // Continue trying other script tags or fall back to selectors
                }
                return true; // Continue to next iteration
            });

            // Attempt 2: Fallback to CSS Selectors if JSON-LD failed or was incomplete
            if (rating === null || ratingCount === null) {
                logger.debug('JSON-LD parsing incomplete, falling back to CSS selectors');
                
                // Selector for rating value (e.g., "8.7")
                const ratingSelector = '[data-testid="hero-rating-bar__aggregate-rating__score"] > span:first-child';
                // Selector for rating count: Last div child within the main rating container
                const ratingCountSelector =
                    'div[class*="RatingBar__RatingCount"], [data-testid="hero-rating-bar__aggregate-rating"] > div:last-child';

                const ratingStr = $(ratingSelector).first().text().trim();
                const ratingCountStr = $(ratingCountSelector).first().text().trim().toUpperCase();

                logger.debug('Extracted rating strings from selectors', { ratingStr, ratingCountStr });

                if (rating === null && ratingStr) {
                    // Only update if not found in JSON
                    const parsedRating = parseFloat(ratingStr);
                    if (!isNaN(parsedRating)) {
                        rating = parsedRating;
                    }
                }

                if (ratingCount === null && ratingCountStr) {
                    // Only update if not found in JSON
                    const numPart = parseFloat(ratingCountStr.replace(/[^0-9.]/g, ''));
                    if (!isNaN(numPart)) {
                        if (ratingCountStr.includes('M')) {
                            ratingCount = Math.round(numPart * 1000000);
                        } else if (ratingCountStr.includes('K')) {
                            ratingCount = Math.round(numPart * 1000);
                        } else {
                            const fullCount = parseInt(ratingCountStr.replace(/[^0-9]/g, ''), 10);
                            if (!isNaN(fullCount)) {
                                ratingCount = fullCount;
                            }
                        }
                    }
                }
            }

            // Basic validation
            rating = rating !== null && !isNaN(rating) ? rating : null;
            ratingCount = ratingCount !== null && !isNaN(ratingCount) ? ratingCount : null;

            if (rating === null || ratingCount === null) {
                logger.warn('Could not parse complete IMDb rating data', {
                    url,
                    rating,
                    ratingCount,
                    method: jsonParsed ? 'JSON-LD' : 'CSS selectors'
                });
            } else {
                logger.debug('Successfully parsed IMDb rating data', {
                    url,
                    rating,
                    ratingCount,
                    method: jsonParsed ? 'JSON-LD' : 'CSS selectors'
                });
            }

            return {
                rating,
                ratingCount,
                sourceUrl: url,
                error: null,
            };

        } catch (error: any) {
            logger.error('Error parsing IMDb HTML', { 
                url,
                error: error.message,
                stack: error.stack 
            });
            
            return { 
                rating: null, 
                ratingCount: null, 
                sourceUrl: url, 
                error: `IMDb parse failed: ${error.message}` 
            };
        }
    }
}
