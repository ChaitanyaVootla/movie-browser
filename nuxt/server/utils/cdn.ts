/**
 * CDN Utilities for CloudFront Integration
 * Simple utilities for cache management and optimization
 */

import { CACHE_RULES, type CacheRule } from '../config/cache';

export interface CdnResponse<T = any> {
  data: T;
  cached: boolean;
  cacheAge?: number;
  etag?: string;
}

/**
 * Sets simple ETag header for cache validation
 */
export function setETag(event: any, etag: string): void {
  event.node.res.setHeader('ETag', etag);
  
  // Check if client sent matching ETag
  const clientETag = event.node.req.headers['if-none-match'];
  if (clientETag === etag) {
    event.node.res.statusCode = 304;
    return;
  }
}

/**
 * Generates ETag from request data
 */
export function generateETag(data: any): string {
  const crypto = require('crypto');
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  return `"${crypto.createHash('md5').update(content).digest('hex')}"`;
}

/**
 * Gets cache rule for an endpoint
 */
export function getCacheRule(url: string): CacheRule | null {
  for (const [pattern, rule] of Object.entries(CACHE_RULES)) {
    if (url.includes(pattern)) {
      return rule;
    }
  }
  return null;
}

/**
 * Cache invalidation utility (for future CloudFront integration)
 */
export async function invalidateCache(tags: string[]): Promise<void> {
  console.log(`🔄 Cache invalidation requested for tags: ${tags.join(', ')}`);
  
  // Future: Integrate with CloudFront invalidation API
  // const cloudfront = new AWS.CloudFront();
  // await cloudfront.createInvalidation({...});
}
