#!/usr/bin/env node

/**
 * Standalone Sitemap Generator
 * 
 * Generates optimized sitemaps for The Movie Browser without relying on database.
 * Uses TMDB daily export to get top content by popularity.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import zlib from 'zlib';
import { createReadStream, createWriteStream } from 'fs';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read data directly from TypeScript files
function extractExportedData(filePath, exportName) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const regex = new RegExp(`export const ${exportName}\\s*=\\s*([\\s\\S]*?);`, 'g');
    const match = regex.exec(content);
    if (match) {
        try {
            // Simple eval for object literals (risky but controlled environment)
            return eval(`(${match[1]})`);
        } catch (e) {
            console.warn(`Failed to parse ${exportName} from ${filePath}`);
            return null;
        }
    }
    return null;
}

// Read constants from TypeScript files
const constantsPath = path.resolve(__dirname, '../utils/constants.ts');
const movieGenres = extractExportedData(constantsPath, 'movieGenres') || {};
const seriesGenres = extractExportedData(constantsPath, 'seriesGenres') || {};

// Read themes data
const themesPath = path.resolve(__dirname, '../utils/topics/themes/themes.json');
const themes = JSON.parse(fs.readFileSync(themesPath, 'utf-8'));

const BASE_URL = 'https://themoviebrowser.com';
const DATA_DIR = path.resolve(__dirname, '../data');
const SITEMAPS_DIR = path.resolve(__dirname, '../sitemaps');

// Configuration - Simplified: Just pick top entries by popularity
const CONFIG = {
    MOVIES_LIMIT: 5000,   // Top 5K movies by popularity
    SERIES_LIMIT: 5000,   // Top 5K series by popularity
    PERSONS_LIMIT: 5000,  // Top 5K persons by popularity (increased from 2K)
    CHUNK_SIZE: 1000,     // Process items in chunks to manage memory
    MAX_RETRIES: 3,       // Maximum retry attempts for downloads
    RETRY_DELAY: 5000,    // Delay between retries in milliseconds
};

/**
 * Helper functions to generate topic keys (matching the app logic)
 */
function getTopicKey(prefix, name, media) {
    const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return media ? `${prefix}-${sanitized}-${media}` : `${prefix}-${sanitized}`;
}

