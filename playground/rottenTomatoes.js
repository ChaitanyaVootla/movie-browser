const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeRottenTomatoesInfo(rtId) {
  try {
    // Construct the Rotten Tomatoes URL
    const url = `https://www.rottentomatoes.com/${rtId}`;

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

    // Extract critics consensus
    const criticsConsensus = $('#critics-consensus p').text().trim() || null;

    // Extract data from media-scorecard element
    const posterImage = $('media-scorecard rt-img[slot="posterImage"]').attr('src') ||
                       $('media-scorecard rt-img[slot="posterImage"]').attr('fallback-src') || null;

    // Extract critics score
    const criticsCertified = $('media-scorecard score-icon-critics').attr('certified') === 'true';
    const criticsSentiment = $('media-scorecard score-icon-critics').attr('sentiment') || null;
    const criticsScore = $('media-scorecard rt-text[slot="criticsScore"]').first().text().trim() || null;
    const criticsReviewCount = $('media-scorecard rt-link[slot="criticsReviews"]').text().trim().replace(/[^0-9]/g, '') || null;

    // Extract audience score
    const audienceCertified = $('media-scorecard score-icon-audience').attr('certified') === 'true';
    const audienceSentiment = $('media-scorecard score-icon-audience').attr('sentiment') || null;
    const audienceScore = $('media-scorecard rt-text[slot="audienceScore"]').first().text().trim() || null;
    const audienceRatingCount = $('media-scorecard rt-link[slot="audienceReviews"]').text().trim() || null;

    // Extract movie description
    const description = $('media-scorecard drawer-more rt-text[slot="content"]').text().trim() ||
                       schemaData?.description || null;

    // Create the movie info object
    const movieInfo = {
      title: schemaData?.name || $('h1[data-qa="score-panel-title"]').text().trim() || null,
      description: description,
      image: posterImage || schemaData?.image || null,
      url: schemaData?.url || url,
      criticsConsensus: criticsConsensus,

      // Ratings information
      criticsScore: {
        score: criticsScore || null,
        certified: criticsCertified,
        sentiment: criticsSentiment,
        reviewCount: criticsReviewCount || null,
      },

      audienceScore: {
        score: audienceScore,
        certified: audienceCertified,
        sentiment: audienceSentiment,
        ratingCount: audienceRatingCount
      },

      // Basic movie information
      releaseDate: schemaData?.dateCreated || null,
      releaseYear: schemaData?.dateCreated ? schemaData.dateCreated.substring(0, 4) :
                  $('[data-qa="movie-info-item-value"]').first().text().trim().match(/\d{4}/) || null,
      contentRating: schemaData?.contentRating ||
                    $('[data-qa="movie-info-item-value"]').filter((_, el) => $(el).text().includes('Rating')).text().trim() || null,
      genres: schemaData?.genre ||
             $('[data-qa="movie-info-item-value"]').filter((_, el) => $(el).prev().text().includes('Genre')).text().trim().split(',').map(g => g.trim()) || null,
    };

    return movieInfo;
  } catch (error) {
    console.error('Error scraping Rotten Tomatoes info:', error);
    throw error;
  }
}

// Example usage
async function main() {
  try {
    // Example: The Shawshank Redemption on Rotten Tomatoes
    const rtMovieInfo = await scrapeRottenTomatoesInfo('m/get_out');
    console.log('Rotten Tomatoes Info:', JSON.stringify(rtMovieInfo, null, 2));

    // // Example: A more recent movie - Get Out
    // const rtRecentMovie = await scrapeRottenTomatoesInfo('get_out');
    // console.log('Recent Movie RT Info:', JSON.stringify(rtRecentMovie, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();