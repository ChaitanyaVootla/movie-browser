import { User, ContinueWatching, MoviesWatchList, WatchedMovies, SeriesList, Recent } from "~/server/models";

export default defineEventHandler(async (event) => {
    const isAdmin = event.context.isAdmin as boolean;
    if (!isAdmin) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
        return;
    }

    const userObjects = await User.find();
    const users: any = userObjects.map(user => user.toJSON());
    const userIds = users.map(({ sub }: any) => sub);

    const models: { model: any, key: string }[] = [
        { model: ContinueWatching, key: "ContinueWatching" },
        { model: MoviesWatchList, key: "MoviesWatchList" },
        { model: WatchedMovies, key: "WatchedMovies" },
        { model: SeriesList, key: "SeriesList" },
        { model: Recent, key: "recent" }
    ];

    const userData = await Promise.all(
        models.map(({ model }) => model.find({ userId: { $in: userIds } }).select('-_id userId id').lean())
    );

    users.forEach((user: any) => {
        models.forEach(({ key }, index) => {
            user[key] = userData[index].filter((item: any) => item.userId?.toString() === user.sub?.toString()).length;
        });
    });

    return users;
});