function getUrlSlugFromKey(key) {
    // Convert topic key to URL slug (reverse engineering from the app)
    return key.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

/**
 * Generate all available topic routes
 */
function generateAllTopicRoutes() {
    const topics = [];
    
    // 1. Genre-based topics (from movieGenres) - Premium priorities for traffic drivers
    const topGenreNames = ['Action', 'Comedy', 'Drama', 'Horror'];  // Top 4 traffic drivers
    const popularGenreNames = ['Romance', 'Thriller', 'Adventure', 'Crime', 'Science Fiction'];
    
    Object.values(movieGenres).forEach(genre => {
        const genreKey = getTopicKey('genre', genre.name, 'movie');
        const isTopGenre = topGenreNames.includes(genre.name);
        const isPopular = popularGenreNames.includes(genre.name);
        
        topics.push({
            url: `/topics/${getUrlSlugFromKey(genreKey)}`,
            priority: isTopGenre ? '1.0' :      // Top 4 genres get priority 1.0
                     isPopular ? '0.9' :        // Popular genres get 0.9
                     '0.8',                     // Other genres get 0.8
            changefreq: 'daily'
        });
    });
    
    // 2. Theme-based topics (from themes.json) - Premium themes only
    const topThemeNames = ['Zombie', 'Vampire', 'Superhero', 'Christmas'];  // Top themes that drive traffic
    const popularThemeNames = ['Space', 'War', 'Time Travel', 'Dystopian'];
    
    themes.slice(0, 15).forEach(theme => {  // Limit to top 15 themes for premium quality
        const isTopTheme = topThemeNames.includes(theme.name);
        const isPopular = popularThemeNames.includes(theme.name);
        
        // Movie themes
        const movieThemeKey = getTopicKey('theme', theme.name, 'movie');
        topics.push({
            url: `/topics/${getUrlSlugFromKey(movieThemeKey)}`,
            priority: isTopTheme ? '1.0' :     // Top themes get priority 1.0
                     isPopular ? '0.8' :      // Popular themes get 0.8
                     '0.7',                   // Standard themes get 0.7
            changefreq: 'daily'
        });
        
        // TV themes  
        const tvThemeKey = getTopicKey('theme', theme.name, 'tv');
        topics.push({
            url: `/topics/${getUrlSlugFromKey(tvThemeKey)}`,
            priority: isTopTheme ? '1.0' :     // Top themes get priority 1.0
                     isPopular ? '0.8' :      // Popular themes get 0.8  
                     '0.7',                   // Standard themes get 0.7
            changefreq: 'daily'
        });
    });
    
    return topics;
}

// Static routes to include in sitemap - Premium SEO priorities 
const STATIC_ROUTES = [
    { url: '/', priority: '1.0', changefreq: 'daily' },           // Homepage - absolute priority
    { url: '/browse', priority: '1.0', changefreq: 'daily' },     // Main discovery engine - priority 1.0
    { url: '/topics', priority: '1.0', changefreq: 'daily' },     // Topics hub - priority 1.0 (major traffic driver)
    { url: '/topics/all', priority: '0.9', changefreq: 'daily' }, // All topics listing - very high
    { url: '/movie', priority: '0.9', changefreq: 'daily' },      // Movie section hub - very high  
    { url: '/series', priority: '0.9', changefreq: 'daily' },     // Series section hub - very high
];

/**
 * Get safe date for TMDB files
 */
function getSafeDate() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}_${day}_${date.getFullYear()}`;
}

/**
 * Sleep function for retry delays
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Download and extract TMDB data file with retry logic
 */
async function downloadTMDBFile(type, retryCount = 0) {
    const date = getSafeDate();
    const fileName = `${type}_ids_${date}.json.gz`;
    const url = `https://files.tmdb.org/p/exports/${fileName}`;
    const outputPath = path.join(DATA_DIR, fileName);
    const extractedPath = path.join(DATA_DIR, `${type}_ids_${date}.json`);
    
    console.log(`📥 Downloading ${type} data: ${fileName} (attempt ${retryCount + 1}/${CONFIG.MAX_RETRIES + 1})`);
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Skip if already exists
    if (fs.existsSync(extractedPath)) {
        console.log(`✅ ${type} data already exists, skipping download`);
        return extractedPath;
    }
    
    return new Promise((resolve, reject) => {
        const file = createWriteStream(outputPath);
        
        const request = https.get(url, (response) => {
            if (response.statusCode !== 200) {
                file.destroy();
                
                // Cleanup partial file
                if (fs.existsSync(outputPath)) {
                    fs.unlinkSync(outputPath);
                }
                
                const error = new Error(`Failed to download ${fileName}: ${response.statusCode}`);
                
                // Retry logic
                if (retryCount < CONFIG.MAX_RETRIES) {
                    console.log(`⚠️ Download failed, retrying in ${CONFIG.RETRY_DELAY/1000}s...`);
                    sleep(CONFIG.RETRY_DELAY).then(() => {
                        downloadTMDBFile(type, retryCount + 1).then(resolve).catch(reject);
                    });
                } else {
                    reject(error);
                }
                return;
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log(`📦 Extracting ${fileName}`);
                
                try {
                    // Extract the gzipped file with streaming
                    const readStream = createReadStream(outputPath);
                    const writeStream = createWriteStream(extractedPath);
                    const gunzip = zlib.createGunzip();
                    
                    readStream.pipe(gunzip).pipe(writeStream);
                    
                    writeStream.on('finish', () => {
                        try {
                            fs.unlinkSync(outputPath); // Remove compressed file
                            console.log(`✅ Extracted ${type} data`);
                            resolve(extractedPath);
                        } catch (cleanupError) {
                            console.warn(`⚠️ Failed to cleanup compressed file: ${cleanupError.message}`);
                            resolve(extractedPath); // Still resolve as extraction succeeded
                        }
                    });
                    
                    writeStream.on('error', (error) => {
                        // Cleanup on extraction error
                        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                        if (fs.existsSync(extractedPath)) fs.unlinkSync(extractedPath);
                        
                        if (retryCount < CONFIG.MAX_RETRIES) {
                            console.log(`⚠️ Extraction failed, retrying in ${CONFIG.RETRY_DELAY/1000}s...`);
                            sleep(CONFIG.RETRY_DELAY).then(() => {
                                downloadTMDBFile(type, retryCount + 1).then(resolve).catch(reject);
                            });
                        } else {
                            reject(error);
                        }
                    });
                } catch (error) {
                    reject(error);
                }
            });
            
            file.on('error', (error) => {
                // Cleanup on download error
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                
                if (retryCount < CONFIG.MAX_RETRIES) {
                    console.log(`⚠️ Download error, retrying in ${CONFIG.RETRY_DELAY/1000}s...`);
                    sleep(CONFIG.RETRY_DELAY).then(() => {
                        downloadTMDBFile(type, retryCount + 1).then(resolve).catch(reject);
                    });
                } else {
                    reject(error);
                }
            });
        });
        
        request.on('error', (error) => {
            // Cleanup on request error
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            
            if (retryCount < CONFIG.MAX_RETRIES) {
                console.log(`⚠️ Request error, retrying in ${CONFIG.RETRY_DELAY/1000}s...`);
                sleep(CONFIG.RETRY_DELAY).then(() => {
                    downloadTMDBFile(type, retryCount + 1).then(resolve).catch(reject);
                });
            } else {
                reject(error);
            }
        });
        
        // Set timeout for the request
        request.setTimeout(300000, () => { // 5 minutes timeout
            request.destroy();
            
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            
            if (retryCount < CONFIG.MAX_RETRIES) {
                console.log(`⚠️ Download timeout, retrying in ${CONFIG.RETRY_DELAY/1000}s...`);
                sleep(CONFIG.RETRY_DELAY).then(() => {
                    downloadTMDBFile(type, retryCount + 1).then(resolve).catch(reject);
                });
            } else {
                reject(new Error(`Download timeout after ${CONFIG.MAX_RETRIES + 1} attempts`));
            }
        });
    });
}

