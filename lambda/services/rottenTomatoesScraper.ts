const fetch = require('node-fetch');
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';

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

export class RottenTomatoesScraperService {
    
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
     * Scrapes Rotten Tomatoes rating data for a given URL.
     */
    static async scrapeRottenTomatoesRating(url: string): Promise<DetailedRtData> {
        try {
            logger.info('Scraping Rotten Tomatoes rating', { url });
            
            const html = await this.fetchHtml(url);
            const result = this.parseRottenTomatoesHtml(html, url);
            
            logger.info('Successfully scraped Rotten Tomatoes rating', {
                url,
                hasCritic: !!result.critic,
                hasAudience: !!result.audience,
                criticScore: result.critic?.score,
                audienceScore: result.audience?.score,
                hasError: !!result.error
            });
            
            return result;
            
        } catch (error: any) {
            logger.error('Failed to scrape Rotten Tomatoes rating', { 
                url,
                error: error.message,
                stack: error.stack 
            });
            
            return {
                critic: null,
                audience: null,
                sourceUrl: url,
                error: `Rotten Tomatoes scrape failed: ${error.message}`,
            };
        }
    }

    /**
     * Parses Rotten Tomatoes HTML to extract ratings data.
     * Returns a nested structure with critic and audience data.
     */
    private static parseRottenTomatoesHtml(html: string, url: string): DetailedRtData {
        try {
            const $ = cheerio.load(html);

            logger.debug('Parsing Rotten Tomatoes HTML', { url });

            // Variables for JSON-LD parsing
            let jsonCriticScore: number | null = null;
            let jsonAudienceScore: number | null = null;
            let jsonConsensus: string | null = null;
            let jsonAudienceConsensus: string | null = null;
            let jsonAudienceReviewCount: number | null = null;
            let jsonCriticReviewCount: number | null = null;

            // Variables for fallback parsing
            let fallbackCriticScore: number | null = null;
            let fallbackAudienceScore: number | null = null;
            let fallbackConsensus: string | null = null;
            let fallbackAudienceConsensus: string | null = null;
            let fallbackAudienceReviewCount: number | null = null;
            let fallbackCriticReviewCount: number | null = null;
            let fallbackCriticCertified: boolean | null = null;
            let fallbackCriticSentiment: string | null = null;
            let fallbackAudienceCertified: boolean | null = null;
            let fallbackAudienceSentiment: string | null = null;
            let iconCriticScore: number | null = null;
            let didFallbackParseCertifiedSentiment = false;

            // --- Attempt 1: Parse JSON-LD ---
            $('script[type="application/ld+json"]').each((_, el) => {
                try {
                    const scriptContent = $(el).html();
                    if (!scriptContent) return true; // Continue to next iteration
                    const jsonData = JSON.parse(scriptContent);

                    // Check for Movie/TVSeries type and aggregateRating (Critic Score)
                    if ((jsonData['@type'] === 'Movie' || jsonData['@type'] === 'TVSeries') && jsonData.aggregateRating) {
                        const rawCriticScore = jsonData.aggregateRating.ratingValue;
                        if (typeof rawCriticScore === 'number' || typeof rawCriticScore === 'string') {
                            jsonCriticScore = parseInt(String(rawCriticScore), 10);
                        }
                        if (
                            typeof jsonData.aggregateRating.reviewCount === 'number' ||
                            typeof jsonData.aggregateRating.reviewCount === 'string'
                        ) {
                            jsonCriticReviewCount = parseInt(String(jsonData.aggregateRating.reviewCount), 10);
                        }
                    }

                    // Some RT JSON-LD includes audience ratings separately
                    if (jsonData.audience?.aggregateRating) {
                        jsonAudienceScore = parseInt(String(jsonData.audience.aggregateRating.ratingValue), 10);
                        jsonAudienceReviewCount = parseInt(String(jsonData.audience.aggregateRating.ratingCount), 10);
                    }

                    // Extract consensus from review body or description
                    if (jsonData.review?.reviewBody) {
                        jsonConsensus = jsonData.review.reviewBody.trim();
                    } else if (
                        !jsonConsensus &&
                        typeof jsonData.description === 'string' &&
                        jsonData.description.length < 250
                    ) {
                        // Use description as fallback consensus only if short and no review body found
                        // jsonConsensus = jsonData.description.trim(); // Uncomment if desired
                    }

                    // Check if we got the main scores from JSON
                    if (
                        jsonCriticScore !== null &&
                        jsonCriticReviewCount !== null &&
                        jsonAudienceScore !== null &&
                        jsonAudienceReviewCount !== null &&
                        jsonConsensus !== null
                    ) {
                        didFallbackParseCertifiedSentiment = true;
                        return false; // Exit loop
                    }
                } catch (e) {
                    logger.debug('Error parsing JSON-LD script tag', e);
                }
                return true; // Continue to next iteration
            });

            // --- Attempt 2: Parse Fallback Selectors (media-scorecard, etc.) ---
            logger.debug('Checking RT selectors fallback for scores/certified/sentiment');
            
            const scoreCard = $('media-scorecard');
            if (scoreCard.length > 0) {
                // Extract critic score
                const scoreElement = scoreCard.find('rt-text[slot="criticsScore"]').first();
                const scoreText = scoreElement.text().trim();
                fallbackCriticScore = scoreText ? parseInt(scoreText.replace('%', ''), 10) : null;
                if (scoreText && isNaN(fallbackCriticScore ?? NaN)) {
                    fallbackCriticScore = null;
                }

                // Extract critic review count
                const criticCountText = scoreCard.find('rt-link[slot="criticsReviews"]').first().text().trim();
                fallbackCriticReviewCount = criticCountText ? parseInt(criticCountText.replace(/[^0-9]/g, ''), 10) : null;

                // Extract audience score
                const audienceScoreText = scoreCard.find('rt-text[slot="audienceScore"]').first().text().trim();
                fallbackAudienceScore = audienceScoreText ? parseInt(audienceScoreText.replace('%', ''), 10) : null;

                // Extract audience review count
                const audienceCountText = scoreCard.find('rt-link[slot="audienceReviews"]').first().text().trim();
                const audienceMatch = audienceCountText.match(/^[0-9,]+/);
                fallbackAudienceReviewCount = audienceMatch ? parseInt(audienceMatch[0].replace(/,/g, ''), 10) : null;

                // Extract critic icon attributes
                const criticIcon = scoreCard.find('score-icon-critics');
                fallbackCriticCertified = criticIcon.attr('certified') === 'true';
                fallbackCriticSentiment = criticIcon.attr('sentiment') || null;
                const iconScoreAttr = criticIcon.attr('score');
                if (iconScoreAttr) {
                    iconCriticScore = parseInt(iconScoreAttr, 10);
                    if (isNaN(iconCriticScore)) {
                        iconCriticScore = null;
                    }
                }

                // Extract audience icon attributes
                const audienceIcon = scoreCard.find('score-icon-audience');
                fallbackAudienceCertified = audienceIcon.attr('certified') === 'true';
                fallbackAudienceSentiment = audienceIcon.attr('sentiment') || null;

                // Mark if we successfully parsed certified/sentiment via fallback
                if (fallbackCriticCertified !== null && fallbackCriticSentiment !== null) {
                    didFallbackParseCertifiedSentiment = true;
                }

                logger.debug('Extracted data from media-scorecard', {
                    fallbackCriticScore,
                    fallbackAudienceScore,
                    fallbackCriticCertified,
                    fallbackCriticSentiment,
                    iconCriticScore
                });
            } else {
                logger.warn('Could not find media-scorecard element for fallback parsing');
            }

            // Parse fallback consensus
            fallbackConsensus =
                $('#critics-consensus p').first().text().trim() ||
                $('[data-qa="critics-consensus"] p').first().text().trim();
            if (!fallbackConsensus) {
                fallbackConsensus = $('.consensus-text')
                    .text()
                    .trim()
                    .replace(/^Critics Consensus:\s*/i, '');
            }

            // Parse audience consensus
            fallbackAudienceConsensus =
                $('#audience-consensus p').first().text().trim() ||
                $('[data-qa="audience-consensus"] p').first().text().trim();
            if (!fallbackAudienceConsensus) {
                fallbackAudienceConsensus = $('#audience-consensus .consensus-text')
                    .text()
                    .trim()
                    .replace(/^Audience Says:\s*/i, '');
            }

            // --- Decision Logic & Structure Assembly ---
            let finalCriticScore: number | null;
            if (iconCriticScore !== null) {
                finalCriticScore = iconCriticScore;
            } else if (didFallbackParseCertifiedSentiment && fallbackCriticScore !== null) {
                finalCriticScore = fallbackCriticScore;
            } else {
                finalCriticScore = jsonCriticScore ?? fallbackCriticScore;
            }
            
            const finalCriticCount = jsonCriticReviewCount ?? fallbackCriticReviewCount;
            const finalAudienceScore = jsonAudienceScore ?? fallbackAudienceScore;
            const finalAudienceCount = jsonAudienceReviewCount ?? fallbackAudienceReviewCount;
            const finalConsensus = jsonConsensus ?? fallbackConsensus;
            const finalAudienceConsensus = jsonAudienceConsensus ?? fallbackAudienceConsensus;
            const finalCriticCertified = fallbackCriticCertified;
            const finalCriticSentiment = fallbackCriticSentiment;
            const finalAudienceCertified = fallbackAudienceCertified;
            const finalAudienceSentiment = fallbackAudienceSentiment;

            // Validate final values
            const validatedCriticScore = finalCriticScore !== null && !isNaN(finalCriticScore) ? finalCriticScore : null;
            const validatedCriticCount = finalCriticCount !== null && !isNaN(finalCriticCount) ? finalCriticCount : null;
            const validatedAudienceScore =
                finalAudienceScore !== null && !isNaN(finalAudienceScore) ? finalAudienceScore : null;
            const validatedAudienceCount =
                finalAudienceCount !== null && !isNaN(finalAudienceCount) ? finalAudienceCount : null;

            const criticData: DetailedRtCriticData = {
                score: validatedCriticScore,
                ratingCount: validatedCriticCount,
                certified: finalCriticCertified,
                sentiment: finalCriticSentiment,
                consensus: finalConsensus || null,
            };

            const audienceData: DetailedRtAudienceData = {
                score: validatedAudienceScore,
                ratingCount: validatedAudienceCount,
                certified: finalAudienceCertified,
                sentiment: finalAudienceSentiment,
                consensus: finalAudienceConsensus || null,
            };

            logger.debug('Parsed Rotten Tomatoes data', {
                url,
                criticData,
                audienceData
            });

            return {
                critic:
                    criticData.score !== null || criticData.ratingCount !== null || criticData.consensus !== null
                        ? criticData
                        : null,
                audience: audienceData.score !== null || audienceData.ratingCount !== null || audienceData.consensus !== null
                        ? audienceData
                        : null,
                sourceUrl: url,
                error: null,
            };

        } catch (error: any) {
            logger.error('Error parsing Rotten Tomatoes HTML', { 
                url,
                error: error.message,
                stack: error.stack 
            });
            
            return {
                critic: null,
                audience: null,
                sourceUrl: url,
                error: `Rotten Tomatoes parse failed: ${error.message}`,
            };
        }
    }
}
