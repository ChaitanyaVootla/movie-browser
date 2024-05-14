import { User, ContinueWatching, MoviesWatchList, WatchedMovies, SeriesList, Recent } from "~/server/models";

export default defineEventHandler(async (event) => {
    const isAdmin = event.context.isAdmin as boolean;
    if (!isAdmin) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    // const users = await User.find().select('-_id -__v');
    // return users;
    // const users = await User.find()
    // .select('-_id -__v')
    // .populate({
    //     path: 'ContinueWatching',
    //     model: ContinueWatching,
    //     select: '-_id -__v'
    // })
    // .populate({
    //     path: 'MoviesWatchList',
    //     model: MoviesWatchList,
    //     select: '-_id -__v'
    // })
    // .populate({
    //     path: 'WatchedMovies',
    //     model: WatchedMovies,
    //     select: '-_id -__v'
    // });
    const userObjects = await User.find();
    const users: any = userObjects.map(user => user.toJSON());

    const userIds = users.map(({ sub }: any) => sub);

    const continueWatchingObjects = await ContinueWatching.find({ userId: { $in: userIds } }).select('-_id userId id');
    const continueWatching = continueWatchingObjects.map(cw => cw.toJSON());

    const moviesWatchListObjects = await MoviesWatchList.find({ userId: { $in: userIds } }).select('-_id userId id');
    const moviesWatchList = moviesWatchListObjects.map(mwl => mwl.toJSON());

    const watchedMoviesObjects = await WatchedMovies.find({ userId: { $in: userIds } }).select('-_id userId id');
    const watchedMovies = watchedMoviesObjects.map(wm => wm.toJSON());

    const seriesListObjects = await SeriesList.find({ userId: { $in: userIds } }).select('-_id userId id');
    const seriesList = seriesListObjects.map(wm => wm.toJSON());

    const recentObjects = await Recent.find({ userId: { $in: userIds } }).select('-_id userId id');
    const recent = recentObjects.map(wm => wm.toJSON());

    users.forEach((user: any) => {
        user.ContinueWatching = continueWatching.filter((cw: any) => cw.userId.toString() === user.sub.toString()).length;
        user.MoviesWatchList = moviesWatchList.filter((mwl: any) => mwl.userId.toString() === user.sub.toString()).length;
        user.WatchedMovies = watchedMovies.filter((wm: any) => wm.userId.toString() === user.sub.toString()).length;
        user.SeriesList = seriesList.filter((wm: any) => wm.userId.toString() === user.sub.toString()).length;
        user.recent = recent.filter((wm: any) => wm.userId.toString() === user.sub.toString()).length;
    });

    return users;
});
