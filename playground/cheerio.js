const axios = require('axios');
const cheerio = require('cheerio');

const scrapeIMDbStoryline = async (imdbId) => {
  try {
    // Construct the URL using the IMDb ID
    const url = `https://www.imdb.com/title/${imdbId}/plotsummary`;
    const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        }
    };

    // Fetch the page content
    const { data } = await axios.get(url, options);

    // Load the HTML content into Cheerio
    const $ = cheerio.load(data);

    // Extract the storyline text. This selector is based on the current structure of the page.
    // Note: The selector might need an update if IMDb changes its HTML structure.
    const storyline = $('[data-testid=sub-section-synopsis] .ipc-html-content-inner-div').first().text().trim();

    console.log('Storyline:', storyline);
  } catch (error) {
    console.error('Error scraping IMDb storyline:', error);
  }
};

// Example IMDb ID from your sample page
scrapeIMDbStoryline('tt1092026');
