let revision = 'EmuX_5.03';
var urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './src/assets/style/main.css',
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
    './src/lib/neogeo.zip',
    './src/lib/scph5501.bin',
    './src/lib/bios7.bin',
    './src/lib/bios9.bin',
    './src/lib/firmware.bin',
    './src/lib/zip.js',
    './src/lib/peer.js',
    './src/scripts/loader.js',
    './src/scripts/audio.js',
    './src/scripts/video.js',
    './src/scripts/w2d.js',
    './src/scripts/wgl.js',
    './src/scripts/wgpu.js',
    './src/scripts/gamepad.js',
    './src/utils/storage.js',
    './src/scripts/main.js',
    './src/scripts/netplay.js',
    './src/utils/perf.js',
    './src/interface/global.js',
    './src/interface/page01.js',
    './src/interface/page02.js'
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
        for (client of arr) {
            client.postMessage(obj);
        }
    });
}