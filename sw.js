let revision = 'EmuX 2.03';
var urlsToCache = [
    './index.html',
    './manifest.json',
    './src/css/main.css',
    './src/img/icon.png',
    './src/font/04bf.woff',
    './src/font/04b.ttf',
    './src/font/mother.ttf',
    './src/font/3x3.ttf',
    './src/core/mgba.zip',
    './src/core/snes9x.zip',
    './src/core/quicknes.zip',
    './src/core/fbneo.zip',
    './src/core/neogeo.zip',
    './src/back/zip.js',
    './src/back/loader.js',
    './src/back/audio.js',
    './src/back/video.js',
    './src/back/gamepad.js',
    './src/back/storage.js',
    './src/back/main.js',
    './src/front/global.js',
    './src/front/main.js',
    './src/front/page01.js',
    './src/front/page02.js'
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