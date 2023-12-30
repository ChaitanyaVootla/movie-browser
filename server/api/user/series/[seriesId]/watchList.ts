import { JWT } from "next-auth/jwt";
import { SeriesList } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    const seriesId = getRouterParam(event, 'seriesId');
    if (userData?.sub) {
        const watchListDbRes = await SeriesList.findOne({ seriesId: parseInt(seriesId as string), userId: parseInt(userData.sub as string) }).select('seriesId -_id');
        return !!watchListDbRes;
    }
    return false;
});
