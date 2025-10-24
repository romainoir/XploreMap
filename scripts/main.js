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
  VERSATILES_LOCAL_JSON
} from './constants.js';
import { ensureGpxLayers, geojsonToGpx, parseGpxToGeoJson, zoomToGeojson } from './gpx.js';
import { DirectionsManager } from '../directions_test.js';
import { ensureOvertureBuildings, pmtilesProtocol } from './pmtiles.js';
import { waitForSWReady } from './service-worker.js';

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

async function init() {
  await waitForSWReady();

  maplibregl.addProtocol('mapterhorn', async (params, abortController) => {
    const [z, x, y] = params.url.replace('mapterhorn://', '').split('/').map(Number);
    const name = z <= 12 ? 'planet' : `6-${x >> (z - 6)}-${y >> (z - 6)}`;
    const url = `pmtiles://https://download.mapterhorn.com/${name}.pmtiles/${z}/${x}/${y}.webp`;
    const resp = await pmtilesProtocol.tile({ ...params, url }, abortController);
    if (resp.data === null) throw new Error(`Tile z=${z} x=${x} y=${y} not found.`);
    return resp;
  });

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
  const directionsControl = document.getElementById('directionsControl');
  const transportModes = directionsControl?.querySelectorAll('[data-mode]') ?? [];
  const swapButton = document.getElementById('swapDirectionsButton');
  const clearButton = document.getElementById('clearDirectionsButton');
  const routeStats = document.getElementById('routeStats');
  const elevationChart = document.getElementById('elevationChart');

  const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] };

  let currentGpxData = EMPTY_COLLECTION;

  const ensureFeatureCollection = (geojson) => {
    if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
      return EMPTY_COLLECTION;
    }
    return {
      type: 'FeatureCollection',
      features: geojson.features.filter(feature => Boolean(feature))
    };
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

  map.on('load', () => {
    try {
      new DirectionsManager(map, [
        directionsToggle,
        directionsControl,
        transportModes,
        swapButton,
        clearButton,
        routeStats,
        elevationChart
      ]);
    } catch (error) {
      console.error('Failed to initialize directions manager', error);
    }
  });

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
      const dataset = currentGpxData;
      if (!dataset.features || dataset.features.length === 0) {
        window.alert('There is no GPX data to export yet.');
        return;
      }
      try {
        const gpxContent = geojsonToGpx(dataset);
        const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.href = url;
        link.download = `xploremap-${timestamp}.gpx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 0);
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

  const PROXY_ABS = `${window.location.origin}/mapterhorn-dem/{z}/{x}/{y}`;
  const demSource = new mlcontour.DemSource({
    url: PROXY_ABS,
    encoding: 'terrarium',
    maxzoom: 12,
    worker: true
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

    rmL('overture-buildings-3d');
    rmL('overture-buildings-flat');
    rmL('contour-text');
    rmL('contours');
    rmL('hillshade');
    rmL('color-relief');
    rmL('s2cloudless');
    rmS('overture-buildings');
    rmS('contours');
    rmS('hillshadeSource');
    rmS('reliefDem');
    rmS('terrainSource');
    rmS('s2cloudless');

    map.addSource('terrainSource', {
      type: 'raster-dem',
      tiles: ['mapterhorn://{z}/{x}/{y}'],
      encoding: 'terrarium',
      tileSize: 512,
      maxzoom: 17,
      attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>'
    });
    map.addSource('hillshadeSource', {
      type: 'raster-dem',
      tiles: ['mapterhorn://{z}/{x}/{y}'],
      encoding: 'terrarium',
      tileSize: 512,
      attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>'
    });
    map.addSource('reliefDem', {
      type: 'raster-dem',
      tiles: ['mapterhorn://{z}/{x}/{y}'],
      encoding: 'terrarium',
      tileSize: 512
    });

    map.addSource('color-relief', {
      type: 'raster-dem',
      tiles: ['mapterhorn://{z}/{x}/{y}'],
      encoding: 'terrarium',
      tileSize: 512
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

    await ensureOvertureBuildings(map, topLabelId);

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
