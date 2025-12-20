import axios from 'axios';
import * as fs from 'fs';
import * as xmlbuilder from 'xmlbuilder';
import * as zlib from 'zlib';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseURL = 'https://themoviebrowser.com';
const chunkSize = 48_000;

const getSafeDate = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  let month: any = date.getMonth() + 1;
  if (month < 10) {
    month = `0${month}`;
  }
  let day: any = date.getDate();
  if (day < 10) {
    day = `0${day}`;
  }
  return `${month}_${day}_${date.getFullYear()}`;
}
const formattedDate = getSafeDate();

const urls = {
  movies: `http://files.tmdb.org/p/exports/movie_ids_${formattedDate}.json.gz`,
  series: `http://files.tmdb.org/p/exports/tv_series_ids_${formattedDate}.json.gz`,
  persons: `http://files.tmdb.org/p/exports/person_ids_${formattedDate}.json.gz`
};

const downloadAndExtract = async (url: string): Promise<any[]> => {
  console.log("Downloading and extracting: ", url)
  const response: any = await axios.get(url, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  const decompressed = zlib.gunzipSync(buffer).toString('utf-8');
  return JSON.parse(`[${decompressed.split('\n').filter(line => line.trim()).join(',')}]`);
};

const createSitemap = (urls: string[], filename: string) => {
  const root = xmlbuilder.create('urlset', { version: '1.0', encoding: 'UTF-8' })
    .att('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');

  urls.forEach(url => {
    root.ele('url').ele('loc', url);
  });

  const xml = root.end({ pretty: true });
  fs.writeFileSync(filename, xml);
};

const createSitemapIndex = (files: string[], filename: string) => {
  const root = xmlbuilder.create('sitemapindex', { version: '1.0', encoding: 'UTF-8' })
    .att('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');

  files.forEach(file => {
    root.ele('sitemap').ele('loc', file);
  });

  const xml = root.end({ pretty: true });
  fs.writeFileSync(filename, xml);
};

const main = async () => {
  const movieData = await downloadAndExtract(urls.movies);
  const seriesData = await downloadAndExtract(urls.series);
  const personData = await downloadAndExtract(urls.persons);

  let urlsList: string[] = [];
  movieData.forEach(movie => urlsList.push(`${baseURL}/movie/${movie.id}`));
  seriesData.forEach(series => urlsList.push(`${baseURL}/series/${series.id}`));
  personData.forEach(person => urlsList.push(`${baseURL}/person/${person.id}`));

  const publicDir = path.join(__dirname, '../../public');
  const sitemapsDir = path.join(publicDir, 'sitemaps');

  // Create directories if they don't exist
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  if (!fs.existsSync(sitemapsDir)) {
    fs.mkdirSync(sitemapsDir);
  }

  const sitemapFiles: string[] = [];
  for (let i = 0; i < urlsList.length; i += chunkSize) {
    const chunk = urlsList.slice(i, i + chunkSize);
    const filename = path.join(sitemapsDir, `sitemap_${Math.floor(i / chunkSize) + 1}.xml`);
    createSitemap(chunk, filename);
    sitemapFiles.push(`${baseURL}/sitemaps/sitemap_${Math.floor(i / chunkSize) + 1}.xml`);
  }

  createSitemapIndex(sitemapFiles, path.join(publicDir, 'sitemap.xml'));
};

export default defineEventHandler(async (event) => {
  console.log("Starting sitemap generation");
  main().catch(err => console.error(err)).then(() => console.log("Sitemap generation done"));
});