let revision = 'EmuX_2.36';
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
    './src/core/arcade.zip',
    './src/core/neogeo.zip',
    './src/core/ngp.zip',
    './src/core/genesis.zip',
    './src/core/ps1.zip',
    './src/backend/zip.js',
    './src/backend/loader.js',
    './src/backend/audio.js',
    './src/backend/audio-processor.js',
    './src/backend/video.js',
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
        caches.match(event.request, {
            ignoreSearch: true
        }).then(function (response) {
            if (response) {
                return response;
            }
            return fetch(event.request);
        })
    );
});

self.addEventListener('activate', function (event) {
    var cacheAllowlist = [revision];
    event.waitUntil(
        caches.keys().then(function (cacheNames) {
            return Promise.all(
                cacheNames.map(function (cacheName) {
                    if (cacheAllowlist.indexOf(cacheName) === -1) {
                        console.log(cacheName)
                        return caches.delete(cacheName);
                    }
                })
            );
        })
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