import { KEYWORDS } from '~/utils/keywords';

export default defineEventHandler(async (event) => {
    const query = (getQuery(event)?.query || null) as string | null;
    if (!query) {
        return [];
    }
    return KEYWORDS.filter((keyword) => {
        return keyword.name.toLowerCase().includes(query.toLowerCase());
    })
});
