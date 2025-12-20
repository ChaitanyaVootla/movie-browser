/**
 * CDN API Router Plugin
 * Routes non-user-specific API calls to CDN in production
 * while keeping user-specific calls on the main server
 */

interface ApiConfig {
  cdnUrl: string;
  isProduction: boolean;
}

export default defineNuxtPlugin(() => {
  // Only run on client side
  if (import.meta.server) return;

  const config = useRuntimeConfig();
  const apiConfig: ApiConfig = {
    cdnUrl: config.public.cdnApiUrl || 'https://api.themoviebrowser.com',
    isProduction: process.env.NODE_ENV === 'production'
  };

  /**
   * Determines if an API endpoint should use CDN
   */
  const shouldUseCdn = (url: string): boolean => {
    // force local fetch for now will revert later
    return false;
    if (!apiConfig.isProduction) return false;
    
    // User-specific endpoints that should NOT use CDN
    const userSpecificPatterns = [
      '/api/user/',
      '/api/auth/',
      '/api/admin/'
    ];
    
    // Check if URL matches any user-specific pattern
    const isUserSpecific = userSpecificPatterns.some(pattern => 
      url.includes(pattern)
    );
    
    if (isUserSpecific) return false;
    
    // CDN-eligible endpoints
    const cdnEligiblePatterns = [
      '/api/discover',
      '/api/search',
      '/api/movie/',
      '/api/series/',
      '/api/person/',
      '/api/trending/',
      '/api/watchProviders',
      '/api/youtube/',
      '/api/keywords'
    ];
    
    return cdnEligiblePatterns.some(pattern => url.includes(pattern));
  };

  /**
   * Transforms local API URL to CDN URL
   */
  const transformToCdnUrl = (url: string): string => {
    if (url.startsWith('/api/')) {
      // Remove /api prefix for CDN: /api/movie/123 → https://api.themoviebrowser.com/movie/123
      const pathWithoutApi = url.substring(4); // Remove '/api'
      return `${apiConfig.cdnUrl}${pathWithoutApi}`;
    }
    return url;
  };

  // Store the original $fetch function
  const originalFetch = globalThis.$fetch;
  
  // Create a wrapper that preserves all $fetch functionality
  const cdnAwareFetch = (url: any, options?: any) => {
    // Only intercept API calls
    if (typeof url === 'string' && url.startsWith('/api/')) {
      if (shouldUseCdn(url)) {
        const cdnUrl = transformToCdnUrl(url);
        
        console.log(`🌐 CDN Request: ${url} → ${cdnUrl}`);
        return originalFetch(cdnUrl, options);
      } else {
        console.log(`🏠 Local Request: ${url}`);
      }
    }
    
    return originalFetch(url, options);
  };
  
  // Copy all properties from original $fetch to maintain compatibility
  Object.setPrototypeOf(cdnAwareFetch, originalFetch);
  Object.assign(cdnAwareFetch, originalFetch);
  
  // Replace globalThis.$fetch
  globalThis.$fetch = cdnAwareFetch as any;
  
  console.log('🚀 CDN API Router initialized', {
    isProduction: apiConfig.isProduction,
    cdnUrl: apiConfig.cdnUrl
  });
});
