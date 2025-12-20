import { JWT } from "next-auth/jwt";
import { Filters } from "~/server/models";

export default defineEventHandler(async (event) => {
    const userData = event.context.userData as JWT;
    if (!userData || !userData?.sub) {
        event.node.res.statusCode = 401;
        event.node.res.end(`Unauthorized`);
    }
    const body = await readBody(event);
    if (!body._id) {
        event.node.res.statusCode = 400;
        event.node.res.end(`_id is required`);
    }
    await Filters.updateOne({_id: body._id}, 
        {
            $set: {
                filterParams: body.filterParams,
                isGlobal: body.isGlobal || false,
                updatedAt: new Date(),
            },
        },
        { upsert: true }
    ).exec();
    return {
        status: 200,
    };
});
