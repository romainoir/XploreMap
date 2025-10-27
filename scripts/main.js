import {
  COLOR_RELIEF_COLOR_RAMP,
  BASE_STYLE_RELIEF_OPACITY,
  DEFAULT_3D_ORIENTATION,
  RELIEF_OPACITY,
  S2C_URL,
  S2_FADE_DURATION,
  S2_OPACITY,
  SKY_SETTINGS,
  TILE_FADE_DURATION,
  VIEW_MODES,
  VERSATILES_LOCAL_JSON,
  MAPTERHORN_TILE_URL,
  MAPTERHORN_ATTRIBUTION
} from './constants.js';
import {
  ensureGpxLayers,
  geojsonToGpx,
  parseGpxToGeoJson,
  zoomToGeojson
} from './gpx.js';
import { DirectionsManager } from '../directions_test.js';
import './pmtiles.js';
import { OfflineRouter, DEFAULT_NODE_CONNECTION_TOLERANCE_METERS } from './offline-router.js';
import { OrsRouter } from './openrouteservice-router.js';
import { extractOverpassNetwork } from './overpass-network.js';
import { extractOpenFreeMapNetwork } from './openfreemap-network.js';

const PEAK_POINTER_ID = 'peak-pointer';

function createPeakPointerImage(color = '#3ab7c6') {
  const width = 48;
  const height = 96;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const topOffset = 8;
  const stemWidth = width * 0.16;
  ctx.strokeStyle = color;
  ctx.lineWidth = stemWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(centerX, topOffset);
  ctx.lineTo(centerX, height - width * 0.28);
  ctx.stroke();

  ctx.fillStyle = color;
  const tipRadius = width * 0.24;
  ctx.beginPath();
  ctx.arc(centerX, height - tipRadius, tipRadius, 0, Math.PI * 2);
  ctx.fill();

  return ctx.getImageData(0, 0, width, height);
}

function ensurePeakPointerImage(map) {
  if (map.hasImage(PEAK_POINTER_ID)) return;
  const pointerImage = createPeakPointerImage();
  map.addImage(PEAK_POINTER_ID, pointerImage, { pixelRatio: 2 });
}

function updatePeakLabelLayer(map, layerId) {
  if (!map.getLayer(layerId)) return;
  ensurePeakPointerImage(map);

  const textField = [
    'format',
    ['coalesce', ['get', 'name:en'], ['get', 'name']],
    { 'font-scale': 1 },
    '\n',
    {},
    ['concat', ['number-format', ['get', 'ele'], { 'maximumFractionDigits': 0 }], ' m'],
    { 'font-scale': 0.85 }
  ];

  map.setLayoutProperty(layerId, 'icon-image', PEAK_POINTER_ID);
  map.setLayoutProperty(layerId, 'icon-size', 0.42);
  map.setLayoutProperty(layerId, 'icon-anchor', 'top');
  map.setLayoutProperty(layerId, 'icon-offset', [0, 0]);
  map.setLayoutProperty(layerId, 'text-anchor', 'bottom');
  map.setLayoutProperty(layerId, 'text-offset', [0, -1.4]);
  map.setLayoutProperty(layerId, 'text-field', textField);
  map.setLayoutProperty(layerId, 'text-font', ['Noto Sans Bold']);
  map.setLayoutProperty(layerId, 'text-line-height', 1.15);
  map.setLayoutProperty(layerId, 'symbol-spacing', 250);
  map.setLayoutProperty(layerId, 'text-max-width', 6);

  map.setPaintProperty(layerId, 'icon-opacity', 0.9);
  map.setPaintProperty(layerId, 'text-color', '#133540');
  map.setPaintProperty(layerId, 'text-halo-color', 'rgba(255,255,255,0.95)');
  map.setPaintProperty(layerId, 'text-halo-width', 2.2);
  map.setPaintProperty(layerId, 'text-halo-blur', 0.4);
}

function updatePeakLabels(map) {
  updatePeakLabelLayer(map, 'Mountain peak labels');
  updatePeakLabelLayer(map, 'Volcano peak labels');
}

function setBaseStyleOpacity(map, alpha) {
  const style = map.getStyle();
  if (!style || !style.layers) return;
  for (const layer of style.layers) {
    const id = layer.id;
    const type = layer.type;

    if (['s2cloudless', 'color-relief', 'hillshade', 'contours', 'contour-text'].includes(id)) continue;

    const setIf = (prop, value) => {
      try {
        const cur = map.getPaintProperty(id, prop);
        if (cur !== undefined) map.setPaintProperty(id, prop, value);
      } catch (_) {}
    };

    switch (type) {
      case 'background': setIf('background-opacity', alpha); break;
      case 'fill': setIf('fill-opacity', alpha); break;
      case 'line': setIf('line-opacity', alpha); break;
      case 'symbol': setIf('text-opacity', alpha); setIf('icon-opacity', alpha); break;
      case 'circle': setIf('circle-opacity', alpha); break;
      case 'fill-extrusion': setIf('fill-extrusion-opacity', alpha); break;
      case 'heatmap': setIf('heatmap-opacity', alpha); break;
      case 'raster': setIf('raster-opacity', alpha); break;
      default: break;
    }
  }
}

async function unregisterLegacyServiceWorker() {
  if (!('serviceWorker' in navigator) ||
      typeof navigator.serviceWorker.getRegistrations !== 'function') {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(async (registration) => {
      const candidates = [registration.active, registration.waiting, registration.installing]
        .filter(Boolean)
        .map((worker) => worker.scriptURL);
      if (candidates.some((url) => typeof url === 'string' && url.endsWith('/sw.js'))) {
        try {
          await registration.unregister();
        } catch (error) {
          console.warn('Unable to unregister legacy service worker', error);
        }
      }
    }));
  } catch (error) {
    console.warn('Legacy service worker cleanup failed', error);
  }
}