/**
 * Stream and parse TMDB data file with memory optimization
 */
async function streamTMDBData(filePath, filterFn, limit) {
    console.log(`📖 Streaming data from ${filePath}`);
    
    return new Promise((resolve, reject) => {
        const results = [];
        let lineCount = 0;
        
        const fileStream = createReadStream(filePath);
        const rl = createInterface({
            input: fileStream,
            crlfDelay: Infinity // Handle Windows line endings
        });
        
        rl.on('line', (line) => {
            lineCount++;
            
            try {
                const item = JSON.parse(line.trim());
                
                // Apply filter and collect all valid entries
                if (item && filterFn(item)) {
                    results.push(item);
                    // Process entire file since TMDB files are sorted by ID, not popularity
                }
                
                // Log progress for large datasets
                if (lineCount % 50000 === 0) {
                    console.log(`   Progress: ${lineCount} lines read, ${results.length} valid entries`);
                }
                
            } catch (e) {
                // Skip invalid lines silently for performance
            }
        });
        
        rl.on('close', () => {
            console.log(`✅ Stream completed: ${lineCount} lines processed, ${results.length} valid entries`);
            
            // Sort by popularity and take top entries
            const sortedResults = results
                .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
                .slice(0, limit);
            
            console.log(`📊 Returning top ${sortedResults.length} entries by popularity`);
            resolve(sortedResults);
        });
        
        rl.on('error', (error) => {
            console.error(`❌ Error streaming TMDB data from ${filePath}:`, error.message);
            reject(error);
        });
    });
}

/**
 * Generate URL slug from title
 */
