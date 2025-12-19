// Test data for E2E tests

export const testMovieIds = {
  popular: 550, // Fight Club
  classic: 238, // The Godfather
  recent: 823464, // Godzilla x Kong
  collection: 120, // LOTR (has collection)
};

export const testSeriesIds = {
  popular: 1399, // Game of Thrones
  recent: 94997, // House of the Dragon
  anime: 37854, // One Piece
};

export const testPersonIds = {
  actor: 287, // Brad Pitt
  director: 525, // Christopher Nolan
};

export const criticalPages = [
  { path: "/", name: "Homepage" },
  { path: `/movie/${testMovieIds.popular}/fight-club`, name: "Movie Page" },
  { path: `/series/${testSeriesIds.popular}/game-of-thrones`, name: "Series Page" },
  { path: `/person/${testPersonIds.actor}/brad-pitt`, name: "Person Page" },
  { path: "/browse", name: "Browse Page" },
  { path: "/topics", name: "Topics Page" },
];

export const seoExpectations = {
  movie: {
    titlePattern: /.+ - Movie Browser$/,
    ogType: "video.movie",
  },
  series: {
    titlePattern: /.+ - Movie Browser$/,
    ogType: "video.tv_show",
  },
  person: {
    titlePattern: /.+ - Movie Browser$/,
    ogType: "profile",
  },
};
