/**
 * CDN Headers Middleware
 * Enhances API responses with security and CORS headers
 */

export default defineEventHandler(async (event) => {
  // Only process API routes
  const url = event.node.req.url || '';
  if (!url.startsWith('/api/')) {
    return;
  }

  // Skip user-specific endpoints (they shouldn't use CDN)
  const userSpecificPatterns = [
    '/api/user/',
    '/api/auth/',
    '/api/admin/'
  ];
  
  const isUserSpecific = userSpecificPatterns.some(pattern => 
    url.includes(pattern)
  );
  
  if (isUserSpecific) {
    // For user-specific routes, add cache prevention headers
    event.node.res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    event.node.res.setHeader('Pragma', 'no-cache');
    event.node.res.setHeader('Expires', '0');
    return;
  }

  // For CDN-eligible routes, the headers are already set in nuxt.config.ts routeRules
  // This middleware adds any additional dynamic behavior if needed
  
  // Add security headers for all API routes
  event.node.res.setHeader('X-Content-Type-Options', 'nosniff');
  event.node.res.setHeader('X-Frame-Options', 'DENY');
  event.node.res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Add CORS headers for CDN compatibility
  if (url.includes('/api/')) {
    event.node.res.setHeader('Access-Control-Allow-Origin', '*');
    event.node.res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    event.node.res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, If-None-Match');
    
    // Handle OPTIONS preflight requests
    if (event.node.req.method === 'OPTIONS') {
      event.node.res.statusCode = 200;
      event.node.res.end();
      return;
    }
  }
});
