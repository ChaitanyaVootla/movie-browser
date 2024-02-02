import { JWT } from "next-auth/jwt";
import { Filters } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const body = await readBody(event);
    const filterObj = {
        userId: userData.sub,
        name: body.name,
        filterParams: body.filterParams,
        isGobal: body.isGlobal || false,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const newFilter = await Filters.create(filterObj);
    return {
        status: 200,
        filter: newFilter.toJSON(),
    };
});
