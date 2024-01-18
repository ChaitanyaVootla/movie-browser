export default defineEventHandler(async (event) => {
    const body = await readBody(event);
    const movies: any = await $fetch('http://127.0.0.1:5000/recommend', {
        method: 'POST',
        body,
    }).catch((error: Error) => {
        return [];
    });
    return movies;
});
