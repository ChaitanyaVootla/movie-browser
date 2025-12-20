import { upcomingMovies } from './upcomingMovies';
import { comedyMovies } from './comedyMovies';
import { actionMovies } from './actionMovies';
import { zombieMovies } from './zombieMovies';
import { warMovies } from './warMovies';
import { marvelMovies } from './marvelMovies';

export const topics: Record<string, any> = {
    [comedyMovies.key]: comedyMovies,
    [actionMovies.key]: actionMovies,
    [upcomingMovies.key]: upcomingMovies,
    [zombieMovies.key]: zombieMovies,
    [warMovies.key]: warMovies,
    [marvelMovies.key]: marvelMovies,
};
