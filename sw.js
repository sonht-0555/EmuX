let revision = 'EmuX_3.9';
var urlsToCache = [
    '/', 
    './index.html',
    './manifest.json',
    './src/css/main.css',
    './src/img/icon.png',
    './src/font/04bf.woff',
    './src/font/04b.ttf',
    './src/font/mother.ttf',
    './src/font/3x3.ttf',
    './src/core/gba.zip',
    './src/core/snes.zip',
    './src/core/snes2010.zip',
    './src/core/nes.zip',
    './src/core/nds.zip',
    './src/core/arcade.zip',
    './src/core/bios/neogeo.zip',
    './src/core/bios/scph5501.bin',
    './src/core/bios/bios7.bin',
    './src/core/bios/bios9.bin',
    './src/core/bios/firmware.bin',
    './src/core/ngp.zip',
    './src/core/genesis.zip',
    './src/core/ps1.zip',
    './src/backend/zip.js',
    './src/backend/loader.js',
    './src/backend/audio.js',
    './src/backend/audio-processor.js',
    './src/backend/video.js',
    './src/backend/w2d.js',
    './src/backend/wgl.js',
    './src/backend/wgpu.js',
    './src/backend/gamepad.js',
    './src/backend/storage.js',
    './src/backend/main.js',
    './src/frontend/global.js',
    './src/frontend/main.js',
    './src/frontend/page01.js',
    './src/frontend/page02.js'
];

self.addEventListener('install', function (event) {
    postMsg({msg:'Updating...'});
    var urlsAddVersion = urlsToCache.map(function (url) {
        return url + '?ver=' + revision
    });
    event.waitUntil(
        caches.open(revision)
            .then(function (cache) {
                return cache.addAll(urlsAddVersion);
            }).then(() => {
                self.skipWaiting()
            })
    );
});

self.addEventListener('fetch', function (event) {
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then(function (response) {
            var fetchPromise = response ? Promise.resolve(response) : fetch(event.request);
            return fetchPromise.then(function(res) {
                return addHeaders(res, event.request.url);
            });
        })
    );
});
function addHeaders(response, url) {
    if (!response || response.status === 0 || response.type === 'opaque' || !url.startsWith(self.location.origin)) {
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
    postMsg({msg:'Updated'})
});

function postMsg(obj) {
    clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((arr) => {
        for (client of arr) {
            client.postMessage(obj);
        }
    })
}