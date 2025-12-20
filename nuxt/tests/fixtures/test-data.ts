export const testMovieIds = {
  popular: '550', // Fight Club
  recent: '912649', // Venom: The Last Dance
  classic: '238', // The Godfather
  collection: '1570' // Die Hard (has collection)
}

export const testSeriesIds = {
  popular: '1399', // Game of Thrones
  ongoing: '94605', // Arcane
  ended: '1396', // Breaking Bad
  animated: '60625' // Rick and Morty
}

export const testPersonIds = {
  actor: '287', // Brad Pitt
  director: '7467', // Christopher Nolan
  actress: '1245', // Scarlett Johansson
  producer: '965' // Steven Spielberg
}

export const seoExpectations = {
  movie: {
    titlePattern: /^.+ \| The Movie Browser$/,
    descriptionMinLength: 50,
    ogType: 'video.movie',
    structuredDataType: 'Movie'
  },
  series: {
    titlePattern: /^.+ \| The Movie Browser$/,
    descriptionMinLength: 50,
    ogType: 'video.tv_show',
    structuredDataType: 'TVSeries'
  },
  person: {
    titlePattern: /^.+ \| The Movie Browser$/,
    descriptionMinLength: 30,
    ogType: 'profile',
    structuredDataType: 'Person'
  },
  homepage: {
    titlePattern: /Movie Browser/,
    descriptionMinLength: 100,
    ogType: 'website',
    structuredDataType: null
  }
}

export const criticalPages = [
  { path: '/', type: 'homepage' },
  { path: `/movie/${testMovieIds.popular}/fight-club`, type: 'movie' },
  { path: `/series/${testSeriesIds.popular}/game-of-thrones`, type: 'series' },
  { path: `/person/${testPersonIds.actor}/brad-pitt`, type: 'person' },
  { path: '/browse', type: 'browse' },
  { path: '/topics', type: 'topics' }
]

export const expectedMetaTags = {
  required: [
    'title',
    'meta[name="description"]',
    'meta[name="viewport"]',
    'link[rel="canonical"]',
    'meta[property="og:title"]',
    'meta[property="og:description"]',
    'meta[property="og:image"]',
    'meta[property="og:url"]',
    'meta[property="og:type"]',
    'meta[name="twitter:card"]',
    'html[lang]'
  ],
  optional: [
    'meta[name="robots"]',
    'meta[property="og:site_name"]',
    'meta[name="twitter:site"]',
    'meta[name="twitter:creator"]',
    'link[rel="icon"]'
  ]
}

export const performanceThresholds = {
  loadTime: 3000, // 3 seconds max for initial load
  contentLength: 500, // Minimum content length for SSR
  titleLength: { min: 10, max: 60 },
  descriptionLength: { min: 50, max: 160 }
}
