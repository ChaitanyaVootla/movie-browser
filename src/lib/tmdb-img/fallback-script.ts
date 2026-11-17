import { IMG_BLOCKED_KEY, IMG_PROXY_MAP } from "./path";

/**
 * Inline <head> script: when an image.tmdb.org, YouTube-thumbnail or Google
 * profile-photo image fails
 * to load, retry it through our same-origin `/tmdb-img` / `/yt-img` routes
 * (see ./path.ts). One "blocked" flag covers both: a network that blocks one
 * often blocks the other, and the cost of a wrong guess is a cached proxy hit.
 *
 * - It runs before <body> is parsed, so it sees the server-rendered images' errors.
 * - The capture listener on window runs before React's root listener and stops
 *   the event, so a component's own onError fallback (placeholder, hide) does not
 *   fire for a retry that may still succeed. If the retry fails too, that second
 *   error reaches React normally (the URL no longer matches).
 * - The network is only marked "TMDB blocked" when the proxied copy LOADS, so a
 *   genuine TMDB 404 does not route a normal visitor through our origin. Once
 *   marked (kept for a day), TMDB srcs are rewritten as they appear, so later
 *   images do not wait for a failure first.
 */
export const TMDB_IMG_FALLBACK_SCRIPT = `(function(){try{
var M=${JSON.stringify(IMG_PROXY_MAP)},K=${JSON.stringify(IMG_BLOCKED_KEY)},blocked=false;
try{var v=localStorage.getItem(K);blocked=!!v&&Date.now()-Number(v)<864e5}catch(e){}
function swap(i){var s=i.getAttribute("src");if(!s)return false;for(var j=0;j<M.length;j++){if(s.indexOf(M[j][0])===0){i.setAttribute("src",M[j][1]+s.slice(M[j][0].length));return true}}return false}
function scan(r){if(!r.querySelectorAll)return;var l=r.querySelectorAll("img");for(var k=0;k<l.length;k++)swap(l[k])}
function mark(){if(blocked)return;blocked=true;try{localStorage.setItem(K,String(Date.now()))}catch(e){}scan(document)}
window.addEventListener("error",function(e){var t=e.target;if(!t||t.tagName!=="IMG")return;if(swap(t)){e.stopPropagation();t.addEventListener("load",mark,{once:true})}},true);
new MutationObserver(function(ms){if(!blocked)return;for(var a=0;a<ms.length;a++){var m=ms[a];if(m.type==="attributes"){if(m.target.tagName==="IMG")swap(m.target)}else{for(var b=0;b<m.addedNodes.length;b++){var n=m.addedNodes[b];if(n.nodeType!==1)continue;if(n.tagName==="IMG")swap(n);else scan(n)}}}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["src"]});
}catch(e){}})();`;
