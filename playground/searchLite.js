const axios = require('axios');
const fs = require('fs');

// Replace with your search query
const query = 'example search';

// Google Search URL
const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

axios.get(url)
  .then(response => {
    // Write the response data to an HTML file
    fs.writeFile('google-search-results.html', response.data, (err) => {
      if (err) throw err;
      console.log('File has been saved!');
    });
  })
  .catch(error => {
    console.error('Error fetching data:', error);
  });
