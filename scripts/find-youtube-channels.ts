#!/usr/bin/env npx tsx
/**
 * Quick script to find correct YouTube channel IDs
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const API_KEY = process.env.YOUTUBE_API_KEY;

async function searchChannel(query: string) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "channel");
  url.searchParams.set("maxResults", "3");
  url.searchParams.set("key", API_KEY!);

  const res = await fetch(url.toString());
  const data = await res.json();

  console.log(`\n"${query}":`);
  for (const item of data.items || []) {
    console.log(`   ${item.snippet.channelTitle} -> ${item.snippet.channelId}`);
  }
}

async function main() {
  const channels = [
    "Sony Pictures Entertainment",
    "Paramount Pictures",
    "Lionsgate Movies",
    "A24",
    "Blumhouse",
    "Prime Video",
    "Apple TV",
    "Max",
    "Disney Plus",
    "Crunchyroll",
    "Marvel Entertainment",
    "DreamWorks Animation",
    "Dharma Productions",
    "Focus Features",
    "Searchlight Pictures",
    "Illumination",
    "FilmSelect Trailer",
    "JoBlo Movie Trailers",
    "IGN Movies",
  ];

  for (const ch of channels) {
    await searchChannel(ch);
    await new Promise((r) => setTimeout(r, 200));
  }
}

main();


