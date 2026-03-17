let revision = 'EmuX_6.37';
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
    // Stable Cores
    'https://raw.githubusercontent.com/sonht-0555/EmuX/stable/gba.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/stable/pce.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/stable/snes2010.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/stable/nes.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/stable/genesis.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/stable/ngp.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/stable/fbneo.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/stable/mame.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/stable/nds2021.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/stable/ps1.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/stable/wswan.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/stable/a26.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/stable/pokemini.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/stable/lynx.zip',
    // Lated Cores (Latest EMSDK)
    'https://raw.githubusercontent.com/sonht-0555/EmuX/lated/gba.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/lated/pce.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/lated/snes2010.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/lated/nes.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/lated/genesis.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/lated/ngp.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/lated/fbneo.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/lated/mame.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/lated/nds2021.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/lated/ps1.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/lated/wswan.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/lated/a26.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/lated/pokemini.zip',
    'https://raw.githubusercontent.com/sonht-0555/EmuX/lated/lynx.zip',
    './src/utils/bios/neogeo.zip',
    './src/utils/bios/scph5501.bin',
    './src/utils/bios/bios7.bin',
    './src/utils/bios/bios9.bin',
    './src/utils/bios/firmware.bin',
    './src/utils/bios/syscard3.pce',
    './src/utils/bios/lynxboot.img',
    './src/utils/zip.js',
    './src/core/loader.js',
    './src/core/audio.js',
    './src/core/video.js',
    './src/core/video/w2d.js',
    './src/core/video/wgl.js',
    './src/core/video/wgpu.js',
    './src/core/gamepad.js',
    './src/core/storage.js',
    './src/core/cloud.js',
    './src/core/main.js',
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