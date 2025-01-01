export default defineNuxtRouteMiddleware(async (to, from) => {
    if (to.path.endsWith('.xml')) {
      const runtimeConfig = useRuntimeConfig();
      return navigateTo(`${runtimeConfig.public.baseURL || ''}${to.path}`);
    }
})
