// Search Console helper in Node (no python3/openssl needed — scripts/gsc.sh needs both).
// Usage: node scripts/gsc.mjs sitemaps | query '<searchanalytics-json>' | inspect <url>...
// Key: gcp_service.json at the repo root (gitignored, local-only). See .claude/rules/seo-search-console.md.
import fs from 'node:fs'; import crypto from 'node:crypto';
const key = JSON.parse(fs.readFileSync(new URL('../gcp_service.json', import.meta.url),'utf8'));
const b64 = (o)=>Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const unsigned = b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:key.client_email,scope:'https://www.googleapis.com/auth/webmasters',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
const jwt = unsigned+'.'+crypto.sign('RSA-SHA256',Buffer.from(unsigned),key.private_key).toString('base64url');
const tok = (await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`})).json()).access_token;
const SITE='sc-domain:themoviebrowser.com', E=encodeURIComponent(SITE);
const H={Authorization:`Bearer ${tok}`,'content-type':'application/json'};
export async function api(path, body){const r=await fetch(path.startsWith('http')?path:`https://www.googleapis.com/webmasters/v3/sites/${E}${path}`,{method:body?'POST':'GET',headers:H,body:body?JSON.stringify(body):undefined});return r.json();}
export async function inspect(url){return (await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',{method:'POST',headers:H,body:JSON.stringify({inspectionUrl:url,siteUrl:SITE})})).json();}
const cmd=process.argv[2];
if(cmd==='sitemaps'){const d=await api('/sitemaps');for(const s of d.sitemap??[])console.log(s.path.split('/').pop(),s.isPending?'PENDING':'','dl',(s.lastDownloaded??'').slice(0,10),'err',s.errors,'sub',s.contents?.[0]?.submitted);}
if(cmd==='query'){const d=await api('/searchAnalytics/query',JSON.parse(process.argv[3]));for(const r of d.rows??[])console.log(r.keys.join(' | '),r.clicks,r.impressions,r.position.toFixed(1)); if(d.error)console.log(JSON.stringify(d.error));}
if(cmd==='inspect'){for(const u of process.argv.slice(3)){const d=await inspect(u);const i=d.inspectionResult?.indexStatusResult;console.log(u.replace('https://themoviebrowser.com',''),'|',i?.coverageState,'|',i?.verdict,'| crawled',(i?.lastCrawlTime??'').slice(0,10),'| canon',i?.googleCanonical===u?'self':i?.googleCanonical, d.error?JSON.stringify(d.error):'');}}
