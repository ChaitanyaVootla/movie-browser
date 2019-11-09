export class TvDetails {
    public name: string;
    public releaseDate: string;
    public homepage: string;
    public overview: string;
    public posterPath: string;
    public backdropPath: string;
    public id: number;
    public rating: number;
    public voteCount: number;
    public numberOfSeasons: number;
    public genres: Array<Object>;
    public seasons: Array<Object>;
    public productionCompanies: Array<Object>;
    public creators: Array<Object>;
    public videos: Array<Object>;
    public images: Array<Object>;
    public credits: Array<Object>;
    constructor(obj: any) {
        this.name = obj.name;
        this.id = obj.id;
        this.rating = obj.vote_average;
        this.voteCount = obj.vote_average;
        this.releaseDate = obj.first_air_date;
        this.genres = obj.genres;
        this.creators = obj.created_by;
        this.homepage = obj.homepage;
        this.numberOfSeasons = obj.number_of_seasons;
        this.seasons = obj.seasons;
        this.overview = obj.overview;
        this.posterPath = obj.poster_path;
        this.backdropPath = obj.backdrop_path;
        this.productionCompanies = obj.production_companies;
        this.videos = obj.videos.results;
        this.images = obj.images;
        this.credits = obj.credits;
    }
};