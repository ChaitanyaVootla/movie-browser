const fetch = require('node-fetch');
import { logger } from '../utils/logger';

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

export class WikidataService {
    
    /**
     * Fetches external IDs for a movie from Wikidata using its Wikidata ID (e.g., Q12345).
     * Returns a map of external IDs (imdb, tmdb, rottentomatoes, metacritic, letterboxd, netflix, prime, apple, hotstar).
     */
    static async fetchExternalIds(wikidataId: string): Promise<ExternalIds> {
        try {
            logger.info('Fetching external IDs from Wikidata', { wikidataId });

            // SPARQL query for a single movie by Wikidata ID
            const query = `
                SELECT DISTINCT ?movie (SAMPLE(?imdbId) AS ?imdbId) (SAMPLE(?tmdbId) AS ?tmdbId)
                    (SAMPLE(?rottentomatoesId) AS ?rottentomatoesId) (SAMPLE(?metacriticId) AS ?metacriticId)
                    (SAMPLE(?letterboxdId) AS ?letterboxdId) (SAMPLE(?netflixId) AS ?netflixId)
                    (SAMPLE(?primeVideoId) AS ?primeVideoId) (SAMPLE(?appleId) AS ?appleId)
                    (SAMPLE(?hotstarId) AS ?hotstarId)
                WHERE {
                    BIND(wd:${wikidataId} AS ?movie)
                    OPTIONAL { ?movie wdt:P345 ?imdbId. }
                    OPTIONAL { ?movie wdt:P4947 ?tmdbId. }
                    OPTIONAL { ?movie wdt:P1258 ?rottentomatoesId. }
                    OPTIONAL { ?movie wdt:P1712 ?metacriticId. }
                    OPTIONAL { ?movie wdt:P6127 ?letterboxdId. }
                    OPTIONAL { ?movie wdt:P1874 ?netflixId. }
                    OPTIONAL { ?movie wdt:P8055 ?primeVideoId. }
                    OPTIONAL { ?movie wdt:P9586 ?appleId. }
                    OPTIONAL { ?movie wdt:P11049 ?hotstarId. }
                }
                GROUP BY ?movie
            `;

            const url = 'https://query.wikidata.org/sparql';
            const params = new URLSearchParams({
                query,
                format: 'json',
            });

            logger.debug('Executing Wikidata SPARQL query', { 
                url: `${url}?${params.toString()}`,
                wikidataId 
            });

            const response = await fetch(`${url}?${params.toString()}`, {
                headers: {
                    'Accept': 'application/sparql-results+json',
                    'User-Agent': 'movie-browser-api/1.0 (https://github.com/your-repo)',
                },
                timeout: 10000, // 10 second timeout
            });

            if (!response.ok) {
                throw new Error(`Wikidata SPARQL query failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const bindings = data.results.bindings[0];

            if (!bindings) {
                logger.warn('No results found in Wikidata for ID', { wikidataId });
                return {};
            }

            // Map the results to a simple object
            const externalIds: ExternalIds = {
                imdb_id: bindings?.imdbId?.value || null,
                tmdb_id: bindings?.tmdbId?.value || null,
                rottentomatoes_id: bindings?.rottentomatoesId?.value || null,
                metacritic_id: bindings?.metacriticId?.value || null,
                letterboxd_id: bindings?.letterboxdId?.value || null,
                netflix_id: bindings?.netflixId?.value || null,
                prime_id: bindings?.primeVideoId?.value || null,
                apple_id: bindings?.appleId?.value || null,
                hotstar_id: bindings?.hotstarId?.value || null,
            };

            // Filter out null values for cleaner response
            const filteredIds: ExternalIds = {};
            Object.entries(externalIds).forEach(([key, value]) => {
                if (value !== null && value !== undefined) {
                    filteredIds[key as keyof ExternalIds] = value;
                }
            });

            logger.info('Successfully fetched external IDs from Wikidata', { 
                wikidataId,
                idsFound: Object.keys(filteredIds).length,
                ids: filteredIds
            });

            return filteredIds;

        } catch (error: any) {
            logger.error('Failed to fetch external IDs from Wikidata', { 
                wikidataId, 
                error: error.message,
                stack: error.stack 
            });
            return {};
        }
    }

    /**
     * Alternative method to search Wikidata by title and year if no Wikidata ID is available
     * This is more complex and less reliable, so it's optional
     */
    static async searchByTitleAndYear(title: string, year?: number): Promise<ExternalIds> {
        try {
            logger.info('Searching Wikidata by title and year', { title, year });

            // SPARQL query to search by title (and optionally year)
            const yearFilter = year ? `FILTER(YEAR(?publicationDate) = ${year})` : '';
            
            const query = `
                SELECT DISTINCT ?movie ?movieLabel (SAMPLE(?imdbId) AS ?imdbId) (SAMPLE(?tmdbId) AS ?tmdbId)
                    (SAMPLE(?rottentomatoesId) AS ?rottentomatoesId) (SAMPLE(?metacriticId) AS ?metacriticId)
                    (SAMPLE(?letterboxdId) AS ?letterboxdId) (SAMPLE(?netflixId) AS ?netflixId)
                    (SAMPLE(?primeVideoId) AS ?primeVideoId) (SAMPLE(?appleId) AS ?appleId)
                    (SAMPLE(?hotstarId) AS ?hotstarId)
                WHERE {
                    ?movie wdt:P31/wdt:P279* wd:Q11424. # Instance of film
                    ?movie rdfs:label ?movieLabel.
                    FILTER(LANG(?movieLabel) = "en")
                    FILTER(CONTAINS(LCASE(?movieLabel), "${title.toLowerCase()}"))
                    
                    OPTIONAL { ?movie wdt:P577 ?publicationDate. }
                    ${yearFilter}
                    
                    OPTIONAL { ?movie wdt:P345 ?imdbId. }
                    OPTIONAL { ?movie wdt:P4947 ?tmdbId. }
                    OPTIONAL { ?movie wdt:P1258 ?rottentomatoesId. }
                    OPTIONAL { ?movie wdt:P1712 ?metacriticId. }
                    OPTIONAL { ?movie wdt:P6127 ?letterboxdId. }
                    OPTIONAL { ?movie wdt:P1874 ?netflixId. }
                    OPTIONAL { ?movie wdt:P8055 ?primeVideoId. }
                    OPTIONAL { ?movie wdt:P9586 ?appleId. }
                    OPTIONAL { ?movie wdt:P11049 ?hotstarId. }
                }
                GROUP BY ?movie ?movieLabel
                LIMIT 1
            `;

            const url = 'https://query.wikidata.org/sparql';
            const params = new URLSearchParams({
                query,
                format: 'json',
            });

            logger.debug('Executing Wikidata search query', { 
                url: `${url}?${params.toString()}`,
                title,
                year 
            });

            const response = await fetch(`${url}?${params.toString()}`, {
                headers: {
                    'Accept': 'application/sparql-results+json',
                    'User-Agent': 'movie-browser-api/1.0 (https://github.com/your-repo)',
                },
                timeout: 15000, // 15 second timeout for search queries
            });

            if (!response.ok) {
                throw new Error(`Wikidata search query failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const bindings = data.results.bindings[0];

            if (!bindings) {
                logger.warn('No results found in Wikidata search', { title, year });
                return {};
            }

            // Map the results to a simple object
            const externalIds: ExternalIds = {
                imdb_id: bindings?.imdbId?.value || null,
                tmdb_id: bindings?.tmdbId?.value || null,
                rottentomatoes_id: bindings?.rottentomatoesId?.value || null,
                metacritic_id: bindings?.metacriticId?.value || null,
                letterboxd_id: bindings?.letterboxdId?.value || null,
                netflix_id: bindings?.netflixId?.value || null,
                prime_id: bindings?.primeVideoId?.value || null,
                apple_id: bindings?.appleId?.value || null,
                hotstar_id: bindings?.hotstarId?.value || null,
            };

            // Filter out null values for cleaner response
            const filteredIds: ExternalIds = {};
            Object.entries(externalIds).forEach(([key, value]) => {
                if (value !== null && value !== undefined) {
                    filteredIds[key as keyof ExternalIds] = value;
                }
            });

            logger.info('Successfully found external IDs via Wikidata search', { 
                title,
                year,
                movieLabel: bindings?.movieLabel?.value,
                idsFound: Object.keys(filteredIds).length,
                ids: filteredIds
            });

            return filteredIds;

        } catch (error: any) {
            logger.error('Failed to search Wikidata by title and year', { 
                title, 
                year,
                error: error.message,
                stack: error.stack 
            });
            return {};
        }
    }
}
