const fs = require('fs');

async function getAllMovieMetadata(wikidataId) {
    const sparqlQuery = `
        SELECT DISTINCT ?movie ?movieLabel (SAMPLE(?imdbId) AS ?imdbId) (SAMPLE(?tmdbId) AS ?tmdbId) 
            (SAMPLE(?rottentomatoesId) AS ?rottentomatoesId) (SAMPLE(?metacriticId) AS ?metacriticId) 
            (SAMPLE(?letterboxdId) AS ?letterboxdId) (SAMPLE(?netflixId) AS ?netflixId) 
            (SAMPLE(?primeVideoId) AS ?primeVideoId) (SAMPLE(?appleId) AS ?appleId) 
            (SAMPLE(?hotstarId) AS ?hotstarId) 
        WHERE {
            ?movie wdt:P31 wd:Q11424.  # Instance of "film"

            # Require at least one of IMDb ID or TMDb ID
            ?movie wdt:P345|wdt:P4947 ?id.
            
            OPTIONAL { ?movie wdt:P345 ?imdbId. }             # IMDb ID (optional)
            OPTIONAL { ?movie wdt:P4947 ?tmdbId. }            # TMDb ID (optional)
            OPTIONAL { ?movie wdt:P1258 ?rottentomatoesId. }  # Rotten Tomatoes ID (optional)
            OPTIONAL { ?movie wdt:P1712 ?metacriticId. }      # Metacritic ID (optional)
            OPTIONAL { ?movie wdt:P6127 ?letterboxdId. }      # Letterboxd ID (optional)
            OPTIONAL { ?movie wdt:P1874 ?netflixId. }         # Netflix ID (optional)
            OPTIONAL { ?movie wdt:P8055 ?primeVideoId. }      # Prime Video ID (optional)
            OPTIONAL { ?movie wdt:P9586 ?appleId. }           # Apple ID (optional)
            OPTIONAL { ?movie wdt:P11049 ?hotstarId. }           # Jio Hotstar ID (optional)
            
            SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE]". }
        }
        GROUP BY ?movie ?movieLabel
    `;

    const url = `https://query.wikidata.org/sparql`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/sparql-results+json',
                'User-Agent': 'TheMoveBrowser/v1.0'
            },
            body: `query=${encodeURIComponent(sparqlQuery)}`
        });

        const data = await response.json();

        if (!response.ok) {
          let errorMessage = `Wikidata API error: ${response.status} - ${response.statusText}`;
          try {
              const errorData = await response.text();
              errorMessage += `\nDetails: ${errorData}`;
          } catch (parseError) {
              //
          }
          throw new Error(errorMessage);
        }

        // write raw data to a JSON file
        fs.writeFileSync('raw_data.json', JSON.stringify(data, null, 2));

        // Process the results
        const movies = data.results.bindings.map(movie => ({
            movie: movie.movie.value,
            movieLabel: movie.movieLabel.value,
            tmdbId: movie.tmdbId ? movie.tmdbId.value : null,
            imdbId: movie.imdbId ? movie.imdbId.value : null,
            externalLinks: {
                imdb: movie.imdbId ? movie.imdbId.value : null,
                tmdb: movie.tmdbId ? movie.tmdbId.value : null,
                rottenTomatoes: movie.rottentomatoesId ? movie.rottentomatoesId.value : null,
                metacritic: movie.metacriticId ? movie.metacriticId.value : null,
                letterboxd: movie.letterboxdId ? movie.letterboxdId.value : null,
                netflix: movie.netflixId ? movie.netflixId.value : null,
                primeVideo: movie.primeVideoId ? movie.primeVideoId.value : null,
                apple: movie.appleId ? movie.appleId.value : null,
                hotstar: movie.hotstarId ? movie.hotstarId.value : null
            }
        }));

        // write the movies to a JSON file
        fs.writeFileSync('movies.json', JSON.stringify(movies, null, 2));

        return movies;
    } catch (error) {
        console.error("Error fetching movie info:", error);
        return null;
    }
}

getAllMovieMetadata();
