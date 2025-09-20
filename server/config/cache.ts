/**
 * Cache Configuration
 * Simple, centralized cache settings for all API routes
 */

export interface CacheRule {
  maxAge: number;        // Cache duration in seconds
  swr?: number;          // Stale-while-revalidate in seconds
  tags?: string[];       // Cache tags for invalidation
}

/**
 * Cache configurations by route pattern
 * Easily configurable cache durations per endpoint type
 */
export const CACHE_RULES: Record<string, CacheRule> = {
  // Discovery and search - dynamic content, shorter cache
  '/api/discover': {
    maxAge: 6 * 60 * 60,      // 6 hours
    swr: 12 * 60 * 60,        // 12 hours stale-while-revalidate
    tags: ['discover']
  },
  
  '/api/search': {
    maxAge: 4 * 60 * 60,      // 4 hours
    swr: 8 * 60 * 60,         // 8 hours swr
    tags: ['search']
  },
  
  '/api/keywords': {
    maxAge: 24 * 60 * 60,     // 24 hours
    swr: 48 * 60 * 60,        // 48 hours swr
    tags: ['keywords']
  },
  
  // Content details - semi-static, longer cache
  '/api/movie': {
    maxAge: 24 * 60 * 60,     // 24 hours
    swr: 7 * 24 * 60 * 60,    // 7 days swr
    tags: ['movie']
  },
  
  '/api/series': {
    maxAge: 24 * 60 * 60,     // 24 hours
    swr: 7 * 24 * 60 * 60,    // 7 days swr
    tags: ['series']
  },
  
  // Person data - rarely changes, longest cache
  '/api/person': {
    maxAge: 7 * 24 * 60 * 60, // 7 days
    swr: 14 * 24 * 60 * 60,   // 14 days swr
    tags: ['person']
  },
  
  // Time-sensitive content - shorter cache
  '/api/trending': {
    maxAge: 2 * 60 * 60,      // 2 hours
    swr: 6 * 60 * 60,         // 6 hours swr
    tags: ['trending']
  },
  
  // Stable reference data - long cache
  '/api/watchProviders': {
    maxAge: 24 * 60 * 60,     // 24 hours
    swr: 7 * 24 * 60 * 60,    // 7 days swr
    tags: ['watchProviders']
  },
  
  '/api/youtube': {
    maxAge: 4 * 24 * 60 * 60, // 4 days
    swr: 7 * 24 * 60 * 60,    // 7 days swr
    tags: ['youtube']
  }
};

/**
 * Builds cache control header from rule
 */
export function buildCacheHeader(rule: CacheRule): string {
  const parts = ['public', `max-age=${rule.maxAge}`];
  
  if (rule.swr) {
    parts.push(`stale-while-revalidate=${rule.swr}`);
  }
  
  return parts.join(', ');
}

/**
 * Builds route rules for Nuxt config from cache rules
 */
export function buildRouteRules() {
  const routeRules: Record<string, any> = {};
  
  for (const [pattern, rule] of Object.entries(CACHE_RULES)) {
    // Create rule for both exact match and with path parameters
    const ruleConfig = {
      cors: true,
      headers: {
        'Cache-Control': buildCacheHeader(rule),
        'Vary': 'Accept-Encoding, Accept',
        'CDN-Cache-Tag': rule.tags?.join(',') || ''
      }
    };
    
    // Add exact pattern (e.g., /api/trending)
    routeRules[pattern] = ruleConfig;
    
    // Add pattern with parameters (e.g., /api/trending/**, /api/movie/**)
    const wildcardPattern = `${pattern}/**`;
    routeRules[wildcardPattern] = ruleConfig;
  }
  
  return routeRules;
}