function getUrlSlug(title) {
    if (!title) return '';
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

/**
 * Create XML sitemap with streaming/chunked generation
 */
function createSitemap(urls, filename) {
    console.log(`📝 Creating sitemap: ${filename} with ${urls.length} URLs`);
    
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const filePath = path.join(SITEMAPS_DIR, filename);
    const writeStream = createWriteStream(filePath);
    
    // Write XML header
    writeStream.write('<?xml version="1.0" encoding="UTF-8"?>\n');
    writeStream.write('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n');
    
    // Process URLs in chunks to manage memory
    const chunkSize = CONFIG.CHUNK_SIZE;
    for (let i = 0; i < urls.length; i += chunkSize) {
        const chunk = urls.slice(i, i + chunkSize);
        
        let chunkXml = '';
        chunk.forEach(({ url, priority = '0.5', changefreq = 'daily', lastmod }) => {
            chunkXml += '  <url>\n';
            chunkXml += `    <loc>${BASE_URL}${url}</loc>\n`;
            chunkXml += `    <lastmod>${lastmod || currentDate}</lastmod>\n`;
            chunkXml += `    <changefreq>${changefreq}</changefreq>\n`;
            chunkXml += `    <priority>${priority}</priority>\n`;
            chunkXml += '  </url>\n';
        });
        
        writeStream.write(chunkXml);
        
        // Clear chunk from memory
        chunkXml = null;
        
        // Log progress for large sitemaps
        if ((i + chunkSize) % (chunkSize * 10) === 0) {
            console.log(`   Progress: ${Math.min(i + chunkSize, urls.length)}/${urls.length} URLs written`);
        }
    }
    
    // Write closing tag
    writeStream.write('</urlset>');
    writeStream.end();
    
    console.log(`✅ Created ${filename}`);
    return filePath;
}

/**
 * Create sitemap index
 */
function createSitemapIndex(sitemapFiles) {
    console.log(`📋 Creating sitemap index with ${sitemapFiles.length} sitemaps`);
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    
    sitemapFiles.forEach(filename => {
        xml += '  <sitemap>\n';
        xml += `    <loc>${BASE_URL}/sitemaps/${filename}</loc>\n`;
        xml += `    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n`;
        xml += '  </sitemap>\n';
    });
    
    xml += '</sitemapindex>';
    
    const indexPath = path.join(SITEMAPS_DIR, 'sitemap.xml');
    fs.writeFileSync(indexPath, xml);
    console.log(`✅ Created sitemap index: sitemap.xml`);
}

/**
 * Generate movie sitemap with memory optimization
 */
async function generateMovieSitemap() {
    console.log('🎬 Generating movie sitemap...');
    
    try {
        const filePath = await downloadTMDBFile('movie');
        
        // Simplified filter: just basic validation + no adult content
        const filterFn = (movie) => 
            movie.popularity > 0 &&  // Has popularity score
            movie.adult === false && // No adult content
            (movie.title || movie.original_title) && // Has title
            movie.id; // Has valid ID
            
        const topMovies = await streamTMDBData(filePath, filterFn, CONFIG.MOVIES_LIMIT);
        
        console.log(`📊 Processing ${topMovies.length} top movies`);
        
        // Process movies in chunks to manage memory
        const movieUrls = [];
        const chunkSize = CONFIG.CHUNK_SIZE;
        
        for (let i = 0; i < topMovies.length; i += chunkSize) {
            const chunk = topMovies.slice(i, i + chunkSize);
            
            const chunkUrls = chunk.map(movie => ({
                url: `/movie/${movie.id}/${getUrlSlug(movie.title || movie.original_title)}`,
                priority: movie.popularity > 100 ? '1.0' :    // Top tier blockbusters
                         movie.popularity > 50 ? '0.9' :     // Very popular movies 
                         movie.popularity > 20 ? '0.8' :     // Popular movies
                         movie.popularity > 10 ? '0.7' :     // Well-known movies
                         '0.6',                              // Standard movies
                changefreq: 'daily'
            }));
            
            movieUrls.push(...chunkUrls);
            
            // Clear chunk references
            chunk.length = 0;
        }
        
        // Clear movie data from memory
        topMovies.length = 0;
        
        const result = createSitemap(movieUrls, 'sitemap_movies.xml');
        
        // Clear URL data from memory
        movieUrls.length = 0;
        
        return result;
        
    } catch (error) {
        console.error('❌ Error generating movie sitemap:', error.message);
        throw error;
    }
}

/**
 * Generate series sitemap with memory optimization
 */
async function generateSeriesSitemap() {
    console.log('📺 Generating series sitemap...');
    
    try {
        const filePath = await downloadTMDBFile('tv_series');
        
        // Simplified filter: just basic validation (TV series don't have adult field)
        const filterFn = (show) => 
            show.popularity > 0 && // Has popularity score
            (show.original_name || show.name) && // Has name
            show.id; // Has valid ID
            
        const topSeries = await streamTMDBData(filePath, filterFn, CONFIG.SERIES_LIMIT);
        
        console.log(`📊 Processing ${topSeries.length} top series`);
        
        // Process series in chunks to manage memory
        const seriesUrls = [];
        const chunkSize = CONFIG.CHUNK_SIZE;
        
        for (let i = 0; i < topSeries.length; i += chunkSize) {
            const chunk = topSeries.slice(i, i + chunkSize);
            
            const chunkUrls = chunk.map(show => ({
                url: `/series/${show.id}/${getUrlSlug(show.original_name || show.name)}`,
                priority: show.popularity > 80 ? '1.0' :     // Top tier shows (Netflix/HBO hits)
                         show.popularity > 40 ? '0.9' :     // Very popular shows
                         show.popularity > 20 ? '0.8' :     // Popular shows
                         show.popularity > 10 ? '0.7' :     // Well-known shows
                         '0.6',                             // Standard shows
                changefreq: 'daily'
            }));
            
            seriesUrls.push(...chunkUrls);
            
            // Clear chunk references
            chunk.length = 0;
        }
        
        // Clear series data from memory
        topSeries.length = 0;
        
        const result = createSitemap(seriesUrls, 'sitemap_series.xml');
        
        // Clear URL data from memory
        seriesUrls.length = 0;
        
        return result;
        
    } catch (error) {
        console.error('❌ Error generating series sitemap:', error.message);
        throw error;
    }
}

/**
 * Generate person sitemap with memory optimization
 */
async function generatePersonSitemap() {
    console.log('👤 Generating person sitemap...');
    
    try {
        const filePath = await downloadTMDBFile('person');
        
        // Simplified filter: just basic validation + no adult performers
        const filterFn = (person) => 
            person.popularity > 0 && // Has popularity score
            person.adult === false && // No adult performers
            person.name && // Has name
            person.id; // Has valid ID
            
        const topPersons = await streamTMDBData(filePath, filterFn, CONFIG.PERSONS_LIMIT);
        
        console.log(`📊 Processing ${topPersons.length} top persons`);
        
        // Process persons in chunks to manage memory
        const personUrls = [];
        const chunkSize = CONFIG.CHUNK_SIZE;
        
        for (let i = 0; i < topPersons.length; i += chunkSize) {
            const chunk = topPersons.slice(i, i + chunkSize);
            
            const chunkUrls = chunk.map(person => ({
                url: `/person/${person.id}/${getUrlSlug(person.name)}`,
                priority: person.popularity > 50 ? '0.9' :     // A-list celebrities
                         person.popularity > 25 ? '0.8' :     // Very famous people
                         person.popularity > 15 ? '0.7' :     // Well-known people
                         person.popularity > 10 ? '0.6' :     // Recognized people
                         '0.5',                               // Standard people
                changefreq: 'daily'
            }));
            
            personUrls.push(...chunkUrls);
            
            // Clear chunk references
            chunk.length = 0;
        }
        
        // Clear person data from memory
        topPersons.length = 0;
        
        const result = createSitemap(personUrls, 'sitemap_persons.xml');
        
        // Clear URL data from memory
        personUrls.length = 0;
        
        return result;
        
    } catch (error) {
        console.error('❌ Error generating person sitemap:', error.message);
        throw error;
    }
}

/**
 * Generate static pages sitemap
 */
function generateStaticSitemap() {
    console.log('📄 Generating static pages sitemap...');
    
    // Generate all available topic routes dynamically
    const dynamicTopicRoutes = generateAllTopicRoutes();
    console.log(`📊 Generated ${dynamicTopicRoutes.length} topic routes`);
    
    const allStaticUrls = [
        ...STATIC_ROUTES,
        ...dynamicTopicRoutes
    ];
    
    return createSitemap(allStaticUrls, 'sitemap_static.xml');
}

/**
 * Main execution function with enhanced memory management
 */
async function main() {
    console.log('🚀 Starting memory-optimized sitemap generation...');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('🔧 Configuration (Simplified - Top by Popularity):');
    console.log(`   - Movies: Top ${CONFIG.MOVIES_LIMIT} by popularity`);
    console.log(`   - Series: Top ${CONFIG.SERIES_LIMIT} by popularity`);
    console.log(`   - Persons: Top ${CONFIG.PERSONS_LIMIT} by popularity`);
    console.log(`   - Chunk size: ${CONFIG.CHUNK_SIZE}`);
    console.log(`   - Max retries: ${CONFIG.MAX_RETRIES}`);
    
    const startTime = Date.now();
    
    try {
        // Ensure sitemaps directory exists
        if (!fs.existsSync(SITEMAPS_DIR)) {
            fs.mkdirSync(SITEMAPS_DIR, { recursive: true });
        }
        
        // Generate sitemaps sequentially to optimize memory usage
        console.log('\n🔄 Running sitemap generation sequentially for memory efficiency...');
        
        // 1. Static sitemap (lightweight)
        console.log('\n📄 Step 1/4: Generating static sitemap...');
        const staticSitemap = generateStaticSitemap();
        console.log('✅ Static sitemap completed');
        
        // 2. Movie sitemap
        console.log('\n🎬 Step 2/4: Generating movie sitemap...');
        const movieSitemap = await generateMovieSitemap();
        console.log('✅ Movie sitemap completed');
        
        // Force memory cleanup
        if (global.gc) {
            console.log('🧹 Running garbage collection...');
            global.gc();
        }
        
        // 3. Series sitemap
        console.log('\n📺 Step 3/4: Generating series sitemap...');
        const seriesSitemap = await generateSeriesSitemap();
        console.log('✅ Series sitemap completed');
        
        // Force memory cleanup
        if (global.gc) {
            console.log('🧹 Running garbage collection...');
            global.gc();
        }
        
        // 4. Person sitemap
        console.log('\n👤 Step 4/4: Generating person sitemap...');
        const personSitemap = await generatePersonSitemap();
        console.log('✅ Person sitemap completed');
        
        // 5. Create sitemap index
        console.log('\n📋 Creating sitemap index...');
        const sitemapFiles = [
            'sitemap_static.xml',
            'sitemap_movies.xml', 
            'sitemap_series.xml',
            'sitemap_persons.xml'
        ];
        
        createSitemapIndex(sitemapFiles);
        
        const endTime = Date.now();
        const duration = Math.round((endTime - startTime) / 1000);
        
        console.log('\n🎯 MEMORY-OPTIMIZED SEO SITEMAP GENERATION COMPLETED! 🎯');
        console.log(`⏱️ Total duration: ${duration}s`);
        console.log('📊 Final Structure:');
        console.log(`   - Static pages: ${STATIC_ROUTES.length} base pages (3 at priority 1.0, 3 at 0.9)`);
        console.log(`   - Topic pages: Generated from app logic (8 at priority 1.0, rest 0.7-0.9)`);
        console.log(`   - Movies: Up to ${CONFIG.MOVIES_LIMIT} quality URLs (priorities 0.6-1.0)`);
        console.log(`   - Series: Up to ${CONFIG.SERIES_LIMIT} quality URLs (priorities 0.6-1.0)`);
        console.log(`   - Persons: Up to ${CONFIG.PERSONS_LIMIT} quality URLs (priorities 0.5-0.9)`);
        console.log(`   - Total sitemaps: ${sitemapFiles.length + 1} files`);
        console.log('🚀 PERFORMANCE OPTIMIZATIONS:');
        console.log(`   - ✅ Streaming file processing (no full file loading)`);
        console.log(`   - ✅ Chunked XML generation (${CONFIG.CHUNK_SIZE} URLs per chunk)`);
        console.log(`   - ✅ Automatic memory cleanup and GC calls`);
        console.log(`   - ✅ Retry logic with ${CONFIG.MAX_RETRIES} attempts`);
        console.log(`   - ✅ Simplified selection: pure top-by-popularity approach`);
        console.log('🏆 PRIORITY 1.0 DISTRIBUTION:');
        console.log(`   - ✅ 3 Essential hubs (/, /browse, /topics)`);
        console.log(`   - ✅ 4 Top genre categories (Action, Comedy, Drama, Horror)`);
        console.log(`   - ✅ 8 Top theme categories (4 themes × 2 media types)`);
        console.log(`   - ✅ ~20-30 blockbuster movies (popularity > 100)`);
        console.log(`   - ✅ ~15-25 trending series (popularity > 80)`);
        
    } catch (error) {
        console.error('\n💥 Fatal error during sitemap generation:', error);
        console.error('Stack trace:', error.stack);
        
        // Cleanup on error
        console.log('🧹 Performing cleanup...');
        if (global.gc) {
            global.gc();
        }
        
        process.exit(1);
    }
}

// Run the script
main();
