let revision = 'EmuX_4.40';
var urlsToCache = [
    './',
    './sw.js',
    './index.html',
    './manifest.json',
];
self.addEventListener('install', event => {
    postMsg({msg: 'Updating...'});
    event.waitUntil(
        caches.open(revision).then(cache => cache.addAll(urlsToCache)).then(() => self.skipWaiting())
    );
});
self.addEventListener('fetch', event => {
    const isLocal = event.request.url.startsWith(self.location.origin);
    event.respondWith(
        caches.match(event.request, {ignoreSearch: true}).then(response => {
            if (response) return isLocal ? addHeaders(response) : response;
            return fetch(event.request).then(res => {
                if (!res || res.status !== 200) return res;
                if (isLocal || event.request.url.includes('githubusercontent')) {
                    const resClone = res.clone();
                    caches.open(revision).then(cache => cache.put(event.request, resClone)).catch(() => { });
                }
                return isLocal ? addHeaders(res) : res;
            }).catch(err => {
                if (event.request.mode === 'navigate') return new Response("Offline", {status: 503});
                throw err;
            });
        })
    );
});
function addHeaders(response) {
    if (!response || response.status === 0 || response.type === 'opaque') return response;
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