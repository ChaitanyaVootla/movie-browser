// Live smoke test: runs the compiled handler locally (or with --lambda, invokes the deployed function).
// Usage: node scripts/smoke.js [--lambda <function-name>]
const CASES = [
  { tmdbId: 556694, mediaType: "movie", title: "Three Thousand Years of Longing", year: 2022, imdbId: "tt9198364" },
  { tmdbId: 1062722, mediaType: "movie", title: "Frankenstein", year: 2025 },
  { tmdbId: 157336, mediaType: "movie", title: "Interstellar", year: 2014, imdbId: "tt0816692", wikidataId: "Q13417189" },
  { tmdbId: 136315, mediaType: "tv", title: "The Bear", year: 2022, imdbId: "tt14452776" },
  { tmdbId: 1311031, mediaType: "movie", title: "Demon Slayer: Kimetsu no Yaiba Infinity Castle", originalTitle: "劇場版「鬼滅の刃」無限城編 第一章 猗窩座再来", year: 2025 },
  { tmdbId: 914348, mediaType: "movie", title: "I Love It Double 3", year: 2011 },
];
const idx = process.argv.indexOf("--lambda");
const fn = idx > 0 ? process.argv[idx + 1] : null;
async function run(c) {
  if (!fn) return require("../dist/index.js").handler(c);
  const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
  const client = new LambdaClient({ region: "ap-south-2" });
  const r = await client.send(new InvokeCommand({ FunctionName: fn, Payload: JSON.stringify(c) }));
  return JSON.parse(new TextDecoder().decode(r.Payload));
}
(async () => {
  for (const c of CASES) {
    const r = await run(c);
    const s = Object.entries(r.sources || {}).map(([k, v]) => `${k}=${v.status}${v.http ? "/" + v.http : ""}(${v.ms}ms)`).join(" ");
    const rt = r.ratings || {};
    console.log(`\n# ${c.title} [${r.durationMs}ms]\n  ${s}\n  rt=${rt.rtCritic?.score ?? "-"}/${rt.rtAudience?.score ?? "-"} mc=${rt.metacritic?.score ?? "-"} lb=${rt.letterboxd?.score ?? "-"} links=${(r.watchLinks || []).length} ids=${JSON.stringify(r.externalIds)}`);
    for (const [k, v] of Object.entries(r.sources || {})) if (!["ok", "skipped"].includes(v.status)) console.log(`    ${k}: ${v.status} ${v.detail || ""}`);
    console.log("  " + (r.watchLinks || []).slice(0, 6).map((l) => `${l.country}:${l.provider}(${l.price})`).join(", "));
  }
})();
