/* Public, credential-free Next shells and immutable assets only. Account data
   lives in owner-scoped IndexedDB; API/auth/audio responses are never cached. */
const build=(new URL(self.location.href).searchParams.get('build')||'local-v6').replace(/[^a-zA-Z0-9_-]/g,'');
const CACHE='noted-shell-v6-'+build;
const ROUTES=['/','/review','/library','/add','/discover','/auth'];
const ASSETS=['/interaction-policy.css','/offline.html','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png'];
const warming=new Map();
function warm(path){if(warming.has(path))return warming.get(path);const task=(async()=>{
 const cache=await caches.open(CACHE),response=await fetch(path,{credentials:'omit',cache:'reload',headers:{Accept:'text/html'}});
 if(!response.ok||!response.headers.get('content-type')?.includes('text/html')||response.redirected)throw Error('Public shell unavailable');
 const html=await response.clone().text(),dependencies=new Set();for(const match of html.matchAll(/(?:src|href)="([^"<>]+)"/g)){const url=new URL(match[1].replaceAll('&amp;','&'),self.location.origin);if(url.origin===self.location.origin&&url.pathname.startsWith('/_next/static/'))dependencies.add(url.href);}
 await Promise.all([...dependencies].map(async url=>{if(await cache.match(url))return;const asset=await fetch(url,{credentials:'omit',cache:'reload'});if(!asset.ok)throw Error('Static dependency unavailable');await cache.put(url,asset);}));
 // Publish HTML only once every dependency it names is safely available.
 await cache.put(path,response);
})().finally(()=>warming.delete(path));warming.set(path,task);return task;}
self.addEventListener('install',event=>{event.waitUntil((async()=>{try{const cache=await caches.open(CACHE);await cache.addAll(ASSETS);await Promise.all(ROUTES.map(warm));await self.skipWaiting();}catch(error){await caches.delete(CACHE);throw error;}})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys(),shells=keys.filter(k=>k.startsWith('noted-shell-v6-')),keep=new Set([CACHE,...shells.filter(k=>k!==CACHE).slice(-1)]);await Promise.all(keys.filter(k=>((k.startsWith('noted-install-')||k.startsWith('noted-shell-'))||k.startsWith('english-learning-install-'))&&!keep.has(k)).map(k=>caches.delete(k)));await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{try{const response=await fetch(request);if(!response.ok&&response.status>=500)throw Error('Unavailable');return response;}catch{return (ROUTES.includes(url.pathname)?await caches.match(url.pathname,{cacheName:CACHE}):null)||await caches.match('/offline.html',{cacheName:CACHE})||Response.error();}})());
  if(ROUTES.includes(url.pathname))event.waitUntil(warm(url.pathname).catch(()=>{}));
 }else if(url.pathname.startsWith('/_next/static/')||ASSETS.includes(url.pathname)&&!url.search){
  event.respondWith((async()=>{const cached=await caches.match(request);if(cached)return cached;const response=await fetch(request);if(response.ok){const cache=await caches.open(CACHE);await cache.put(url.href,response.clone());}return response;})());
 }
});
