let revision = 'EmuX_4.57';
var urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './src/assets/css/main.css',
    './src/assets/img/icon.png',
    './src/assets/font/04bf.woff',
    './src/assets/font/04b.ttf',
    './src/assets/font/mother.ttf',
    './src/assets/font/3x3.ttf',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/builds/gba.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/builds/gbc.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/builds/snes2010.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/builds/nes.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/builds/genesis.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/builds/ngp.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/builds/arcade.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/builds/nds2021.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/builds/ps1.zip',
    './src/core/bios/neogeo.zip',
    './src/core/bios/scph5501.bin',
    './src/core/bios/bios7.bin',
    './src/core/bios/bios9.bin',
    './src/core/bios/firmware.bin',
    './src/utils/zip.js',
    './src/utils/perf.js',
    './src/utils/s3mini.js',
    './src/core/loader.js',
    './src/drivers/audio.js',
    './src/drivers/video.js',
    './src/drivers/video/w2d.js',
    './src/drivers/video/wgl.js',
    './src/drivers/video/wgpu.js',
    './src/drivers/gamepad.js',
    './src/drivers/storage.js',
    './src/drivers/cloud.js',
    './src/core/main.js',
    './src/ui/global.js',
    './src/ui/page01.js',
    './src/ui/page02.js'
];
self.addEventListener('install', function (event) {
    postMsg({msg: 'Updating...'});
    event.waitUntil(
        caches.open(revision).then((newCache) => {
            return Promise.all(
                urlsToCache.map(url => newCache.add(url + '?ver=' + revision))
            ).then(() => self.skipWaiting());
        })
    );
});
self.addEventListener('fetch', function (event) {
    if (event.request.url.includes('api.github.com')) return;
    event.respondWith(
        caches.match(event.request, {ignoreSearch: true}).then(function (response) {
            if (response) return addHeaders(response, event.request.url);
            return fetch(event.request).then(function (res) {
                return addHeaders(res, event.request.url);
            }).catch(function () {
                return new Response("Offline", {status: 503});
            });
        })
    );
});
function addHeaders(response, url) {
    if (!response || response.status === 0 || response.status === 304 || response.type === 'opaque' || !url.startsWith(self.location.origin)) {
        return response;
    }
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
    newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}
self.addEventListener('activate', function (event) {
    var cacheAllowlist = [revision];
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then(function (cacheNames) {
                return Promise.all(
                    cacheNames.map(function (cacheName) {
                        if (cacheAllowlist.indexOf(cacheName) === -1) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
    postMsg({msg: 'Updated'});
});
function postMsg(obj) {
    clients.matchAll({includeUncontrolled: true, type: 'window'}).then((arr) => {
        for (const client of arr) {
            client.postMessage(obj);
        }
    });
}