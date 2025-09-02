const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeIMDBInfo(imdbId) {
  try {
    // Construct the IMDB main title URL
    const url = `https://www.imdb.com/title/${imdbId}/`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);

    // Extract the JSON-LD schema data
    let schemaData = null;
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const jsonData = JSON.parse($(element).html());
        if (jsonData['@type'] === 'Movie') {
          schemaData = jsonData;
        }
      } catch (e) {
        console.error('Error parsing JSON-LD:', e);
      }
    });

    if (!schemaData) {
      throw new Error('No movie schema data found');
    }

    // Extract relevant information from the schema
    const movieInfo = {
      title: schemaData.name || null,
      description: schemaData.description || null,
      image: schemaData.image || null,
      rating: schemaData.aggregateRating?.ratingValue || null,
      ratingCount: schemaData.aggregateRating?.ratingCount || null,
      releaseYear: schemaData.datePublished ? schemaData.datePublished.substring(0, 4) : null,
      contentRating: schemaData.contentRating || null,
      genres: schemaData.genre || null,
      duration: schemaData.duration || null,
      actors: schemaData.actor ? schemaData.actor.map(actor => actor.name) : null,
      directors: schemaData.director ? schemaData.director.map(director => director.name) : null,
      keywords: schemaData.keywords ? schemaData.keywords.split(',').map(k => k.trim()) : null,
      trailer: schemaData.trailer ? {
        url: schemaData.trailer.url || null,
        embedUrl: schemaData.trailer.embedUrl || null,
        thumbnailUrl: schemaData.trailer.thumbnailUrl || null,
        duration: schemaData.trailer.duration || null
      } : null
    };

    return movieInfo;
  } catch (error) {
    console.error('Error scraping IMDB info:', error);
    throw error;
  }
}

// Example usage
async function main() {
  try {
    // Example: The Shawshank Redemption IMDB ID
    const movieInfo = await scrapeIMDBInfo('tt0111161');
    console.log('IMDB Info:', JSON.stringify(movieInfo, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();