async function init() {
  await unregisterLegacyServiceWorker();

  const searchParams = new URLSearchParams(window.location.search);
  const networkSourceParam = searchParams.get('networkSource');
  const preferOpenFreeMapNetwork = networkSourceParam === 'openfreemap'
    || (!networkSourceParam && searchParams.has('openfreemapNetwork'));

  const versaStyle = await fetch(VERSATILES_LOCAL_JSON, { cache: 'no-store' }).then(r => r.json());
  versaStyle.glyphs = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
  if ('sprite' in versaStyle) delete versaStyle.sprite;

  const map = new maplibregl.Map({
    container: 'map',
    hash: true,
    center: [7.6586, 45.9763],
    zoom: 11.7,
    pitch: DEFAULT_3D_ORIENTATION.pitch,
    bearing: DEFAULT_3D_ORIENTATION.bearing,
    style: versaStyle,
    maxZoom: 18,
    maxPitch: 85,
    antialias: true,
    fadeDuration: TILE_FADE_DURATION
  });

  maplibrePreload(map, {
    text: 'Preparing Matterhorn…',
    minDuration: 600,
    background: 'linear-gradient(135deg, rgba(5,15,24,0.92) 0%, rgba(6,24,36,0.92) 50%, rgba(10,34,46,0.92) 100%)'
  });

  const gpxFileInput = document.getElementById('gpxFileInput');
  const gpxImportButton = document.getElementById('gpxImportButton');
  const gpxExportButton = document.getElementById('gpxExportButton');
  const directionsToggle = document.getElementById('directionsToggle');
  const directionsDock = document.getElementById('directionsDock');
  const directionsControl = document.getElementById('directionsControl');
  const transportModes = directionsControl?.querySelectorAll('[data-mode]') ?? [];
  const swapButton = document.getElementById('swapDirectionsButton');
  const undoButton = document.getElementById('undoDirectionsButton');
  const redoButton = document.getElementById('redoDirectionsButton');
  const clearButton = document.getElementById('clearDirectionsButton');
  const routeStats = document.getElementById('routeStats');
  const elevationChart = document.getElementById('elevationChart');
  const directionsInfoButton = document.getElementById('directionsInfoButton');
  const directionsHint = document.getElementById('directionsHint');
  const routingModeToggle = document.getElementById('routingModeToggle');
  const debugNetworkCheckbox = document.getElementById('debugNetworkCheckbox');
  const debugNetworkControl = document.getElementById('debugNetworkControl');

  const routerParam = searchParams.get('router');
  const preferRouteSnapper = routerParam !== 'legacy';
  const routeSnapperModuleParam = searchParams.get('routeSnapperModule');
  const routeSnapperWasmParam = searchParams.get('routeSnapperWasm');
  const routeSnapperOptions = {};
  if (routeSnapperModuleParam) {
    routeSnapperOptions.moduleUrl = routeSnapperModuleParam;
  }
  if (routeSnapperWasmParam) {
    routeSnapperOptions.wasmUrl = routeSnapperWasmParam;
  }

  const offlineRouter = new OfflineRouter({
    networkUrl: './data/offline-network.geojson',
    preferRouteSnapper,
    routeSnapperOptions: Object.keys(routeSnapperOptions).length ? routeSnapperOptions : undefined
  });
  if (typeof offlineRouter.setNodeConnectionToleranceMeters === 'function') {
    offlineRouter.setNodeConnectionToleranceMeters(DEFAULT_NODE_CONNECTION_TOLERANCE_METERS);
  }
  offlineRouter.ensureReady().catch((error) => {
    console.error('Failed to preload offline routing network', error);
  });

  const orsOptions = {};
  const globalOrsServiceUrl = typeof window !== 'undefined'
    && typeof window.OPENROUTESERVICE_SERVICE_URL === 'string'
      ? window.OPENROUTESERVICE_SERVICE_URL
      : null;
  const orsServiceUrlParam = searchParams.get('orsUrl');
  const resolvedServiceUrl = (orsServiceUrlParam && orsServiceUrlParam.trim().length)
    ? orsServiceUrlParam.trim()
    : (globalOrsServiceUrl && globalOrsServiceUrl.trim().length ? globalOrsServiceUrl.trim() : null);
  if (resolvedServiceUrl) {
    orsOptions.serviceUrl = resolvedServiceUrl;
  }

  const globalOrsApiKey = typeof window !== 'undefined'
    && typeof window.OPENROUTESERVICE_API_KEY === 'string'
      ? window.OPENROUTESERVICE_API_KEY
      : null;
  const orsApiKeyParam = searchParams.get('orsKey');
  const resolvedApiKey = (orsApiKeyParam && orsApiKeyParam.trim().length)
    ? orsApiKeyParam.trim()
    : (globalOrsApiKey && globalOrsApiKey.trim().length ? globalOrsApiKey.trim() : null);
  if (resolvedApiKey) {
    orsOptions.apiKey = resolvedApiKey;
  }

  orsOptions.fallbackRouter = offlineRouter;

  const orsRouter = new OrsRouter(orsOptions);

  const routers = {
    offline: offlineRouter,
    online: orsRouter
  };

  let activeRouterKey = 'offline';

  let offlineNetworkCoverage = null;
  let offlineNetworkRefreshPromise = null;

  const DEBUG_NETWORK_SOURCE_ID = 'offline-router-network-debug';
  const DEBUG_NETWORK_LAYER_ID = 'offline-router-network-debug';
  const DEBUG_NETWORK_INTERSECTIONS_LAYER_ID = 'offline-router-network-debug-intersections';
  let debugNetworkVisible = false;
  let debugNetworkData = null;
  let directionsManager = null;

  const bringDebugNetworkToFront = () => {
    if (!map || typeof map.moveLayer !== 'function') {
      return;
    }
    if (map.getLayer(DEBUG_NETWORK_LAYER_ID)) {
      map.moveLayer(DEBUG_NETWORK_LAYER_ID);
    }
    if (map.getLayer(DEBUG_NETWORK_INTERSECTIONS_LAYER_ID)) {
      map.moveLayer(DEBUG_NETWORK_INTERSECTIONS_LAYER_ID);
    }
  };

  const ensureMapStyleReady = () => {
    if (!map || typeof map.isStyleLoaded !== 'function') {
      return Promise.resolve();
    }
    if (map.isStyleLoaded()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      map.once('style.load', resolve);
    });
  };

  const updateDebugNetworkControlState = (active) => {
    if (!debugNetworkCheckbox) return;
    const isActive = Boolean(active && activeRouterKey === 'offline');
    debugNetworkCheckbox.checked = isActive;
  };

  const updateRoutingModeToggle = () => {
    if (!routingModeToggle) return;
    const offlineActive = activeRouterKey === 'offline';
    routingModeToggle.classList.toggle('active', offlineActive);
    routingModeToggle.classList.toggle('is-offline', offlineActive);
    routingModeToggle.classList.toggle('is-online', !offlineActive);
    routingModeToggle.setAttribute('aria-pressed', offlineActive ? 'true' : 'false');
    routingModeToggle.dataset.mode = offlineActive ? 'offline' : 'online';
    routingModeToggle.textContent = offlineActive ? 'Offline routing' : 'Online routing';
    routingModeToggle.title = offlineActive
      ? 'Switch to online routing'
      : 'Switch to offline routing';
    routingModeToggle.setAttribute(
      'aria-label',
      offlineActive
        ? 'Offline routing enabled. Activate to switch to online routing.'
        : 'Online routing enabled. Activate to switch to offline routing.'
    );
  };

  const updateDebugNetworkAvailability = () => {
    const offlineActive = activeRouterKey === 'offline';
    if (debugNetworkControl) {
      debugNetworkControl.hidden = !offlineActive;
      debugNetworkControl.setAttribute('aria-hidden', offlineActive ? 'false' : 'true');
    }
    if (debugNetworkCheckbox) {
      debugNetworkCheckbox.disabled = !offlineActive;
      if (!offlineActive) {
        if (debugNetworkVisible) {
          hideDebugNetworkLayer();
        }
        debugNetworkVisible = false;
        updateDebugNetworkControlState(false);
      } else {
        updateDebugNetworkControlState(debugNetworkVisible);
      }
    }
  };

  const loadDebugNetworkData = async () => {
    if (activeRouterKey !== 'offline') {
      return null;
    }
    if (debugNetworkData) {
      return debugNetworkData;
    }
    try {
      await offlineRouter.ensureReady();
      const dataset = typeof offlineRouter.getNetworkDebugGeoJSON === 'function'
        ? offlineRouter.getNetworkDebugGeoJSON({ intersectionsOnly: true })
        : offlineRouter.getNetworkGeoJSON();
      const hasFeatures = Array.isArray(dataset?.features) && dataset.features.length > 0;
      if (dataset && typeof dataset === 'object' && hasFeatures) {
        debugNetworkData = dataset;
        return debugNetworkData;
      }
    } catch (error) {
      console.warn('Failed to access cached offline network data', error);
    }
    try {
      const response = await fetch('./data/offline-network.geojson', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Debug network request failed (${response.status})`);
      }
      const fallback = await response.json();
      const hasFallbackFeatures = Array.isArray(fallback?.features) && fallback.features.length > 0;
      if (!hasFallbackFeatures) {
        console.warn('Offline routing network debug dataset is empty');
        return null;
      }
      debugNetworkData = fallback;
      return debugNetworkData;
    } catch (error) {
      console.error('Failed to load offline routing network for debugging', error);
      return null;
    }
  };

  const applyDebugNetworkLayer = async () => {
    if (activeRouterKey !== 'offline') {
      return false;
    }
    const data = await loadDebugNetworkData();
    if (!data) {
      return false;
    }
    await ensureMapStyleReady();
    if (!map.getSource(DEBUG_NETWORK_SOURCE_ID)) {
      map.addSource(DEBUG_NETWORK_SOURCE_ID, { type: 'geojson', data });
    } else {
      map.getSource(DEBUG_NETWORK_SOURCE_ID).setData(data);
    }
    if (!map.getLayer(DEBUG_NETWORK_LAYER_ID)) {
      map.addLayer({
        id: DEBUG_NETWORK_LAYER_ID,
        type: 'line',
        source: DEBUG_NETWORK_SOURCE_ID,
        paint: {
          'line-color': '#2d7bd6',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            1.1,
            13,
            1.8,
            16,
            3.2
          ],
          'line-opacity': 0.65
        }
      });
    }
    map.setLayoutProperty(DEBUG_NETWORK_LAYER_ID, 'visibility', 'visible');
    if (!map.getLayer(DEBUG_NETWORK_INTERSECTIONS_LAYER_ID)) {
      map.addLayer({
        id: DEBUG_NETWORK_INTERSECTIONS_LAYER_ID,
        type: 'circle',
        source: DEBUG_NETWORK_SOURCE_ID,
        filter: [
          'all',
          ['==', ['geometry-type'], 'Point'],
          ['>=', ['coalesce', ['get', 'nodeDegree'], 0], 3]
        ],
        paint: {
          'circle-radius': [
            'interpolate',
            ['exponential', 1.4],
            ['zoom'],
            8,
            0.6,
            12,
            1.4,
            16,
            2.6
          ],
          'circle-color': '#2ca25f',
          'circle-stroke-color': '#0b4222',
          'circle-stroke-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8,
            0.4,
            16,
            0.9
          ],
          'circle-opacity': 0.85
        }
      });
    }
    if (map.getLayer(DEBUG_NETWORK_INTERSECTIONS_LAYER_ID)) {
      map.setLayoutProperty(DEBUG_NETWORK_INTERSECTIONS_LAYER_ID, 'visibility', 'visible');
    }
    bringDebugNetworkToFront();
    return true;
  };

  const hideDebugNetworkLayer = () => {
    if (map.getLayer(DEBUG_NETWORK_LAYER_ID)) {
      map.setLayoutProperty(DEBUG_NETWORK_LAYER_ID, 'visibility', 'none');
    }
    if (map.getLayer(DEBUG_NETWORK_INTERSECTIONS_LAYER_ID)) {
      map.setLayoutProperty(DEBUG_NETWORK_INTERSECTIONS_LAYER_ID, 'visibility', 'none');
    }
  };

  const boundsToPlain = (bounds) => {
    if (!bounds) {
      return null;
    }
    if (typeof bounds.getWest === 'function') {
      return {
        west: bounds.getWest(),
        east: bounds.getEast(),
        south: bounds.getSouth(),
        north: bounds.getNorth()
      };
    }
    const west = Number(bounds.west);
    const east = Number(bounds.east);
    const south = Number(bounds.south);
    const north = Number(bounds.north);
    if ([west, east, south, north].some((value) => !Number.isFinite(value))) {
      return null;
    }
    return { west, east, south, north };
  };

  const boundsContains = (outer, inner, epsilon = 1e-6) => {
    if (!outer || !inner) {
      return false;
    }
    return inner.west >= outer.west - epsilon
      && inner.east <= outer.east + epsilon
      && inner.south >= outer.south - epsilon
      && inner.north <= outer.north + epsilon;
  };

  const mergeBounds = (...boundsList) => {
    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;

    boundsList.forEach((entry) => {
      const plain = boundsToPlain(entry);
      if (!plain) {
        return;
      }
      if (plain.west < west) west = plain.west;
      if (plain.east > east) east = plain.east;
      if (plain.south < south) south = plain.south;
      if (plain.north > north) north = plain.north;
    });

    if (![west, east, south, north].every((value) => Number.isFinite(value))) {
      return null;
    }

    return { west, east, south, north };
  };

  const deriveOverpassCenter = (bounds) => {
    const plain = boundsToPlain(bounds);
    if (!plain) {
      return null;
    }
    const lat = (plain.north + plain.south) / 2;
    const lon = (plain.east + plain.west) / 2;
    if (![lat, lon].every((value) => Number.isFinite(value))) {
      return null;
    }
    return { lat, lon };
  };

  const computeCoordinateBounds = (coordinates) => {
    if (!Array.isArray(coordinates) || !coordinates.length) {
      return null;
    }

    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;

    coordinates.forEach((coord) => {
      if (!Array.isArray(coord) || coord.length < 2) {
        return;
      }
      const lng = Number(coord[0]);
      const lat = Number(coord[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return;
      }
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    });

    if (!Number.isFinite(west) || !Number.isFinite(east) || !Number.isFinite(south) || !Number.isFinite(north)) {
      return null;
    }

    const expandIfZeroSpan = (min, max) => {
      if (min === max) {
        const delta = 1e-6;
        return [min - delta, max + delta];
      }
      return [min, max];
    };

    const [normWest, normEast] = expandIfZeroSpan(west, east);
    const [normSouth, normNorth] = expandIfZeroSpan(south, north);

    return {
      west: normWest,
      east: normEast,
      south: normSouth,
      north: normNorth
    };
  };

  const shouldRefreshOfflineNetwork = () => {
    if (!map || typeof map.getBounds !== 'function') {
      return false;
    }
    const current = boundsToPlain(map.getBounds());
    if (!current) {
      return false;
    }
    if (!offlineNetworkCoverage) {
      return true;
    }
    return !boundsContains(offlineNetworkCoverage, current);
  };

  const refreshOfflineNetwork = async (options = {}) => {
    if (!map) {
      return null;
    }
    if (activeRouterKey !== 'offline') {
      return null;
    }
    if (offlineNetworkRefreshPromise) {
      return offlineNetworkRefreshPromise;
    }
    const { waypointBounds = null } = options || {};
    offlineNetworkRefreshPromise = (async () => {
      try {
        const mapBounds = typeof map.getBounds === 'function' ? map.getBounds() : null;
        const combinedBounds = mergeBounds(mapBounds, waypointBounds);
        const fallbackBounds = boundsToPlain(mapBounds) ?? boundsToPlain(waypointBounds);
        const targetBounds = combinedBounds ?? fallbackBounds;
        const mapCenter = typeof map.getCenter === 'function' ? map.getCenter() : null;
        const centerLat = Number(mapCenter?.lat ?? mapCenter?.latitude ?? mapCenter?.[1]);
        const centerLon = Number(mapCenter?.lng ?? mapCenter?.lon ?? mapCenter?.longitude ?? mapCenter?.[0]);

        let networkResult = { network: null, coverageBounds: null };

        if (preferOpenFreeMapNetwork) {
          const network = await extractOpenFreeMapNetwork(map, { targetBounds });
          networkResult = { network, coverageBounds: null };
        } else {
          let overpassCenter = Number.isFinite(centerLat) && Number.isFinite(centerLon)
            ? { lat: centerLat, lon: centerLon }
            : null;
          if (!overpassCenter) {
            const fallbackCenter = deriveOverpassCenter(targetBounds ?? fallbackBounds);
            if (fallbackCenter) {
              overpassCenter = fallbackCenter;
            }
          }
          if (!overpassCenter) {
            throw new Error('Unable to determine center coordinate for Overpass network extraction');
          }
          networkResult = await extractOverpassNetwork(overpassCenter);
        }

        const { network } = networkResult;
        let { coverageBounds } = networkResult;
        if (network && Array.isArray(network.features) && network.features.length) {
          await offlineRouter.setNetworkGeoJSON(network);
          const debugDataset = typeof offlineRouter.getNetworkDebugGeoJSON === 'function'
            ? offlineRouter.getNetworkDebugGeoJSON({ intersectionsOnly: true })
            : network;
          debugNetworkData = debugDataset || network;
          const fallbackCoverage = boundsToPlain(targetBounds ?? fallbackBounds);
          offlineNetworkCoverage = coverageBounds ?? fallbackCoverage;
          if (debugNetworkVisible) {
            await applyDebugNetworkLayer();
          }
        } else {
          const sourceLabel = preferOpenFreeMapNetwork ? 'OpenFreeMap' : 'Overpass';
          console.warn(`${sourceLabel} network extraction returned no features for offline routing`);
        }
      } catch (error) {
        const sourceLabel = preferOpenFreeMapNetwork ? 'OpenFreeMap' : 'Overpass';
        console.error(`Failed to rebuild offline routing network from ${sourceLabel} data`, error);
      } finally {
        offlineNetworkRefreshPromise = null;
      }
    })();
    return offlineNetworkRefreshPromise;
  };

  const setActiveRouter = async (targetKey, { reroute = false } = {}) => {
    if (!routers[targetKey]) {
      return;
    }

    if (targetKey === activeRouterKey) {
      updateRoutingModeToggle();
      updateDebugNetworkAvailability();
      if (
        reroute
        && directionsManager
        && typeof directionsManager.getRoute === 'function'
        && Array.isArray(directionsManager.waypoints)
        && directionsManager.waypoints.length >= 2
      ) {
        directionsManager.getRoute();
      }
      return;
    }

    if (routingModeToggle) {
      routingModeToggle.disabled = true;
    }

    activeRouterKey = targetKey;
    updateRoutingModeToggle();
    updateDebugNetworkAvailability();

    try {
      if (targetKey === 'offline') {
        try {
          await offlineRouter.ensureReady();
        } catch (ensureError) {
          console.warn('Offline router initialization failed during router switch', ensureError);
        }
        try {
          await refreshOfflineNetwork();
        } catch (networkError) {
          console.warn('Failed to refresh offline routing network during router switch', networkError);
        }
      } else {
        if (debugNetworkVisible) {
          hideDebugNetworkLayer();
          debugNetworkVisible = false;
        }
        updateDebugNetworkControlState(false);
      }

      if (directionsManager && typeof directionsManager.setRouter === 'function') {
        directionsManager.setRouter(routers[targetKey], { reroute });
      }
    } finally {
      if (routingModeToggle) {
        routingModeToggle.disabled = false;
      }
      updateRoutingModeToggle();
      updateDebugNetworkAvailability();
    }
  };

  const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] };

  let currentGpxData = EMPTY_COLLECTION;
  let directionsExportData = EMPTY_COLLECTION;
  let directionsSegmentExports = [];

  const ensureFeatureCollection = (geojson) => {
    if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
      return EMPTY_COLLECTION;
    }
    return {
      type: 'FeatureCollection',
      features: geojson.features.filter(feature => Boolean(feature))
    };
  };

  const buildCombinedExportData = () => {
    const collections = [currentGpxData, directionsExportData];
    const features = [];
    collections.forEach((collection) => {
      if (!collection || collection.type !== 'FeatureCollection') return;
      (collection.features || []).forEach((feature) => {
        if (feature) features.push(feature);
      });
    });
    return { type: 'FeatureCollection', features };
  };

  const cloneFeature = (feature) => {
    if (!feature) return null;
    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(feature);
      }
    } catch (_) {}
    try {
      return JSON.parse(JSON.stringify(feature));
    } catch (_) {
      return null;
    }
  };

  const slugify = (value) => {
    if (typeof value !== 'string') return 'segment';
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return normalized || 'segment';
  };

  const applyGpxData = (geojson, { fitBounds = false } = {}) => {
    currentGpxData = ensureFeatureCollection(geojson);

    const applyLayers = () => {
      ensureGpxLayers(map, currentGpxData);
      if (fitBounds && currentGpxData.features.length) {
        zoomToGeojson(map, currentGpxData);
      }
    };

    if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) {
      map.once('style.load', applyLayers);
    } else {
      applyLayers();
    }
  };

  applyGpxData(EMPTY_COLLECTION);

  map.on('load', async () => {
    try {
      await refreshOfflineNetwork();
    } catch (error) {
      console.warn('Initial offline routing network build failed', error);
    }

    try {
      directionsManager = new DirectionsManager(map, [
        directionsToggle,
        directionsDock,
        directionsControl,
        transportModes,
        swapButton,
        undoButton,
        redoButton,
        clearButton,
        routeStats,
        elevationChart,
        directionsInfoButton,
        directionsHint
      ], {
        router: offlineRouter
      });
      const initialRouter = routers[activeRouterKey] ?? offlineRouter;
      if (typeof directionsManager.setRouter === 'function') {
        directionsManager.setRouter(initialRouter);
      }
      directionsManager.setRouteSegmentsListener((payload) => {
        const isObject = payload && typeof payload === 'object';
        const dataset = isObject && payload.full ? payload.full : payload;
        directionsExportData = ensureFeatureCollection(dataset);
        const segments = isObject && Array.isArray(payload.segments) ? payload.segments : [];
        directionsSegmentExports = segments
          .map((entry) => {
            const collection = ensureFeatureCollection(entry?.collection);
            if (!collection.features || !collection.features.length) {
              return null;
            }
            const name = typeof entry?.name === 'string' && entry.name.trim().length
              ? entry.name.trim()
              : null;
            return {
              name,
              index: Number.isInteger(entry?.index) ? entry.index : null,
              collection
            };
          })
          .filter(Boolean);
      });

      directionsManager.setNetworkPreparationCallback(async ({ waypoints }) => {
        if (activeRouterKey !== 'offline') {
          return;
        }
        const coords = Array.isArray(waypoints) ? waypoints : [];
        const bounds = computeCoordinateBounds(coords);

        const lacksWaypointCoverage = () => {
          if (!coords.length) {
            return false;
          }
          if (!offlineNetworkCoverage) {
            return true;
          }
          if (!bounds) {
            return !offlineNetworkCoverage;
          }
          return !boundsContains(offlineNetworkCoverage, bounds, 1e-5);
        };

        const lacksMapCoverage = () => {
          if (coords.length) {
            return false;
          }
          if (!offlineNetworkCoverage) {
            return true;
          }
          return shouldRefreshOfflineNetwork();
        };

        if (lacksWaypointCoverage() || lacksMapCoverage()) {
          await refreshOfflineNetwork({ waypointBounds: bounds });
        }
      });
    } catch (error) {
      console.error('Failed to initialize directions manager', error);
    }
  });

  map.on('style.load', () => {
    offlineNetworkCoverage = null;
    offlineNetworkRefreshPromise = null;
    debugNetworkData = null;
    if (!debugNetworkVisible) {
      return;
    }
    applyDebugNetworkLayer().catch((error) => {
      console.error('Failed to reapply routing network debug layer', error);
    });
  });

  if (debugNetworkCheckbox) {
    updateDebugNetworkControlState(false);
    debugNetworkCheckbox.addEventListener('change', async () => {
      if (activeRouterKey !== 'offline') {
        updateDebugNetworkControlState(false);
        return;
      }
      const targetState = debugNetworkCheckbox.checked;
      debugNetworkCheckbox.disabled = true;
      try {
        if (targetState) {
          let applied = await applyDebugNetworkLayer();
          if (!applied) {
            await refreshOfflineNetwork();
            applied = await applyDebugNetworkLayer();
          }
          if (!applied) {
            window.alert('Unable to display the routing network. Check the console for details.');
          }
          debugNetworkVisible = applied;
        } else {
          hideDebugNetworkLayer();
          debugNetworkVisible = false;
        }
      } catch (error) {
        console.error('Failed to toggle routing network overlay', error);
      } finally {
        debugNetworkCheckbox.disabled = false;
        updateDebugNetworkControlState(debugNetworkVisible);
      }
    });
  }

  if (routingModeToggle) {
    routingModeToggle.addEventListener('click', () => {
      const targetKey = activeRouterKey === 'offline' ? 'online' : 'offline';
      setActiveRouter(targetKey, { reroute: true }).catch((error) => {
        console.error('Failed to switch routing mode', error);
      });
    });
  }

  updateRoutingModeToggle();
  updateDebugNetworkAvailability();

  if (gpxImportButton && gpxFileInput) {
    gpxImportButton.addEventListener('click', () => {
      gpxFileInput.click();
    });

    gpxFileInput.addEventListener('change', async () => {
      const file = gpxFileInput.files && gpxFileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const geojson = parseGpxToGeoJson(text);
        if (!geojson || !geojson.features || geojson.features.length === 0) {
          window.alert('No GPX features were found in the selected file.');
        } else {
          applyGpxData(geojson, { fitBounds: true });
          if (directionsManager && typeof directionsManager.importRouteFromGeojson === 'function') {
            const imported = directionsManager.importRouteFromGeojson(geojson);
            if (!imported) {
              console.warn('Unable to initialize routing from the imported GPX data');
            }
          }
        }
      } catch (error) {
        console.error('Failed to import GPX file', error);
        window.alert('Unable to load the selected GPX file. Please ensure it is valid.');
      } finally {
        gpxFileInput.value = '';
      }
    });
  }

  if (gpxExportButton) {
    gpxExportButton.addEventListener('click', () => {
      const dataset = buildCombinedExportData();
      if (!dataset.features || dataset.features.length === 0) {
        window.alert('There is no GPX data to export yet.');
        return;
      }
      try {
        const downloadGpx = (content, filename) => {
          const blob = new Blob([content], { type: 'application/gpx+xml' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 0);
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseName = `xploremap-${timestamp}`;
        const segmentCollections = Array.isArray(directionsSegmentExports)
          ? directionsSegmentExports.filter((entry) => entry && entry.collection?.features?.length)
          : [];

        if (segmentCollections.length) {
          segmentCollections.forEach((entry, index) => {
            try {
              const combinedFeatures = [];
              (currentGpxData.features || []).forEach((feature) => {
                const clone = cloneFeature(feature);
                if (clone) combinedFeatures.push(clone);
              });
              (entry.collection.features || []).forEach((feature) => {
                const clone = cloneFeature(feature);
                if (clone) combinedFeatures.push(clone);
              });
              if (!combinedFeatures.length) {
                return;
              }
              const segmentDataset = { type: 'FeatureCollection', features: combinedFeatures };
              const segmentLabel = entry.name ? slugify(entry.name) : `segment-${String(index + 1).padStart(2, '0')}`;
              const filename = `${baseName}-${String(index + 1).padStart(2, '0')}-${segmentLabel}.gpx`;
              const gpxContent = geojsonToGpx(segmentDataset);
              downloadGpx(gpxContent, filename);
            } catch (segmentError) {
              console.error('Failed to export segmented GPX data', segmentError);
            }
          });
          return;
        }

        const gpxContent = geojsonToGpx(dataset);
        downloadGpx(gpxContent, `${baseName}.gpx`);
      } catch (error) {
        console.error('Failed to export GPX data', error);
        window.alert('Unable to export GPX data.');
      }
    });
  }

  map.on('styleimagemissing', (e) => {
    if (map.hasImage(e.id)) return;
    const data = new Uint8Array([0, 0, 0, 0]);
    map.addImage(e.id, { width: 1, height: 1, data });
  });

  const demSource = new mlcontour.DemSource({
    url: MAPTERHORN_TILE_URL,
    encoding: 'terrarium',
    maxzoom: 18,
    worker: true,
    tileSize: 512
  });
  demSource.setupMaplibre(maplibregl);

  let currentViewMode = VIEW_MODES.THREED;
  let last3DOrientation = { ...DEFAULT_3D_ORIENTATION };
  const vignetteEl = document.querySelector('.vignette');
  const viewToggleBtn = document.getElementById('toggle3D');

  function updateViewToggle(mode) {
    if (!viewToggleBtn) return;
    const is3D = mode === VIEW_MODES.THREED;
    viewToggleBtn.classList.toggle('active', is3D);
    const nextLabel = is3D ? 'Switch to 2D' : 'Switch to 3D';
    viewToggleBtn.setAttribute('aria-pressed', String(is3D));
    viewToggleBtn.setAttribute('aria-label', nextLabel);
    viewToggleBtn.setAttribute('title', nextLabel);
  }

  function syncTerrainAndSky() {
    if (currentViewMode === VIEW_MODES.THREED) {
      if (map.getSource('terrainSource')) {
        map.setTerrain({ source: 'terrainSource', exaggeration: 1 });
      }
      map.setSky(SKY_SETTINGS);
    } else {
      map.setTerrain(null);
      map.setSky(null);
    }
    if (vignetteEl) vignetteEl.dataset.mode = currentViewMode;
  }

  function applyViewMode(mode, { animate = true } = {}) {
    if (mode === currentViewMode && animate) {
      updateViewToggle(mode);
      if (vignetteEl) vignetteEl.dataset.mode = currentViewMode;
      return;
    }

    const is3D = mode === VIEW_MODES.THREED;
    if (!is3D) {
      last3DOrientation = {
        pitch: map.getPitch(),
        bearing: map.getBearing()
      };
    }

    currentViewMode = mode;
    updateViewToggle(mode);
    if (vignetteEl) vignetteEl.dataset.mode = mode;

    const targetOrientation = is3D ? last3DOrientation : { pitch: 0, bearing: 0 };
    if (animate) {
      map.easeTo({
        pitch: targetOrientation.pitch,
        bearing: targetOrientation.bearing,
        duration: 1000
      });
    } else {
      map.setPitch(targetOrientation.pitch);
      map.setBearing(targetOrientation.bearing);
    }

    if (map.dragRotate && typeof map.dragRotate[is3D ? 'enable' : 'disable'] === 'function') {
      map.dragRotate[is3D ? 'enable' : 'disable']();
    }
    if (map.touchZoomRotate && typeof map.touchZoomRotate[is3D ? 'enableRotation' : 'disableRotation'] === 'function') {
      map.touchZoomRotate[is3D ? 'enableRotation' : 'disableRotation']();
    }

    syncTerrainAndSky();
  }

  if (viewToggleBtn) {
    viewToggleBtn.addEventListener('click', () => {
      const nextMode = currentViewMode === VIEW_MODES.THREED ? VIEW_MODES.TWOD : VIEW_MODES.THREED;
      applyViewMode(nextMode);
    });
  }

  if (vignetteEl) {
    vignetteEl.dataset.mode = currentViewMode;
  }
  updateViewToggle(currentViewMode);

  async function applyOverlays() {
    const rmL = id => { if (map.getLayer(id)) map.removeLayer(id); };
    const rmS = id => { if (map.getSource(id)) map.removeSource(id); };

    const liveLayers = map.getStyle().layers || [];
    let topLabelId = null;
    for (let i = liveLayers.length - 1; i >= 0; i--) {
      if (liveLayers[i].type === 'symbol') { topLabelId = liveLayers[i].id; break; }
    }

    rmL('contour-text');
    rmL('contours');
    rmL('hillshade');
    rmL('color-relief');
    rmL('s2cloudless');
    rmS('contours');
    rmS('hillshadeSource');
    rmS('reliefDem');
    rmS('terrainSource');
    rmS('s2cloudless');

    map.addSource('terrainSource', {
      type: 'raster-dem',
      tiles: [MAPTERHORN_TILE_URL],
      encoding: 'terrarium',
      tileSize: 512,
      maxzoom: 18,
      attribution: MAPTERHORN_ATTRIBUTION
    });
    map.addSource('hillshadeSource', {
      type: 'raster-dem',
      tiles: [MAPTERHORN_TILE_URL],
      encoding: 'terrarium',
      tileSize: 512,
      maxzoom: 18,
      attribution: MAPTERHORN_ATTRIBUTION
    });
    map.addSource('reliefDem', {
      type: 'raster-dem',
      tiles: [MAPTERHORN_TILE_URL],
      encoding: 'terrarium',
      tileSize: 512,
      maxzoom: 18,
      attribution: MAPTERHORN_ATTRIBUTION
    });

    map.addSource('color-relief', {
      type: 'raster-dem',
      tiles: [MAPTERHORN_TILE_URL],
      encoding: 'terrarium',
      tileSize: 512,
      maxzoom: 18,
      attribution: MAPTERHORN_ATTRIBUTION
    });

    map.addLayer({
      id: 'terrain',
      type: 'raster',
      source: 'terrainSource'
    });

    map.addLayer({
      id: 'color-relief',
      type: 'color-relief',
      source: 'color-relief',
      paint: {
        'color-relief-color': COLOR_RELIEF_COLOR_RAMP,
        'color-relief-opacity': RELIEF_OPACITY
      }
    }, topLabelId || undefined);

    map.addSource('s2cloudless', {
      type: 'raster',
      tiles: [S2C_URL],
      tileSize: 256,
      attribution: '<a href="https://www.eox.at/">© EOX</a>'
    });

    map.addLayer({
      id: 's2cloudless',
      type: 'raster',
      source: 's2cloudless',
      paint: {
        'raster-opacity': S2_OPACITY,
        'raster-fade-duration': S2_FADE_DURATION
      }
    }, topLabelId || undefined);

    map.addLayer({
      id: 'hillshade',
      type: 'hillshade',
      source: 'hillshadeSource',
      paint: {
        'hillshade-highlight-color': 'rgba(255,255,255,0.9)',
        'hillshade-accent-color': 'rgba(0,0,0,0.55)',
        'hillshade-exaggeration': 0.23,
        'hillshade-shadow-color': 'rgba(0,0,0,0.55)'
      }
    }, topLabelId || undefined);

    map.addSource('contours', {
      type: 'vector',
      tiles: [
        demSource.contourProtocolUrl({
          multiplier: 1,
          thresholds: { 11: [60, 300], 12: [30, 150], 13: [30, 150], 14: [15, 60], 15: [6, 30] },
          elevationKey: 'ele',
          levelKey: 'level',
          contourLayer: 'contours'
        })
      ],
      maxzoom: 16
    });

    map.addLayer({
      id: 'contours',
      type: 'line',
      source: 'contours',
      'source-layer': 'contours',
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': 'rgba(0,0,0,0.55)',
        'line-width': ['match', ['get', 'level'], 1, 1, 0.5],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 13.4, 0, 13.5, 0.45, 15, 0.85, 17, 1]
      }
    });

    map.addLayer({
      id: 'contour-text',
      type: 'symbol',
      source: 'contours',
      'source-layer': 'contours',
      filter: ['>', ['get', 'level'], 0],
      layout: {
        'symbol-placement': 'line',
        'text-anchor': 'center',
        'text-size': 10,
        'text-field': ['concat', ['number-format', ['get', 'ele'], { 'maximumFractionDigits': 0 }], ' m'],
        'text-font': ['Noto Sans Bold']
      },
      paint: {
        'text-halo-color': 'white',
        'text-halo-width': 1,
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 13.4, 0, 13.6, 0.5, 14.2, 0.9]
      }
    });

    if (topLabelId) {
      map.moveLayer('contours', topLabelId);
      map.moveLayer('contour-text', topLabelId);
    }

    ensureGpxLayers(map, currentGpxData, topLabelId);

    const symbolLayers = (map.getStyle().layers || []).filter(l => l.type === 'symbol');
    symbolLayers.forEach(l => map.moveLayer(l.id));

    if (debugNetworkVisible) {
      bringDebugNetworkToFront();
    }

    syncTerrainAndSky();

    const s2Btn = document.getElementById('toggleS2');
    if (s2Btn) {
      const vis = (map.getLayoutProperty('s2cloudless', 'visibility') || 'visible') !== 'none';
      s2Btn.classList.toggle('active', vis);
    }

    setBaseStyleOpacity(map, BASE_STYLE_RELIEF_OPACITY);
    updatePeakLabels(map);
  }

  map.on('style.load', applyOverlays);

  const methodButtons = Array.from(document.querySelectorAll('.hs-panel .btn'));
  const DEFAULT_METHOD = 'igor';
  function setHillshadeMethod(method) {
    methodButtons.forEach(b => b.classList.toggle('active', b.dataset.method === method));
    if (!map.getLayer('hillshade')) return;

    map.setPaintProperty('hillshade', 'hillshade-illumination-anchor', 'map');
    map.setPaintProperty('hillshade', 'hillshade-illumination-direction', [270, 315, 0, 45]);
    map.setPaintProperty('hillshade', 'hillshade-illumination-altitude', [30, 30, 30, 30]);
    map.setPaintProperty('hillshade', 'hillshade-method', method);

    if (method === 'combined') {
      map.setPaintProperty('hillshade', 'hillshade-exaggeration', 0.23);
      map.setPaintProperty('hillshade', 'hillshade-highlight-color', 'rgba(255,255,255,0.88)');
      map.setPaintProperty('hillshade', 'hillshade-shadow-color', 'rgba(0,0,0,0.58)');
    } else {
      map.setPaintProperty('hillshade', 'hillshade-exaggeration', 0.24);
      map.setPaintProperty('hillshade', 'hillshade-highlight-color', 'rgba(255,255,255,0.9)');
      map.setPaintProperty('hillshade', 'hillshade-shadow-color', 'rgba(0,0,0,0.6)');
    }
  }
  methodButtons.forEach(btn => btn.addEventListener('click', () => setHillshadeMethod(btn.dataset.method)));
  map.once('style.load', () => setHillshadeMethod(DEFAULT_METHOD));

  map.once('style.load', () => applyViewMode(currentViewMode, { animate: false }));

  const s2Btn = document.getElementById('toggleS2');
  if (s2Btn) {
    s2Btn.addEventListener('click', () => {
      if (!map.getLayer('s2cloudless')) return;
      const vis = map.getLayoutProperty('s2cloudless', 'visibility') || 'visible';
      const next = vis === 'none' ? 'visible' : 'none';
      map.setLayoutProperty('s2cloudless', 'visibility', next);
      s2Btn.classList.toggle('active', next === 'visible');
    });
  }
}

init().catch((error) => {
  console.error('Failed to initialise the map', error);
});
