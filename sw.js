let revision = 'EmuX_4.33';
var urlsToCache = [
    './',
    './sw.js',
    './index.html',
    './manifest.json',
    './_headers',
    './CNAME',
    './src/utils/cloud.js'
];
self.addEventListener('install', event => {
    postMsg({msg: 'Updating...'});
    event.waitUntil(
        caches.open(revision).then(cache => cache.addAll(urlsToCache)).then(() => self.skipWaiting())
    );
});
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request, {ignoreSearch: true}).then(response => {
            if (response) return addHeaders(response, event.request.url);
            return fetch(event.request).then(res => {
                if (!res || res.status !== 200 || (res.type !== 'basic' && !event.request.url.includes('githubusercontent'))) {
                    return addHeaders(res, event.request.url);
                }
                const resClone = res.clone();
                caches.open(revision).then(cache => cache.put(event.request, resClone));
                return addHeaders(res, event.request.url);
            }).catch(() => new Response("Offline", {status: 503}));
        })
    );
});
function addHeaders(response, url) {
    if (!response || response.status === 0 || response.status === 304 || response.type === 'opaque' || (!url.startsWith(self.location.origin) && !url.includes('githubusercontent'))) return response;
    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then(keys => Promise.all(keys.map(key => key !== revision ? caches.delete(key) : null)))
        ])
    );
    postMsg({msg: 'Updated'});
});
function postMsg(obj) {
    clients.matchAll({includeUncontrolled: true, type: 'window'}).then(arr => arr.forEach(client => client.postMessage(obj)));
}