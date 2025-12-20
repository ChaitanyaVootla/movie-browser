import { getUrlSlug } from "~/utils/slug";

export default defineNuxtRouteMiddleware(async (to, from) => {
    if (to.path.includes('/movie/')) {
        const movieId = to.params.movieId;
        const slug = to.params.slug
        if (movieId && !slug) {
            const movieData = await $fetch(`/api/movie/${movieId}`);
            return navigateTo(`/movie/${movieId}/${getUrlSlug(movieData.title)}`, {
                redirectCode: 301,
            });
        }
    }
    if (to.path.includes('/series/')) {
        const seriesId = to.params.seriesId;
        const slug = to.params.slug
        if (seriesId && !slug) {
            const seriesData: any = await $fetch(`/api/series/${seriesId}`);
            return navigateTo(`/series/${seriesId}/${getUrlSlug(seriesData.name)}`, {
                redirectCode: 301,
            });
        }
    }
    if (to.path.includes('/person/')) {
        const personId = to.params.personId;
        const slug = to.params.slug
        if (personId && !slug) {
            const personData: any = await $fetch(`/api/person/${personId}`);
            return navigateTo(`/person/${personId}/${getUrlSlug(personData.name)}`, {
                redirectCode: 301,
            });
        }
    }
})
