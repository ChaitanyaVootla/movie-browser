export default eventHandler((event) => {
    const start = Date.now();
  
    // Check if the route matches the desired pattern
    const routePattern = /^\/movie\/\d+\/[\w-]+$/; // Matches `/movie/{id}/{slug}`
    if (routePattern.test(event.req.url)) {
      event.res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[SSR Timing] ${event.req.url} took ${duration}ms`);
      });
    }
  });
  