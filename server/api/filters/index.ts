import { Filters } from "~/server/models";

export default defineEventHandler(async () => {
    const filters = await Filters.find({isGlobal: true});
    return filters;
});
