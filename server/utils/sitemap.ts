import * as fs from 'fs';
import * as xmlbuilder from 'xmlbuilder';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export const createSitemapIndex = (files: string[], filename: string) => {
  const root = xmlbuilder.create('sitemapindex', { version: '1.0', encoding: 'UTF-8' })
    .att('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');

  files.forEach(file => {
    root.ele('sitemap').ele('loc', file);
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