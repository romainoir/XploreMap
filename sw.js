// sw.js — intercepts /mapterhorn-dem/{z}/{x}/{y} and serves real Mapterhorn PMTiles tiles
// Works entirely in the browser. Needs your page served over http:// or https:// (not file://).

importScripts('https://unpkg.com/pmtiles@4.3.0/dist/pmtiles.js');

const pmProto = new pmtiles.Protocol({ metadata: true, errorOnMissingTile: false });

// Helper to build the shard name exactly like mapterhorn.html
function shardName(z, x, y) {
  return z <= 12 ? 'planet' : `6-${x >> (z - 6)}-${y >> (z - 6)}`;
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// Intercept only our fake path
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // We only handle /mapterhorn-dem/{z}/{x}/{y}
  if (!url.pathname.startsWith('/mapterhorn-dem/')) {
    return; // let the network handle everything else
  }

  event.respondWith(handleMapterhorn(event.request));
});

async function handleMapterhorn(request) {
  try {
    const { pathname } = new URL(request.url);
    // pathname: /mapterhorn-dem/z/x/y
    const parts = pathname.split('/').filter(Boolean); // ['mapterhorn-dem','z','x','y']
    if (parts.length !== 4) {
      return new Response('Bad path', { status: 400 });
    }
    const z = Number(parts[1]), x = Number(parts[2]), y = Number(parts[3]);
    if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return new Response('Bad coordinates', { status: 400 });
    }

    const name = shardName(z, x, y);
    const pmtilesTile = `pmtiles://https://download.mapterhorn.com/${name}.pmtiles/${z}/${x}/${y}.webp`;

    // Use the pmtiles Protocol to fetch tile bytes (supports range, etc.)
    const resp = await pmProto.tile({ url: pmtilesTile }, new AbortController());
    if (!resp || !resp.data) {
      return new Response('Tile not found', { status: 404 });
    }

    // Return as an image/webp blob (Terrarium data encoded in RGB)
    const body = resp.data;
    const headers = new Headers({
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });

    return new Response(body, { status: 200, headers });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
}
