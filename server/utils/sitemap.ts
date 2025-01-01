import * as fs from 'fs';
import * as xmlbuilder from 'xmlbuilder';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = 'https://themoviebrowser.com';

export const createSitemap = (urls: string[], filename: string, priority: string, changeFreq: string, lastMod: string) => {
  const root = xmlbuilder.create('urlset', { version: '1.0', encoding: 'UTF-8' })
    .att('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');

  urls.forEach(url => {
    const urlElement = root.ele('url');
    urlElement.ele('loc', {}, url);
    urlElement.ele('changefreq', {}, changeFreq);
    urlElement.ele('priority', {}, priority);
    urlElement.ele('lastmod', {}, lastMod);
  });

  const xml = root.end({ pretty: true });
  fs.writeFileSync(filename, xml);
};

export const createSitemapIndex = (files: string[], filename: string, lastMod: string) => {
  const root = xmlbuilder.create('sitemapindex', { version: '1.0', encoding: 'UTF-8' })
    .att('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');

  files.forEach(file => {
    const sitemapElement = root.ele('sitemap');
    sitemapElement.ele('loc', file);
    sitemapElement.ele('lastmod', lastMod);
  });

  const xml = root.end({ pretty: true });
  fs.writeFileSync(filename, xml);
};

export const getSiteMapDir = (mediaType: string, idx: number, suffix='') => {
  const publicDir = path.join(__dirname, '../../public');
  const sitemapsDir = path.join(publicDir, mediaType);

  // Create directories if they don't exist
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  if (!fs.existsSync(sitemapsDir)) {
    fs.mkdirSync(sitemapsDir);
  }
  return path.join(sitemapsDir, `${mediaType}_${suffix}${idx}.xml`);
}

export const updateSiteMapIndex = async () => {
  const publicDir = path.join(__dirname, '../../public');
  const movieSitemapsDir = path.join(publicDir, 'movie');
  const seriesSitemapsDir = path.join(publicDir, 'series');
  const personSitemapsDir = path.join(publicDir, 'person');
  
  const movieFileUrls = fs.readdirSync(movieSitemapsDir).map(file => `${BASE_URL}/movie/${file}`);
  const seriesFileUrls = fs.readdirSync(seriesSitemapsDir).map(file => `${BASE_URL}/series/${file}`);
  const personFileUrls = fs.readdirSync(personSitemapsDir).map(file => `${BASE_URL}/person/${file}`);

  const allFileUrls = [...movieFileUrls, ...seriesFileUrls, ...personFileUrls];
  allFileUrls.sort((a, b) => {
    if (a.includes('non_priority') && !b.includes('non_priority')) {
      return 1;
    }
    if (!a.includes('non_priority') && b.includes('non_priority')) {
      return -1;
    }
    return 0;
  });

  const sitemapIndexFile = path.join(publicDir, 'sitemap.xml');
  const today = new Date().toISOString().split('T')[0];
  createSitemapIndex(allFileUrls, sitemapIndexFile, today);

  return 'Updated sitemap index';
}
