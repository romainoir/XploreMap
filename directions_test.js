const EMPTY_COLLECTION = {
  type: 'FeatureCollection',
  features: []
};

const MODE_COLORS = {
  'foot-hiking': '#f4a259',
  'cycling-regular': '#7bd389',
  'driving-car': '#7aa5f7',
  'manual-draw': '#b993d6'
};

const HOVER_PIXEL_TOLERANCE = 12;
const COORD_EPSILON = 1e-6;
const WAYPOINT_MATCH_TOLERANCE_METERS = 30;
const MAX_ELEVATION_POINTS = 180;
const MAX_DISTANCE_MARKERS = 60;
const ELEVATION_TICK_TARGET = 5;
const DISTANCE_TICK_TARGET = 6;
const ROUTE_CUT_EPSILON_KM = 0.02;
const ROUTE_CLICK_PIXEL_TOLERANCE = 18;
const turfApi = typeof turf !== 'undefined' ? turf : null;

const SEGMENT_COLOR_PALETTE = [
  '#8ecae6',
  '#f6bd60',
  '#bde0fe',
  '#c1fba4',
  '#f4a7bb',
  '#d0bdf4',
  '#ffd6a5',
  '#a3c4f3'
];

const ASCENT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 18a1 1 0 0 1-.7-1.7l6.3-6.3a1 1 0 0 1 1.4 0l3.3 3.3 4.9-6.7H17a1 1 0 0 1 0-2h5a1 1 0 0 1 1 1v5a1 1 0 0 1-2 0V7.41l-5.6 7.6a1 1 0 0 1-1.5.12l-3.3-3.3-5.6 5.6a1 1 0 0 1-.7.27Z"/></svg>';
const DESCENT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 6a1 1 0 0 1 .7 1.7l-6.3 6.3a1 1 0 0 1-1.4 0l-3.3-3.3-4.9 6.7H7a1 1 0 0 1 0 2H2a1 1 0 0 1-1-1v-5a1 1 0 0 1 2 0v3.59l5.6-7.6a1 1 0 0 1 1.5-.12l3.3 3.3 5.6-5.6a1 1 0 0 1 .7-.27Z"/></svg>';

const SUMMARY_ICONS = {
  ascent: ASCENT_ICON,
  descent: DESCENT_ICON
};

const BIVOUAC_ELEVATION_ICON =
  '<img src="bivouac.png" alt="Bivouac" class="bivouac-elevation-icon" loading="lazy" decoding="async" />';

const DISTANCE_MARKER_PREFIX = 'distance-marker-';
const DEFAULT_DISTANCE_MARKER_COLOR = '#f6bd60';

const SEGMENT_MARKER_SOURCE_ID = 'segment-markers';
const SEGMENT_MARKER_LAYER_ID = 'segment-markers';
const SEGMENT_MARKER_COLORS = {
  start: '#4f9d69',
  bivouac: '#6c91bf',
  end: '#e07a5f'
};
const START_MARKER_ICON_ID = 'segment-marker-start';
const BIVOUAC_MARKER_ICON_ID = 'segment-marker-bivouac';
const END_MARKER_ICON_ID = 'segment-marker-end';
const SEGMENT_MARKER_ICONS = {
  start: START_MARKER_ICON_ID,
  bivouac: BIVOUAC_MARKER_ICON_ID,
  end: END_MARKER_ICON_ID
};

const BIVOUAC_MARKER_IMAGE_URL = 'bivouac.png';

const HIKER_MARKER_ICON_ID = 'route-hiker-icon';
const HIKER_MARKER_LAYER_ID = 'route-hiker';
const HIKER_MARKER_SOURCE_ID = 'route-hiker-source';
const HIKER_MARKER_IMAGE_URL = 'randonneur.png';

let bivouacMarkerImage = null;
let bivouacMarkerImagePromise = null;
let hikerMarkerImagePromise = null;

function createMarkerCanvas(baseSize = 52) {
  const ratio = 2;
  const canvas = document.createElement('canvas');
  canvas.width = baseSize * ratio;
  canvas.height = baseSize * ratio;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, baseSize, baseSize);
  return { canvas, ctx, ratio, size: baseSize };
}

function finalizeMarkerImage(base) {
  if (!base) {
    return null;
  }

  const { canvas, ctx, ratio } = base;
  const width = canvas.width;
  const height = canvas.height;

  if (!width || !height) {
    return null;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  return { image: imageData, pixelRatio: ratio };
}

function createFlagMarkerImage(fillColor) {
  const base = createMarkerCanvas();
  if (!base) {
    return null;
  }

  const { ctx, size } = base;
  const poleX = size * 0.5;
  const poleTop = size * 0.16;
  const poleBottom = size * 0.88;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.beginPath();
  ctx.ellipse(poleX, poleBottom + size * 0.03, size * 0.2, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#27363f';
  ctx.lineWidth = size * 0.06;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(poleX, poleTop);
  ctx.lineTo(poleX, poleBottom);
  ctx.stroke();

  const flagWidth = size * 0.36;
  const flagHeight = size * 0.3;
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = 'rgba(17, 34, 48, 0.18)';
  ctx.lineWidth = size * 0.025;
  ctx.beginPath();
  ctx.moveTo(poleX, poleTop + size * 0.02);
  ctx.quadraticCurveTo(poleX + flagWidth, poleTop - size * 0.04, poleX + flagWidth, poleTop + flagHeight * 0.35);
  ctx.quadraticCurveTo(poleX + flagWidth, poleTop + flagHeight * 0.75, poleX, poleTop + flagHeight);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  return finalizeMarkerImage(base);
}

function loadImageAsset(url) {
  if (!url) {
    return Promise.reject(new Error('Missing image URL'));
  }

  if (typeof Image === 'undefined') {
    return Promise.reject(new Error('Image constructor is not available in this environment'));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image: ${url}`));
    image.src = url;
  });
}

function getBivouacMarkerImage() {
  if (bivouacMarkerImage) {
    return Promise.resolve(bivouacMarkerImage);
  }

  if (!bivouacMarkerImagePromise) {
    bivouacMarkerImagePromise = loadImageAsset(BIVOUAC_MARKER_IMAGE_URL)
      .then((image) => {
        bivouacMarkerImage = image;
        return image;
      })
      .catch((error) => {
        bivouacMarkerImagePromise = null;
        throw error;
      });
  }

  return bivouacMarkerImagePromise;
}

function ensureHikerMarkerImage(map) {
  if (!map || typeof map.hasImage !== 'function' || typeof map.addImage !== 'function') {
    return Promise.resolve();
  }

  if (map.hasImage(HIKER_MARKER_ICON_ID)) {
    return Promise.resolve();
  }

  if (!hikerMarkerImagePromise) {
    hikerMarkerImagePromise = loadImageAsset(HIKER_MARKER_IMAGE_URL)
      .then((image) => {
        if (image && !map.hasImage(HIKER_MARKER_ICON_ID)) {
          map.addImage(HIKER_MARKER_ICON_ID, image, { pixelRatio: 2 });
        }
      })
      .catch((error) => {
        hikerMarkerImagePromise = null;
        throw error;
      });
  }

  return hikerMarkerImagePromise;
}

function ensureSegmentMarkerImages(map) {
  if (!map || typeof map.hasImage !== 'function' || typeof map.addImage !== 'function') {
    return;
  }

  if (!map.hasImage(START_MARKER_ICON_ID)) {
    const startIcon = createFlagMarkerImage(SEGMENT_MARKER_COLORS.start);
    if (startIcon) {
      map.addImage(START_MARKER_ICON_ID, startIcon.image, { pixelRatio: startIcon.pixelRatio });
    }
  }

  if (!map.hasImage(END_MARKER_ICON_ID)) {
    const endIcon = createFlagMarkerImage(SEGMENT_MARKER_COLORS.end);
    if (endIcon) {
      map.addImage(END_MARKER_ICON_ID, endIcon.image, { pixelRatio: endIcon.pixelRatio });
    }
  }

  if (!map.hasImage(BIVOUAC_MARKER_ICON_ID)) {
    getBivouacMarkerImage()
      .then((image) => {
        if (!image || !map || typeof map.hasImage !== 'function' || typeof map.addImage !== 'function') {
          return;
        }
        if (!map.hasImage(BIVOUAC_MARKER_ICON_ID)) {
          map.addImage(BIVOUAC_MARKER_ICON_ID, image);
        }
      })
      .catch((error) => {
        console.error('Failed to load bivouac marker image', error);
      });
  }
}

function adjustHexColor(hex, ratio = 0) {
  if (typeof hex !== 'string' || !/^#([0-9a-f]{6})$/i.test(hex)) {
    return hex;
  }

  const normalized = hex.slice(1);
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const clampedRatio = Math.max(-1, Math.min(1, Number(ratio) || 0));

  const transform = (channel) => {
    if (clampedRatio >= 0) {
      return Math.round(channel + (255 - channel) * clampedRatio);
    }
    return Math.round(channel * (1 + clampedRatio));
  };

  const toHex = (value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');

  const nextR = toHex(transform(r));
  const nextG = toHex(transform(g));
  const nextB = toHex(transform(b));
  return `#${nextR}${nextG}${nextB}`;
}

function parseHexColor(hex) {
  if (typeof hex !== 'string') {
    return null;
  }
  const match = hex.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    return null;
  }
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

function blendHexColors(colorA, colorB, weight = 0.5) {
  const parsedA = parseHexColor(colorA);
  const parsedB = parseHexColor(colorB);
  if (!parsedA && !parsedB) {
    return null;
  }
  if (!parsedA) {
    return colorB;
  }
  if (!parsedB) {
    return colorA;
  }
  const clamped = Math.max(0, Math.min(1, Number.isFinite(weight) ? Number(weight) : 0.5));
  const mix = (index) => Math.round(parsedA[index] + (parsedB[index] - parsedA[index]) * clamped);
  const toHex = (value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
  return `#${toHex(mix(0))}${toHex(mix(1))}${toHex(mix(2))}`;
}

function getSegmentPaletteColor(index) {
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }
  if (!Array.isArray(SEGMENT_COLOR_PALETTE) || !SEGMENT_COLOR_PALETTE.length) {
    return null;
  }
  return SEGMENT_COLOR_PALETTE[index % SEGMENT_COLOR_PALETTE.length];
}

function createDistanceMarkerImage(label, {
  fill = DEFAULT_DISTANCE_MARKER_COLOR
} = {}) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  const deviceRatio = 2;
  const fontSize = 13;
  const paddingX = 8;
  const paddingY = 6;
  const borderRadius = 8;
  const font = `600 ${fontSize * deviceRatio}px 'Noto Sans', 'Noto Sans Bold', sans-serif`;
  context.font = font;
  const metrics = context.measureText(label);
  const textWidth = metrics.width;

  const baseWidth = Math.ceil(textWidth / deviceRatio + paddingX * 2);
  const baseHeight = Math.ceil(fontSize + paddingY * 2);

  canvas.width = baseWidth * deviceRatio;
  canvas.height = baseHeight * deviceRatio;

  context.scale(deviceRatio, deviceRatio);
  context.font = `600 ${fontSize}px 'Noto Sans', 'Noto Sans Bold', sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const drawRoundedRect = (x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  };

  drawRoundedRect(0, 0, baseWidth, baseHeight, borderRadius);
  const strokeColor = adjustHexColor(fill, -0.2);

  context.save();
  context.shadowColor = 'rgba(17, 34, 48, 0.3)';
  context.shadowBlur = 8;
  context.shadowOffsetY = 2;
  context.fillStyle = fill;
  context.fill();
  context.restore();

  context.lineWidth = 1.5;
  context.strokeStyle = strokeColor;
  context.stroke();

  context.fillStyle = '#ffffff';
  context.fillText(label, baseWidth / 2, baseHeight / 2);

  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) {
    return null;
  }

  const imageData = context.getImageData(0, 0, width, height);
  return {
    image: {
      width,
      height,
      data: imageData.data
    },
    pixelRatio: deviceRatio
  };
}

function buildDistanceMarkerId(label, fill) {
  const normalizedLabel = String(label)
    .toLowerCase()
    .replace(/[^0-9a-z]+/gi, '-');
  const normalizedColor = typeof fill === 'string' && fill
    ? fill.toLowerCase().replace(/[^0-9a-f]+/g, '')
    : 'default';
  return `${DISTANCE_MARKER_PREFIX}${normalizedLabel}-${normalizedColor}`;
}

function ensureDistanceMarkerImage(map, label, { fill } = {}) {
  const color = typeof fill === 'string' && fill ? fill : DEFAULT_DISTANCE_MARKER_COLOR;
  const imageId = buildDistanceMarkerId(label, color);
  if (map.hasImage(imageId)) {
    return imageId;
  }

  const rendered = createDistanceMarkerImage(label, { fill: color });
  if (!rendered) {
    return null;
  }

  map.addImage(imageId, rendered.image, { pixelRatio: rendered.pixelRatio });
  return imageId;
}

const createWaypointFeature = (coords, index, total, extraProperties = {}) => {
  const isStart = index === 0;
  const isEnd = index === total - 1 && total > 1;
  const role = isStart ? 'start' : isEnd ? 'end' : 'via';

  let title = '';
  if (isStart) {
    title = 'Départ';
  } else if (isEnd) {
    title = 'Arrivée';
  }

  return {
    type: 'Feature',
    properties: {
      index,
      role,
      title,
      ...extraProperties
    },
    geometry: {
      type: 'Point',
      coordinates: coords
    }
  };
};

const toLngLat = (coord) => new maplibregl.LngLat(coord[0], coord[1]);

export class DirectionsManager {
  constructor(map, uiElements = []) {
    if (!map || typeof map.addSource !== 'function') {
      throw new Error('A valid MapLibre GL JS map instance is required');
    }

    const config = Array.isArray(uiElements)
      ? {
          toggleButton: uiElements[0],
          dock: uiElements[1],
          control: uiElements[2],
          modeButtons: uiElements[3],
          reverseButton: uiElements[4],
          clearButton: uiElements[5],
          undoButton: uiElements[6],
          redoButton: uiElements[7],
          playButton: uiElements[8],
          routeStats: uiElements[9],
          elevationChart: uiElements[10],
          infoButton: uiElements[11],
          hint: uiElements[12]
        }
      : uiElements ?? {};

    this.map = map;
    this.mapContainer = map.getContainer?.() ?? null;
    this.directionsToggle = config.toggleButton ?? null;
    this.directionsDock = config.dock ?? null;
    this.directionsControl = config.control ?? null;
    this.transportModes = config.modeButtons ? Array.from(config.modeButtons) : [];
    this.reverseButton = config.reverseButton ?? null;
    this.clearButton = config.clearButton ?? null;
    this.undoButton = config.undoButton ?? null;
    this.redoButton = config.redoButton ?? null;
    this.routeStats = config.routeStats ?? null;
    this.elevationChart = config.elevationChart ?? null;
    this.infoButton = config.infoButton ?? null;
    this.directionsHint = config.hint ?? null;
    this.playButton = config.playButton ?? null;

    if (this.routeStats) {
      this.routeStats.setAttribute('aria-live', 'polite');
      this.routeStats.setAttribute('role', 'group');
    }

    this.waypoints = [];
    this.legModes = [];
    this.currentMode = 'foot-hiking';
    this.modeColors = { ...MODE_COLORS };
    this.segmentModeLookup = [];

    this.transportModes.forEach((button) => {
      if (!button) return;
      const isActive = button.dataset?.mode === this.currentMode;
      button.classList.toggle('active', Boolean(isActive));
      button.setAttribute('aria-pressed', String(Boolean(isActive)));
    });

    this.latestMetrics = null;

    this.isDragging = false;
    this.draggedWaypointIndex = null;
    this.draggedBivouacIndex = null;
    this.draggedBivouacLngLat = null;
    this.hoveredWaypointIndex = null;
    this.hoveredSegmentIndex = null;
    this.hoveredLegIndex = null;

    this.routeGeojson = null;
    this.routeSegments = [];
    this.segmentLegLookup = [];
    this.routeProfile = null;
    this.elevationSamples = [];
    this.elevationChartContainer = null;
    this.highlightedElevationBar = null;
    this.activeHoverSource = null;
    this.lastElevationHoverDistance = null;

    this.history = [];
    this.future = [];
    this.isRestoringHistory = false;

    this.hikerAnimationFrame = null;
    this.hikerAnimationStart = null;
    this.hikerAnimationDuration = 0;
    this.hikerLastPosition = null;
    this.isHikerPlaying = false;

    this.manualModeId = 'manual-draw';

    this.setHintVisible(false);

    this.handleWaypointMouseDown = (event) => this.onWaypointMouseDown(event);
    this.handleMapMouseMove = (event) => this.onMapMouseMove(event);
    this.handleMapMouseUp = (event) => this.onMapMouseUp(event);
    this.handleMapMouseLeave = () => {
      this.resetSegmentHover('map');
      this.setHoveredWaypointIndex(null);
    };
    this.handleMapClick = (event) => this.onMapClick(event);
    this.handleWaypointDoubleClick = (event) => this.onWaypointDoubleClick(event);
    this.handleElevationPointerMove = (event) => this.onElevationPointerMove(event);
    this.handleElevationPointerLeave = () => this.onElevationPointerLeave();
    this.handleRouteContextMenu = (event) => this.onRouteContextMenu(event);
    this.handleSegmentMarkerMouseDown = (event) => this.onSegmentMarkerMouseDown(event);

    this.routeHoverTooltip = null;

    this.routeCutDistances = [];
    this.cutSegments = [];
    this.routeSegmentsListener = null;
    this.elevationResizeObserver = null;
    this.pendingRouteRequestId = 0;

    this.setupRouteLayers();
    this.setupUIHandlers();
    this.setupMapHandlers();
    this.updatePanelVisibilityState();
    this.initializeHistory();
  }

  setupRouteLayers() {
    const removeLayer = (id) => {
      if (this.map.getLayer(id)) {
        this.map.removeLayer(id);
      }
    };
    const removeSource = (id) => {
      if (this.map.getSource(id)) {
        this.map.removeSource(id);
      }
    };

    removeLayer('route-line');
    removeLayer('route-segment-hover');
    removeLayer('distance-markers');
    removeLayer('waypoint-hover-drag');
    removeLayer('route-hover-point');
    removeLayer('waypoints');
    removeLayer('waypoints-hit-area');
    removeLayer(SEGMENT_MARKER_LAYER_ID);
    removeLayer(HIKER_MARKER_LAYER_ID);

    removeSource('route-line-source');
    removeSource('route-segments-source');
    removeSource('distance-markers-source');
    removeSource('route-hover-point-source');
    removeSource('waypoints');
    removeSource(SEGMENT_MARKER_SOURCE_ID);
    removeSource(HIKER_MARKER_SOURCE_ID);

    this.map.addSource('route-line-source', {
      type: 'geojson',
      data: EMPTY_COLLECTION
    });

    this.map.addSource('route-segments-source', {
      type: 'geojson',
      data: EMPTY_COLLECTION
    });

    this.map.addSource('distance-markers-source', {
      type: 'geojson',
      data: EMPTY_COLLECTION
    });

    this.map.addSource('route-hover-point-source', {
      type: 'geojson',
      data: EMPTY_COLLECTION
    });

    this.map.addSource('waypoints', {
      type: 'geojson',
      data: EMPTY_COLLECTION
    });

    this.map.addSource(SEGMENT_MARKER_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_COLLECTION
    });

    this.map.addSource(HIKER_MARKER_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_COLLECTION
    });

    this.map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-line-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], this.modeColors[this.currentMode]],
        'line-width': 4,
        'line-opacity': 0.95
      }
    });

    this.map.addLayer({
      id: 'route-segment-hover',
      type: 'line',
      source: 'route-segments-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': 'yellow',
        'line-width': 6,
        'line-opacity': 0
      },
      filter: ['==', 'segmentIndex', -1]
    });

    this.map.addLayer({
      id: 'distance-markers',
      type: 'symbol',
      source: 'distance-markers-source',
      layout: {
        'symbol-placement': 'point',
        'icon-image': ['get', 'imageId'],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-anchor': 'center',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.35, 12, 0.425, 16, 0.525],
        'text-field': '',
        'text-font': ['Noto Sans Bold'],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-optional': true
      },
      paint: {
        'icon-opacity': 0.95
      }
    });

    this.map.addLayer({
      id: 'waypoints-hit-area',
      type: 'circle',
      source: 'waypoints',
      paint: {
        'circle-radius': 12,
        'circle-color': 'transparent'
      },
      filter: ['==', '$type', 'Point']
    });

    ensureSegmentMarkerImages(this.map);
    this.map.addLayer({
      id: SEGMENT_MARKER_LAYER_ID,
      type: 'symbol',
      source: SEGMENT_MARKER_SOURCE_ID,
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-anchor': 'bottom',
        'icon-offset': [0, 0],
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          ['case', ['==', ['get', 'type'], 'bivouac'], 0.12, 0.36],
          12,
          ['case', ['==', ['get', 'type'], 'bivouac'], 0.16, 0.48],
          16,
          ['case', ['==', ['get', 'type'], 'bivouac'], 0.2066666667, 0.62]
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['get', 'title'],
        'text-size': 13,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-font': ['Noto Sans Bold'],
        'text-optional': true,
        'symbol-sort-key': ['coalesce', ['get', 'order'], 0]
      },
      paint: {
        'icon-opacity': 0.95,
        'text-color': ['coalesce', ['get', 'labelColor'], 'rgba(17, 34, 48, 0.85)'],
        'text-halo-color': 'rgba(255, 255, 255, 0.95)',
        'text-halo-width': 1.3,
        'text-halo-blur': 0.45
      }
    });

    this.map.addLayer({
      id: 'waypoints',
      type: 'circle',
      source: 'waypoints',
      paint: {
        'circle-radius': [
          'case',
          ['==', ['get', 'role'], 'start'], 0,
          ['==', ['get', 'role'], 'end'], 0,
          4.5
        ],
        'circle-color': [
          'case',
          ['==', ['get', 'role'], 'start'], '#2f8f3b',
          ['==', ['get', 'role'], 'end'], '#d64545',
          ['coalesce', ['get', 'color'], this.modeColors[this.currentMode]]
        ],
        'circle-opacity': [
          'case',
          ['==', ['get', 'role'], 'start'], 0,
          ['==', ['get', 'role'], 'end'], 0,
          1
        ],
        'circle-stroke-width': [
          'case',
          ['any', ['==', ['get', 'role'], 'start'], ['==', ['get', 'role'], 'end']], 0,
          0
        ],
        'circle-stroke-color': [
          'case',
          ['any', ['==', ['get', 'role'], 'start'], ['==', ['get', 'role'], 'end']], '#ffffff',
          ['coalesce', ['get', 'color'], this.modeColors[this.currentMode]]
        ],
        'circle-stroke-opacity': [
          'case',
          ['any', ['==', ['get', 'role'], 'start'], ['==', ['get', 'role'], 'end']], 0,
          0.85
        ]
      },
      filter: ['==', '$type', 'Point']
    });

    this.map.addLayer({
      id: 'waypoint-hover-drag',
      type: 'circle',
      source: 'waypoints',
      paint: {
        'circle-radius': [
          'case',
          ['==', ['get', 'role'], 'start'], 0,
          ['==', ['get', 'role'], 'end'], 0,
          7
        ],
        'circle-color': [
          'case',
          ['==', ['get', 'role'], 'start'], '#2f8f3b',
          ['==', ['get', 'role'], 'end'], '#d64545',
          ['coalesce', ['get', 'color'], this.modeColors[this.currentMode]]
        ],
        'circle-stroke-width': [
          'case',
          ['==', ['get', 'role'], 'start'], 0,
          ['==', ['get', 'role'], 'end'], 0,
          2
        ],
        'circle-stroke-color': [
          'case',
          ['==', ['get', 'role'], 'start'], 'rgba(255, 255, 255, 0.95)',
          ['==', ['get', 'role'], 'end'], 'rgba(255, 255, 255, 0.95)',
          'rgba(255, 255, 255, 0.85)'
        ],
        'circle-opacity': 0.95
      },
      filter: ['==', 'index', -1]
    });

    this.map.addLayer({
      id: 'route-hover-point',
      type: 'circle',
      source: 'route-hover-point-source',
      paint: {
        'circle-radius': 6,
        'circle-color': '#fff',
        'circle-stroke-width': 3,
        'circle-stroke-color': this.modeColors[this.currentMode],
        'circle-opacity': 0
      }
    });

    this.updateSegmentMarkers();
    this.ensureHikerLayer();
  }

  ensureHikerLayer() {
    if (!this.map) {
      return Promise.resolve();
    }

    if (!this.map.getSource(HIKER_MARKER_SOURCE_ID)) {
      this.map.addSource(HIKER_MARKER_SOURCE_ID, {
        type: 'geojson',
        data: EMPTY_COLLECTION
      });
    }

    return ensureHikerMarkerImage(this.map)
      .then(() => {
        if (this.map.getLayer(HIKER_MARKER_LAYER_ID)) {
          return;
        }
        this.map.addLayer({
          id: HIKER_MARKER_LAYER_ID,
          type: 'symbol',
          source: HIKER_MARKER_SOURCE_ID,
          layout: {
            'icon-image': HIKER_MARKER_ICON_ID,
            'icon-anchor': 'bottom',
            'icon-offset': [0, 0],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.32, 12, 0.44, 16, 0.58],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
          },
          paint: {
            'icon-opacity': 0
          }
        });
      })
      .catch((error) => {
        console.error('Failed to prepare hiker marker layer', error);
        throw error;
      });
  }

  setupUIHandlers() {
    this.directionsToggle?.addEventListener('click', () => {
      this.directionsToggle.classList.toggle('active');
      this.directionsControl?.classList.toggle('visible');
      this.updatePanelVisibilityState();
    });

    this.transportModes.forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.mode;
        if (!mode || mode === this.currentMode) return;
        this.setTransportMode(mode);
      });
    });

    if (this.infoButton) {
      const showHint = () => this.setHintVisible(true);
      const hideHint = () => this.setHintVisible(false);
      this.infoButton.addEventListener('mouseenter', showHint);
      this.infoButton.addEventListener('mouseleave', hideHint);
      this.infoButton.addEventListener('focus', showHint);
      this.infoButton.addEventListener('blur', hideHint);
    }

    if (this.playButton) {
      this.playButton.addEventListener('click', () => {
        if (this.isHikerPlaying) {
          this.pauseHikerAnimation();
        } else {
          this.playHikerAnimation();
        }
      });
      this.updatePlayButtonState();
    }

    this.reverseButton?.addEventListener('click', () => {
      if (this.waypoints.length < 2) return;
      this.waypoints.reverse();
      this.legModes.reverse();
      this.updateWaypoints();
      this.recordHistoryState();
      this.getRoute();
    });

    this.clearButton?.addEventListener('click', () => {
      this.clearDirections();
    });

    this.undoButton?.addEventListener('click', () => {
      this.undo();
    });

    this.redoButton?.addEventListener('click', () => {
      this.redo();
    });
  }

  setupMapHandlers() {
    this.map.on('mousedown', 'waypoints-hit-area', this.handleWaypointMouseDown);
    this.map.on('mousedown', SEGMENT_MARKER_LAYER_ID, this.handleSegmentMarkerMouseDown);
    this.map.on('touchstart', SEGMENT_MARKER_LAYER_ID, this.handleSegmentMarkerMouseDown);
    this.map.on('mousemove', this.handleMapMouseMove);
    this.map.on('mouseup', this.handleMapMouseUp);
    this.map.on('mouseleave', this.handleMapMouseLeave);
    this.map.on('click', this.handleMapClick);
    this.map.on('dblclick', 'waypoints-hit-area', this.handleWaypointDoubleClick);
    this.map.on('contextmenu', this.handleRouteContextMenu);
  }

  setRouteSegmentsListener(callback) {
    this.routeSegmentsListener = typeof callback === 'function' ? callback : null;
    this.notifyRouteSegmentsUpdated();
  }

  notifyRouteSegmentsUpdated() {
    if (typeof this.routeSegmentsListener !== 'function') {
      return;
    }
    try {
      const payload = {
        full: this.buildExportFeatureCollection(),
        segments: this.buildSegmentExportCollections()
      };
      this.routeSegmentsListener(payload);
    } catch (error) {
      console.error('Route segment listener failed', error);
    }
  }

  initializeHistory() {
    this.history = [];
    this.future = [];
    this.isRestoringHistory = false;
    this.recordHistoryState({ force: true });
  }

  snapshotWaypoints() {
    if (!Array.isArray(this.waypoints)) {
      return [];
    }
    return this.waypoints.map((coord) => {
      if (!Array.isArray(coord) || coord.length < 2) {
        return [];
      }
      const [lng, lat, ele] = coord;
      const normalized = [
        Number.isFinite(lng) ? lng : 0,
        Number.isFinite(lat) ? lat : 0
      ];
      if (Number.isFinite(ele)) {
        normalized.push(ele);
      }
      return normalized;
    });
  }

  cloneWaypointState(state) {
    if (!Array.isArray(state)) {
      return [];
    }
    return state.map((coord) => {
      if (!Array.isArray(coord) || coord.length < 2) {
        return [];
      }
      const [lng, lat, ele] = coord;
      const clone = [lng, lat];
      if (Number.isFinite(ele)) {
        clone.push(ele);
      }
      return clone;
    });
  }

  snapshotLegModes() {
    if (!Array.isArray(this.legModes)) {
      return [];
    }
    return this.legModes.slice();
  }

  cloneLegModes(modes) {
    if (!Array.isArray(modes)) {
      return [];
    }
    return modes.slice();
  }

  areLegModeSetsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) {
        return false;
      }
    }
    return true;
  }

  normalizeLegModes() {
    const targetLength = Math.max(0, this.waypoints.length - 1);
    const normalized = Array.isArray(this.legModes) ? this.legModes.slice(0, targetLength) : [];
    const fallback = normalized.length ? normalized[normalized.length - 1] : this.currentMode;
    while (normalized.length < targetLength) {
      normalized.push(fallback);
    }
    this.legModes = normalized;
  }

  buildModeGroups() {
    this.normalizeLegModes();
    const groups = [];
    const totalLegs = Math.max(0, this.waypoints.length - 1);
    if (totalLegs === 0) {
      return groups;
    }
    let currentGroup = null;
    for (let legIndex = 0; legIndex < totalLegs; legIndex += 1) {
      const mode = this.legModes?.[legIndex] ?? this.currentMode;
      const startCoord = this.waypoints[legIndex];
      const endCoord = this.waypoints[legIndex + 1];
      if (!Array.isArray(startCoord) || !Array.isArray(endCoord)) {
        continue;
      }
      if (!currentGroup || currentGroup.mode !== mode) {
        currentGroup = {
          mode,
          waypoints: [startCoord.slice()]
        };
        groups.push(currentGroup);
      }
      currentGroup.waypoints.push(endCoord.slice());
    }
    return groups.filter((group) => Array.isArray(group?.waypoints) && group.waypoints.length >= 2);
  }

  areWaypointSetsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    for (let index = 0; index < a.length; index += 1) {
      const first = a[index];
      const second = b[index];
      if (!Array.isArray(first) || !Array.isArray(second)) {
        return false;
      }
      const [lngA, latA] = first;
      const [lngB, latB] = second;
      if (Math.abs((lngA ?? 0) - (lngB ?? 0)) > COORD_EPSILON) {
        return false;
      }
      if (Math.abs((latA ?? 0) - (latB ?? 0)) > COORD_EPSILON) {
        return false;
      }
    }
    return true;
  }

  recordHistoryState({ force = false } = {}) {
    if (this.isRestoringHistory) {
      this.updateHistoryButtons();
      this.updateActionAvailability();
      return;
    }

    const snapshot = {
      waypoints: this.snapshotWaypoints(),
      legModes: this.snapshotLegModes()
    };
    const last = this.history?.[this.history.length - 1] ?? null;
    const lastWaypoints = Array.isArray(last?.waypoints)
      ? last.waypoints
      : (Array.isArray(last) ? last : []);
    const lastModes = Array.isArray(last?.legModes) ? last.legModes : [];
    const isDuplicate = last
      ? this.areWaypointSetsEqual(lastWaypoints, snapshot.waypoints)
        && this.areLegModeSetsEqual(lastModes, snapshot.legModes)
      : false;

    if (!force && isDuplicate) {
      this.updateHistoryButtons();
      this.updateActionAvailability();
      return;
    }

    if (!Array.isArray(this.history)) {
      this.history = [];
    }
    this.history.push(snapshot);
    if (this.history.length > 100) {
      this.history.shift();
    }
    this.future = [];
    this.updateHistoryButtons();
    this.updateActionAvailability();
  }

  updateHistoryButtons() {
    const canUndo = Array.isArray(this.history) && this.history.length > 1;
    const canRedo = Array.isArray(this.future) && this.future.length > 0;
    if (this.undoButton) {
      this.undoButton.disabled = !canUndo;
    }
    if (this.redoButton) {
      this.redoButton.disabled = !canRedo;
    }
  }

  updateActionAvailability() {
    const waypointCount = Array.isArray(this.waypoints) ? this.waypoints.length : 0;
    if (this.clearButton) {
      this.clearButton.disabled = waypointCount === 0;
    }
    if (this.reverseButton) {
      this.reverseButton.disabled = waypointCount < 2;
    }
  }

  undo() {
    if (!Array.isArray(this.history) || this.history.length <= 1) {
      return;
    }
    const current = this.history.pop();
    if (current) {
      this.future = Array.isArray(this.future) ? this.future : [];
      this.future.push(current);
    }
    const previous = this.history[this.history.length - 1] ?? null;
    this.restoreHistoryState(previous);
  }

  redo() {
    if (!Array.isArray(this.future) || this.future.length === 0) {
      return;
    }
    const next = this.future.pop();
    if (!next) {
      this.updateHistoryButtons();
      return;
    }
    const snapshot = {
      waypoints: this.cloneWaypointState(Array.isArray(next?.waypoints) ? next.waypoints : Array.isArray(next) ? next : []),
      legModes: this.cloneLegModes(next?.legModes)
    };
    this.history = Array.isArray(this.history) ? this.history : [];
    this.history.push(snapshot);
    this.restoreHistoryState(snapshot);
  }

  restoreHistoryState(state) {
    this.isRestoringHistory = true;
    const waypointsState = Array.isArray(state?.waypoints)
      ? state.waypoints
      : (Array.isArray(state) ? state : []);
    const legModesState = Array.isArray(state?.legModes) ? state.legModes : [];
    this.waypoints = this.cloneWaypointState(waypointsState);
    this.legModes = this.cloneLegModes(legModesState);
    this.normalizeLegModes();
    this.updateWaypoints();
    if (this.waypoints.length >= 2) {
      this.getRoute();
    } else {
      this.clearRoute();
      this.updateStats(null);
      this.updateElevationProfile([]);
    }
    this.isRestoringHistory = false;
    this.updateHistoryButtons();
    this.updateActionAvailability();
  }

  resetRouteCuts() {
    this.routeCutDistances = [];
    this.cutSegments = [];
    this.updateSegmentMarkers();
    this.updateDistanceMarkers(this.routeGeojson);
  }

  getSegmentColor(index) {
    let modeColor = null;
    if (Number.isInteger(index) && index >= 0) {
      const segmentMode = this.segmentModeLookup?.[index];
      if (segmentMode && this.modeColors[segmentMode]) {
        modeColor = this.modeColors[segmentMode];
      } else {
        const legIndex = this.segmentLegLookup?.[index];
        if (Number.isInteger(legIndex)) {
          const legMode = this.legModes?.[legIndex];
          if (legMode && this.modeColors[legMode]) {
            modeColor = this.modeColors[legMode];
          }
        }
      }
    }

    if (!modeColor) {
      const fallbackMode = this.legModes?.[0] ?? this.currentMode;
      modeColor = this.modeColors[fallbackMode] ?? this.modeColors[this.currentMode];
    }

    const paletteColor = getSegmentPaletteColor(index);
    if (paletteColor && modeColor) {
      const blended = blendHexColors(modeColor, paletteColor, 0.65);
      return blended ?? paletteColor ?? modeColor;
    }
    if (paletteColor) {
      return paletteColor;
    }
    return modeColor;
  }

  updateCutSegmentColors() {
    if (!Array.isArray(this.cutSegments) || !this.cutSegments.length) {
      this.updateSegmentMarkers();
      return;
    }
    this.cutSegments = this.cutSegments.map((segment, index) => ({
      ...segment,
      index,
      color: this.getSegmentColor(index),
      name: segment?.name ?? `Segment ${index + 1}`
    }));
    this.assignSegmentNames();
    this.updateSegmentMarkers();
    this.updateDistanceMarkers(this.routeGeojson);
  }

  computeCutBoundaries() {
    const totalDistance = Number(this.routeProfile?.totalDistanceKm) || 0;
    if (!Number.isFinite(totalDistance) || totalDistance <= 0) {
      return [];
    }

    const rawCuts = Array.isArray(this.routeCutDistances)
      ? this.routeCutDistances
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      : [];

    const interiorCuts = rawCuts
      .filter((value) => value > ROUTE_CUT_EPSILON_KM && value < totalDistance - ROUTE_CUT_EPSILON_KM)
      .sort((a, b) => a - b);

    const uniqueCuts = [];
    interiorCuts.forEach((value) => {
      if (!uniqueCuts.some((existing) => Math.abs(existing - value) <= ROUTE_CUT_EPSILON_KM / 2)) {
        uniqueCuts.push(value);
      }
    });

    return [0, ...uniqueCuts, totalDistance];
  }

  computeSegmentMarkers(segments = this.cutSegments) {
    const routeCoordinates = Array.isArray(this.routeProfile?.coordinates)
      ? this.routeProfile.coordinates
      : [];
    const waypointCoordinates = Array.isArray(this.waypoints) ? this.waypoints : [];
    const baseCoordinates = routeCoordinates.length ? routeCoordinates : waypointCoordinates;

    if (!Array.isArray(baseCoordinates) || !baseCoordinates.length) {
      return [];
    }

    const cloneCoord = (coord) => {
      if (!Array.isArray(coord) || coord.length < 2) {
        return null;
      }
      return coord.slice();
    };

    const hasRouteGeometry = routeCoordinates.length >= 2;
    const waypointCount = waypointCoordinates.length;

    const ensureSegments = () => {
      if (Array.isArray(segments) && segments.length) {
        return segments;
      }
      const first = cloneCoord(baseCoordinates[0]);
      if (!first) {
        return [];
      }
      const last = cloneCoord(baseCoordinates[baseCoordinates.length - 1] ?? baseCoordinates[0]);
      if (!last || (baseCoordinates.length === 1 && !hasRouteGeometry && waypointCount < 2)) {
        return [{
          index: 0,
          startKm: 0,
          endKm: 0,
          distanceKm: 0,
          coordinates: [first],
          color: this.getSegmentColor(0)
        }];
      }
      const totalDistance = Number(this.routeProfile?.totalDistanceKm);
      const distanceKm = Number.isFinite(totalDistance) ? totalDistance : 0;
      const coords = baseCoordinates.length > 1 ? [first, last] : [first];
      return [{
        index: 0,
        startKm: 0,
        endKm: distanceKm,
        distanceKm,
        coordinates: coords,
        color: this.getSegmentColor(0)
      }];
    };

    const resolvedSegments = ensureSegments();
    if (!resolvedSegments.length) {
      return [];
    }

    const markers = [];
    const firstSegment = resolvedSegments[0];
    const startCoord = cloneCoord(firstSegment?.coordinates?.[0] ?? baseCoordinates[0]);
    if (startCoord) {
      markers.push({
        type: 'start',
        title: 'Départ',
        name: 'Départ',
        coordinates: startCoord,
        labelColor: SEGMENT_MARKER_COLORS.start,
        icon: SEGMENT_MARKER_ICONS.start,
        segmentIndex: 0,
        order: 0
      });
    }

    for (let index = 0; index < resolvedSegments.length - 1; index += 1) {
      const current = resolvedSegments[index];
      const next = resolvedSegments[index + 1];
      const currentCoords = Array.isArray(current?.coordinates) ? current.coordinates : [];
      let boundary = cloneCoord(currentCoords[currentCoords.length - 1]);
      if (!boundary) {
        const nextCoords = Array.isArray(next?.coordinates) ? next.coordinates : [];
        boundary = cloneCoord(nextCoords[0]);
      }
      if (!boundary) {
        continue;
      }
      markers.push({
        type: 'bivouac',
        title: `Bivouac ${index + 1}`,
        name: `Bivouac ${index + 1}`,
        coordinates: boundary,
        labelColor: SEGMENT_MARKER_COLORS.bivouac,
        icon: SEGMENT_MARKER_ICONS.bivouac,
        segmentIndex: index + 1,
        order: index + 1
      });
    }

    const lastSegment = resolvedSegments[resolvedSegments.length - 1];
    const lastCoords = Array.isArray(lastSegment?.coordinates) ? lastSegment.coordinates : [];
    const hasDistinctEnd = () => {
      if (resolvedSegments.length > 1) {
        return true;
      }
      if (lastCoords.length >= 2) {
        return true;
      }
      return baseCoordinates.length >= 2;
    };
    const endCoord = cloneCoord(lastCoords[lastCoords.length - 1] ?? baseCoordinates[baseCoordinates.length - 1]);
    if (endCoord && hasDistinctEnd()) {
      markers.push({
        type: 'end',
        title: 'Arrivée',
        name: 'Arrivée',
        coordinates: endCoord,
        labelColor: SEGMENT_MARKER_COLORS.end,
        icon: SEGMENT_MARKER_ICONS.end,
        segmentIndex: resolvedSegments.length - 1,
        order: resolvedSegments.length
      });
    }

    const previewIndex = Number.isInteger(this.draggedBivouacIndex) ? this.draggedBivouacIndex : null;
    if (previewIndex !== null && Array.isArray(this.draggedBivouacLngLat)) {
      const [lng, lat] = this.draggedBivouacLngLat;
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        const targetOrder = previewIndex + 1;
        markers.forEach((marker) => {
          if (marker?.type !== 'bivouac') {
            return;
          }
          const order = Number.isFinite(marker.order)
            ? marker.order
            : Number(marker.segmentIndex);
          if (order === targetOrder) {
            marker.coordinates = [lng, lat];
          }
        });
      }
    }

    return markers;
  }

  getMarkerDistance(marker) {
    if (!marker || !this.routeProfile) {
      return null;
    }

    if (marker.type === 'start') {
      return 0;
    }

    if (marker.type === 'end') {
      return Number(this.routeProfile.totalDistanceKm) || 0;
    }

    if (marker.type === 'bivouac') {
      const segmentIndex = Number(marker.segmentIndex);
      if (Number.isInteger(segmentIndex) && segmentIndex > 0) {
        const prevSegment = this.cutSegments?.[segmentIndex - 1];
        if (prevSegment && Number.isFinite(prevSegment.endKm)) {
          return Number(prevSegment.endKm);
        }
        const cutValue = this.routeCutDistances?.[segmentIndex - 1];
        if (Number.isFinite(cutValue)) {
          return cutValue;
        }
      }
    }

    return null;
  }

  assignSegmentNames() {
    if (!Array.isArray(this.cutSegments) || !this.cutSegments.length) {
      return;
    }
    const markers = this.computeSegmentMarkers(this.cutSegments);
    if (markers.length < 2) {
      return;
    }
    this.cutSegments = this.cutSegments.map((segment, index) => {
      const startMarker = markers[index];
      const endMarker = markers[index + 1];
      let name = segment?.name ?? `Segment ${index + 1}`;
      const startTitle = startMarker?.title ?? '';
      const endTitle = endMarker?.title ?? '';
      if (startTitle && endTitle) {
        name = `${startTitle} → ${endTitle}`;
      } else if (endTitle) {
        name = endTitle;
      } else if (startTitle) {
        name = startTitle;
      }
      return {
        ...segment,
        name
      };
    });
  }

  updateSegmentMarkers() {
    const source = this.map.getSource(SEGMENT_MARKER_SOURCE_ID);
    if (!source) {
      return;
    }
    const markers = this.computeSegmentMarkers();
    if (!markers.length) {
      source.setData(EMPTY_COLLECTION);
      return;
    }
    const features = markers
      .map((marker, index) => {
        const coords = Array.isArray(marker.coordinates) ? marker.coordinates.slice() : null;
        if (!coords || coords.length < 2) {
          return null;
        }
        return {
          type: 'Feature',
          properties: {
            type: marker.type,
            title: marker.title,
            name: marker.name,
            labelColor: marker.labelColor,
            icon: marker.icon,
            order: marker.order ?? index,
            segmentIndex: marker.segmentIndex ?? index
          },
          geometry: {
            type: 'Point',
            coordinates: coords
          }
        };
      })
      .filter(Boolean);

    if (!features.length) {
      source.setData(EMPTY_COLLECTION);
      return;
    }

    source.setData({
      type: 'FeatureCollection',
      features
    });
  }

  getCoordinateAtDistance(distanceKm) {
    if (!this.routeProfile || !Array.isArray(this.routeSegments) || !this.routeSegments.length) {
      return null;
    }
    const totalDistance = Number(this.routeProfile.totalDistanceKm) || 0;
    if (!Number.isFinite(distanceKm)) {
      return null;
    }
    if (distanceKm <= 0) {
      const start = this.routeProfile.coordinates?.[0];
      return Array.isArray(start) ? [...start] : null;
    }
    if (distanceKm >= totalDistance) {
      const end = this.routeProfile.coordinates?.[this.routeProfile.coordinates.length - 1];
      return Array.isArray(end) ? [...end] : null;
    }

    const segmentIndex = this.findSegmentIndexByDistance(distanceKm);
    const segment = Number.isInteger(segmentIndex) ? this.routeSegments?.[segmentIndex] : null;
    if (!segment) {
      const fallback = this.routeProfile.coordinates?.[this.routeProfile.coordinates.length - 1];
      return Array.isArray(fallback) ? [...fallback] : null;
    }

    const startDistance = Number(segment.startDistanceKm) || 0;
    const segmentDistance = Number(segment.distanceKm) || 0;
    const relative = Number(distanceKm) - startDistance;
    const t = segmentDistance > 0 ? Math.max(0, Math.min(1, relative / segmentDistance)) : 0;
    return this.interpolateSegmentCoordinate(segment, t, distanceKm);
  }

  extractCoordinatesBetween(startKm, endKm) {
    if (!this.routeProfile || !Array.isArray(this.routeProfile.coordinates)) {
      return [];
    }

    const coordinates = this.routeProfile.coordinates;
    const distances = this.routeProfile.cumulativeDistances ?? [];
    const result = [];
    const tolerance = 1e-6;

    const pushUnique = (coord) => {
      if (!Array.isArray(coord) || coord.length < 2) {
        return;
      }
      const clone = coord.slice();
      if (!result.length || !this.coordinatesMatch(result[result.length - 1], clone)) {
        result.push(clone);
      }
    };

    const startCoord = this.getCoordinateAtDistance(startKm);
    if (startCoord) {
      pushUnique(startCoord);
    }

    for (let index = 0; index < coordinates.length; index += 1) {
      const distance = Number(distances[index]);
      if (!Number.isFinite(distance)) {
        continue;
      }
      if (distance > startKm + tolerance && distance < endKm - tolerance) {
        pushUnique(coordinates[index]);
      }
    }

    const endCoord = this.getCoordinateAtDistance(endKm);
    if (endCoord) {
      pushUnique(endCoord);
    }

    return result;
  }

  updateRouteCutSegments() {
    if (!this.routeProfile || !Array.isArray(this.routeProfile.coordinates) || this.routeProfile.coordinates.length < 2) {
      this.cutSegments = [];
      this.updateSegmentMarkers();
      return;
    }

    const boundaries = this.computeCutBoundaries();
    if (boundaries.length < 2) {
      this.cutSegments = [];
      this.updateSegmentMarkers();
      return;
    }

    const segments = [];
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const startKm = boundaries[index];
      const endKm = boundaries[index + 1];
      if (!Number.isFinite(startKm) || !Number.isFinite(endKm) || endKm - startKm <= 1e-6) {
        continue;
      }
      const coords = this.extractCoordinatesBetween(startKm, endKm);
      if (!Array.isArray(coords) || coords.length < 2) {
        continue;
      }
      const segmentIndex = segments.length;
      segments.push({
        index: segmentIndex,
        startKm,
        endKm,
        distanceKm: endKm - startKm,
        coordinates: coords,
        color: this.getSegmentColor(segmentIndex),
        name: `Segment ${segmentIndex + 1}`
      });
    }

    for (let index = 1; index < segments.length; index += 1) {
      const previous = segments[index - 1];
      const current = segments[index];
      if (!previous || !current) {
        continue;
      }
      const prevCoords = previous.coordinates;
      const currentCoords = current.coordinates;
      if (!Array.isArray(prevCoords) || !prevCoords.length || !Array.isArray(currentCoords) || !currentCoords.length) {
        continue;
      }
      const boundaryKm = current.startKm;
      let shared = Number.isFinite(boundaryKm) ? this.getCoordinateAtDistance(boundaryKm) : null;
      if (!Array.isArray(shared) || shared.length < 2) {
        const fallback = prevCoords[prevCoords.length - 1] ?? currentCoords[0];
        shared = Array.isArray(fallback) ? fallback.slice() : null;
      }
      if (Array.isArray(shared) && shared.length >= 2) {
        prevCoords[prevCoords.length - 1] = shared.slice();
        currentCoords[0] = shared.slice();
      }
    }

    this.cutSegments = segments;
    this.assignSegmentNames();
    this.updateSegmentMarkers();
  }

  buildExportFeatureCollection() {
    if (!Array.isArray(this.cutSegments) || !this.cutSegments.length) {
      const markerFeatures = this.computeSegmentMarkers()
        .map((marker) => {
          const coords = Array.isArray(marker.coordinates) ? marker.coordinates.slice() : null;
          if (!coords || coords.length < 2) {
            return null;
          }
          return {
            type: 'Feature',
            properties: {
              name: marker.name ?? marker.title ?? '',
              marker_type: marker.type,
              segmentIndex: marker.segmentIndex ?? null,
              color: marker.labelColor ?? null,
              source: 'waypoint'
            },
            geometry: {
              type: 'Point',
              coordinates: coords
            }
          };
        })
        .filter(Boolean);
      if (!markerFeatures.length) {
        return EMPTY_COLLECTION;
      }
      return {
        type: 'FeatureCollection',
        features: markerFeatures
      };
    }

    const markers = this.computeSegmentMarkers(this.cutSegments);

    const trackFeatures = this.cutSegments
      .map((segment) => {
        if (!segment || !Array.isArray(segment.coordinates) || segment.coordinates.length < 2) {
          return null;
        }
        const startKm = Number(segment.startKm ?? 0);
        const endKm = Number(segment.endKm ?? 0);
        const distanceKm = Number.isFinite(segment.distanceKm)
          ? Number(segment.distanceKm)
          : Number(endKm - startKm);
        const startMarker = Number.isInteger(segment.index) ? markers?.[segment.index] : null;
        const endMarker = Number.isInteger(segment.index) ? markers?.[segment.index + 1] : null;
        let segmentName = segment.name ?? `Segment ${segment.index + 1}`;
        const startTitle = startMarker?.title ?? '';
        const endTitle = endMarker?.title ?? '';
        if (startTitle && endTitle) {
          segmentName = `${startTitle} → ${endTitle}`;
        } else if (endTitle) {
          segmentName = endTitle;
        } else if (startTitle) {
          segmentName = startTitle;
        }
        return {
          type: 'Feature',
          properties: {
            name: segmentName,
            segmentIndex: segment.index,
            start_km: Number.isFinite(startKm) ? Number(startKm.toFixed(3)) : 0,
            end_km: Number.isFinite(endKm) ? Number(endKm.toFixed(3)) : 0,
            distance_km: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(3)) : 0,
            color: segment.color ?? null,
            source: 'track'
          },
          geometry: {
            type: 'LineString',
            coordinates: segment.coordinates.map((coord) => coord.slice())
          }
        };
      })
      .filter(Boolean);

    const markerFeatures = markers
      .map((marker) => {
        const coords = Array.isArray(marker.coordinates) ? marker.coordinates.slice() : null;
        if (!coords || coords.length < 2) {
          return null;
        }
        return {
          type: 'Feature',
          properties: {
            name: marker.name ?? marker.title ?? '',
            marker_type: marker.type,
            segmentIndex: marker.segmentIndex ?? null,
            color: marker.labelColor ?? null,
            source: 'waypoint'
          },
          geometry: {
            type: 'Point',
            coordinates: coords
          }
        };
      })
      .filter(Boolean);

    const features = [...trackFeatures, ...markerFeatures];
    if (!features.length) {
      return EMPTY_COLLECTION;
    }

    return {
      type: 'FeatureCollection',
      features
    };
  }

  buildSegmentExportCollections() {
    if (!Array.isArray(this.cutSegments) || !this.cutSegments.length) {
      return [];
    }

    const markers = this.computeSegmentMarkers(this.cutSegments);
    if (!markers.length) {
      return [];
    }

    const collections = this.cutSegments.map((segment, index) => {
      if (!segment || !Array.isArray(segment.coordinates) || segment.coordinates.length < 2) {
        return null;
      }

      const coordinates = segment.coordinates.map((coord) => coord.slice());
      if (coordinates.length < 2) {
        return null;
      }

      const startMarker = markers[index];
      const endMarker = markers[index + 1];
      const startKm = Number(segment.startKm ?? 0);
      const endKm = Number(segment.endKm ?? 0);
      const distanceKm = Number.isFinite(segment.distanceKm)
        ? Number(segment.distanceKm)
        : Number(endKm - startKm);
      const segmentName = segment.name ?? `Segment ${index + 1}`;

      const features = [
        {
          type: 'Feature',
          properties: {
            name: segmentName,
            segmentIndex: segment.index,
            start_km: Number.isFinite(startKm) ? Number(startKm.toFixed(3)) : 0,
            end_km: Number.isFinite(endKm) ? Number(endKm.toFixed(3)) : 0,
            distance_km: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(3)) : 0,
            color: segment.color ?? null,
            source: 'track'
          },
          geometry: {
            type: 'LineString',
            coordinates
          }
        }
      ];

      const appendMarker = (marker) => {
        const coords = Array.isArray(marker?.coordinates) ? marker.coordinates.slice() : null;
        if (!coords || coords.length < 2) {
          return;
        }
        const key = `${coords[0].toFixed(6)},${coords[1].toFixed(6)},${marker?.type ?? ''}`;
        if (!appendMarker.cache.has(key)) {
          appendMarker.cache.add(key);
          features.push({
            type: 'Feature',
            properties: {
              name: marker?.name ?? marker?.title ?? '',
              marker_type: marker?.type ?? null,
              segmentIndex: marker?.segmentIndex ?? null,
              color: marker?.labelColor ?? null,
              source: 'waypoint'
            },
            geometry: {
              type: 'Point',
              coordinates: coords
            }
          });
        }
      };
      appendMarker.cache = new Set();

      appendMarker(startMarker);
      appendMarker(endMarker);

      return {
        name: segmentName,
        index,
        collection: {
          type: 'FeatureCollection',
          features
        }
      };
    }).filter(Boolean);

    return collections;
  }

  updateRouteLineSource() {
    const source = this.map.getSource('route-line-source');
    if (!source) {
      return;
    }

    if (!Array.isArray(this.cutSegments) || !this.cutSegments.length) {
      source.setData(EMPTY_COLLECTION);
      return;
    }

    const features = this.cutSegments.map((segment) => ({
      type: 'Feature',
      properties: {
        color: segment.color,
        segmentIndex: segment.index,
        name: segment.name,
        startKm: segment.startKm,
        endKm: segment.endKm
      },
      geometry: {
        type: 'LineString',
        coordinates: segment.coordinates.map((coord) => coord.slice())
      }
    }));

    source.setData({
      type: 'FeatureCollection',
      features
    });

    this.updateSegmentMarkers();
    this.updateActionAvailability();
  }

  updateCutDisplays() {
    const coordinates = this.routeGeojson?.geometry?.coordinates ?? [];
    this.updateRouteCutSegments();
    this.updateRouteLineSource();
    this.updateElevationProfile(coordinates);
    this.updateDistanceMarkers(this.routeGeojson);
    this.updateWaypoints();
    this.notifyRouteSegmentsUpdated();
  }

  getCutSegmentForDistance(distanceKm) {
    if (!Array.isArray(this.cutSegments) || !this.cutSegments.length) {
      return null;
    }
    const epsilon = 1e-6;
    return this.cutSegments.find((segment, index) => {
      const start = Number(segment.startKm ?? 0);
      const end = Number(segment.endKm ?? start);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return false;
      }
      if (index === this.cutSegments.length - 1) {
        return distanceKm >= start - epsilon && distanceKm <= end + epsilon;
      }
      return distanceKm >= start - epsilon && distanceKm < end - epsilon * 0.5;
    }) ?? null;
  }

  getColorForDistance(distanceKm) {
    if (!Number.isFinite(distanceKm)) {
      return this.modeColors[this.currentMode];
    }
    const segment = this.getCutSegmentForDistance(distanceKm);
    if (segment?.color) {
      return segment.color;
    }
    return this.modeColors[this.currentMode];
  }

  projectOntoRoute(lngLat, tolerance = ROUTE_CLICK_PIXEL_TOLERANCE) {
    if (!Array.isArray(this.routeSegments) || !this.routeSegments.length) {
      return null;
    }

    const mousePixel = this.map.project(lngLat);
    let closest = null;
    let minDistance = Infinity;
    const maxTolerance = Number.isFinite(tolerance) ? tolerance : HOVER_PIXEL_TOLERANCE;

    this.routeSegments.forEach((segment, index) => {
      const startPixel = this.map.project(toLngLat(segment.start));
      const endPixel = this.map.project(toLngLat(segment.end));
      const distance = this.pointToSegmentDistance(mousePixel, startPixel, endPixel);
      if (distance <= maxTolerance && distance < minDistance) {
        minDistance = distance;
        closest = { segment, index };
      }
    });

    if (!closest) {
      return null;
    }

    const projection = this.projectPointOnSegment(lngLat, closest.segment.start, closest.segment.end);
    const segmentDistance = Number(closest.segment.distanceKm) || 0;
    const startDistance = Number(closest.segment.startDistanceKm) || 0;
    const relative = Number.isFinite(projection.t) ? projection.t * segmentDistance : 0;
    const distanceKm = startDistance + relative;

    return {
      segmentIndex: closest.index,
      distanceKm,
      projection: { ...projection, distanceKm }
    };
  }

  snapWaypointsToRoute() {
    if (!Array.isArray(this.waypoints) || this.waypoints.length < 2) {
      return false;
    }
    if (!Array.isArray(this.routeSegments) || !this.routeSegments.length) {
      return false;
    }

    const lastIndex = this.waypoints.length - 1;
    const updated = this.waypoints.map((coord) => (Array.isArray(coord) ? coord.slice() : coord));
    const firstSegment = this.routeSegments[0];
    const lastSegment = this.routeSegments[this.routeSegments.length - 1];

    if (firstSegment && Array.isArray(firstSegment.start)) {
      updated[0] = [firstSegment.start[0], firstSegment.start[1]];
    }
    if (lastSegment && Array.isArray(lastSegment.end)) {
      updated[lastIndex] = [lastSegment.end[0], lastSegment.end[1]];
    }

    for (let index = 1; index < lastIndex; index += 1) {
      const current = updated[index];
      if (!Array.isArray(current) || current.length < 2) {
        continue;
      }
      const lngLat = toLngLat(current);
      const projection = this.projectOntoRoute(lngLat, Number.MAX_SAFE_INTEGER);
      if (projection?.projection?.coordinates) {
        const [lng, lat] = projection.projection.coordinates;
        updated[index] = [lng, lat];
      }
    }

    let changed = false;
    updated.forEach((coord, index) => {
      if (!Array.isArray(coord) || coord.length < 2) {
        return;
      }
      const next = [coord[0], coord[1]];
      const force = index === 0 || index === lastIndex;
      const currentWaypoint = Array.isArray(this.waypoints[index]) ? this.waypoints[index] : [];
      const hasElevation = currentWaypoint.length > 2;
      const differs = !this.coordinatesMatch(currentWaypoint, next);
      if (force && (differs || hasElevation)) {
        this.waypoints[index] = next;
        changed = true;
        return;
      }
      if (!force && differs) {
        this.waypoints[index] = next;
        changed = true;
      } else if (hasElevation) {
        this.waypoints[index] = next;
      }
    });

    return changed;
  }

  addRouteCut(distanceKm) {
    if (!this.routeProfile) {
      return;
    }

    const totalDistance = Number(this.routeProfile.totalDistanceKm) || 0;
    if (!Number.isFinite(distanceKm) || !Number.isFinite(totalDistance) || totalDistance <= ROUTE_CUT_EPSILON_KM) {
      return;
    }

    const clamped = Math.max(0, Math.min(totalDistance, distanceKm));
    if (clamped <= ROUTE_CUT_EPSILON_KM || totalDistance - clamped <= ROUTE_CUT_EPSILON_KM) {
      return;
    }

    const exists = this.routeCutDistances.some((cut) => Math.abs(cut - clamped) <= ROUTE_CUT_EPSILON_KM / 2);
    if (exists) {
      return;
    }

    this.routeCutDistances.push(clamped);
    this.routeCutDistances.sort((a, b) => a - b);
    this.updateCutDisplays();
  }

  updateDraggedBivouac(distanceKm) {
    if (this.draggedBivouacIndex === null) {
      return;
    }
    if (!this.routeProfile || !Array.isArray(this.routeCutDistances) || !this.routeCutDistances.length) {
      return;
    }

    const index = this.draggedBivouacIndex;
    if (index < 0 || index >= this.routeCutDistances.length) {
      return;
    }

    const totalDistance = Number(this.routeProfile.totalDistanceKm) || 0;
    if (!Number.isFinite(totalDistance) || totalDistance <= ROUTE_CUT_EPSILON_KM) {
      return;
    }

    const prev = index > 0 ? this.routeCutDistances[index - 1] : 0;
    const next = index < this.routeCutDistances.length - 1 ? this.routeCutDistances[index + 1] : totalDistance;
    const minDistance = index > 0 ? prev + ROUTE_CUT_EPSILON_KM : ROUTE_CUT_EPSILON_KM;
    const maxDistance = index < this.routeCutDistances.length - 1
      ? next - ROUTE_CUT_EPSILON_KM
      : totalDistance - ROUTE_CUT_EPSILON_KM;
    if (maxDistance <= minDistance) {
      return;
    }

    const clamped = Math.max(minDistance, Math.min(maxDistance, distanceKm));
    if (!Number.isFinite(clamped)) {
      return;
    }

    const current = this.routeCutDistances[index];
    if (Number.isFinite(current) && Math.abs(current - clamped) <= 1e-5) {
      return;
    }

    this.routeCutDistances[index] = clamped;
    this.updateCutDisplays();
  }

  finishBivouacDrag(lngLat) {
    const previewLngLat = Array.isArray(this.draggedBivouacLngLat)
      ? this.draggedBivouacLngLat
      : null;
    let target = null;

    if (lngLat && Number.isFinite(lngLat.lng) && Number.isFinite(lngLat.lat)) {
      target = lngLat;
    } else if (Array.isArray(lngLat) && lngLat.length >= 2) {
      target = toLngLat(lngLat);
    } else if (previewLngLat) {
      target = toLngLat(previewLngLat);
    }

    if (target) {
      const projection = this.projectOntoRoute(target, Number.MAX_SAFE_INTEGER);
      if (projection && Number.isFinite(projection.distanceKm)) {
        this.updateDraggedBivouac(projection.distanceKm);
      } else {
        this.updateCutDisplays();
      }
    } else {
      this.updateCutDisplays();
    }

    this.draggedBivouacLngLat = null;
    this.updateSegmentMarkers();
  }

  onRouteContextMenu(event) {
    if (!event?.point || !Array.isArray(this.routeSegments) || !this.routeSegments.length) {
      return;
    }

    const projection = this.projectOntoRoute(event.lngLat, ROUTE_CLICK_PIXEL_TOLERANCE);
    if (!projection || !Number.isFinite(projection.distanceKm)) {
      return;
    }

    event.preventDefault?.();
    event.originalEvent?.preventDefault?.();

    this.addRouteCut(projection.distanceKm);
  }

  setHintVisible(isVisible) {
    const visible = Boolean(isVisible);
    if (this.directionsHint) {
      this.directionsHint.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    if (this.infoButton) {
      this.infoButton.classList.toggle('show-tooltip', visible);
    }
  }

  isPanelVisible() {
    return Boolean(this.directionsControl?.classList.contains('visible'));
  }

  updatePanelVisibilityState() {
    const isVisible = this.isPanelVisible();
    if (this.directionsToggle) {
      this.directionsToggle.setAttribute('aria-expanded', isVisible ? 'true' : 'false');
    }
    if (this.directionsControl) {
      this.directionsControl.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    }
    if (this.directionsDock) {
      this.directionsDock.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    }
    if (this.routeStats) {
      this.routeStats.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    }
    if (this.elevationChart) {
      this.elevationChart.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    }
    if (!isVisible) {
      this.setHintVisible(false);
      this.hideRouteHover();
    }
  }

  onWaypointMouseDown(event) {
    if (!this.isPanelVisible()) return;
    const feature = event.features?.[0];
    if (!feature) return;
    this.isDragging = true;
    this.draggedWaypointIndex = Number(feature.properties.index);
    this.setHoveredWaypointIndex(this.draggedWaypointIndex);
    this.map.dragPan?.disable();
  }

  onSegmentMarkerMouseDown(event) {
    if (!this.isPanelVisible()) return;
    const feature = event.features?.[0];
    const type = feature?.properties?.type;
    if (type !== 'bivouac') {
      return;
    }

    const order = Number(feature.properties?.order);
    const cutIndex = Number.isFinite(order) ? order - 1 : null;
    if (!Number.isInteger(cutIndex) || cutIndex < 0) {
      return;
    }

    if (!Array.isArray(this.routeCutDistances) || cutIndex >= this.routeCutDistances.length) {
      return;
    }

    this.isDragging = true;
    this.draggedWaypointIndex = null;
    this.draggedBivouacIndex = cutIndex;
    if (event?.lngLat && Number.isFinite(event.lngLat.lng) && Number.isFinite(event.lngLat.lat)) {
      this.draggedBivouacLngLat = [event.lngLat.lng, event.lngLat.lat];
      this.updateSegmentMarkers();
    }
    this.map.dragPan?.disable();
    event.preventDefault?.();
    event.originalEvent?.preventDefault?.();
  }

  onMapMouseMove(event) {
    if (!this.isPanelVisible()) return;

    if (this.isDragging && this.draggedWaypointIndex !== null) {
      this.waypoints[this.draggedWaypointIndex] = [event.lngLat.lng, event.lngLat.lat];
      this.updateWaypoints();
    }

    if (this.isDragging && this.draggedBivouacIndex !== null) {
      if (event?.lngLat && Number.isFinite(event.lngLat.lng) && Number.isFinite(event.lngLat.lat)) {
        this.draggedBivouacLngLat = [event.lngLat.lng, event.lngLat.lat];
        this.updateSegmentMarkers();
      }
    }

    const features = this.map.queryRenderedFeatures(event.point, { layers: ['waypoints-hit-area'] });
    if (features.length > 0) {
      const feature = features[0];
      const index = Number(feature.properties.index);
      const role = feature.properties.role;
      this.setHoveredWaypointIndex(index);
      if (!this.isDragging && role === 'via') {
        this.resetSegmentHover('map');
        return;
      }
      if (this.isDragging) {
        return;
      }
    } else if (!this.isDragging) {
      this.setHoveredWaypointIndex(null);
    }

    if (!this.isDragging) {
      this.handleRouteSegmentHover(event);
    }
  }

  onMapMouseUp(event) {
    if (!this.isDragging) return;
    const movedWaypoint = this.draggedWaypointIndex !== null;
    const movedBivouac = this.draggedBivouacIndex !== null;
    this.isDragging = false;
    this.draggedWaypointIndex = null;
    this.map.dragPan?.enable();
    this.setHoveredWaypointIndex(null);
    if (movedWaypoint && this.waypoints.length >= 2) {
      this.getRoute();
      this.recordHistoryState();
    }
    if (movedBivouac) {
      const releaseLngLat = event?.lngLat ?? null;
      this.finishBivouacDrag(releaseLngLat);
    }
    this.draggedBivouacIndex = null;
  }

  onMapClick(event) {
    if (!this.isPanelVisible() || this.isDragging) return;

    const hitWaypoints = this.map.queryRenderedFeatures(event.point, { layers: ['waypoints-hit-area'] });
    if (hitWaypoints.length) return;

    const projection = this.projectOntoRoute(event.lngLat, ROUTE_CLICK_PIXEL_TOLERANCE);
    if (projection) {
      this.addViaWaypoint(event.lngLat, projection);
      return;
    }

    if (this.hoveredSegmentIndex !== null) {
      this.addViaWaypoint(event.lngLat);
      return;
    }

    this.waypoints.push([event.lngLat.lng, event.lngLat.lat]);
    if (!Array.isArray(this.legModes)) {
      this.legModes = [];
    }
    if (this.waypoints.length > 1) {
      this.legModes.push(this.currentMode);
    }
    this.updateWaypoints();
    this.recordHistoryState();
    if (this.waypoints.length >= 2) {
      this.getRoute();
    }
  }

  onWaypointDoubleClick(event) {
    if (!this.isPanelVisible()) return;
    const index = Number(event.features?.[0]?.properties.index);
    if (!Number.isFinite(index) || index <= 0 || index >= this.waypoints.length - 1) return;
    this.waypoints.splice(index, 1);
    if (!Array.isArray(this.legModes)) {
      this.legModes = [];
    }
    if (this.waypoints.length <= 1) {
      this.legModes = [];
    } else {
      const removeIndex = Math.max(0, index - 1);
      const deleteCount = Math.min(2, Math.max(0, this.legModes.length - removeIndex));
      const replacementMode = this.legModes[removeIndex]
        ?? this.legModes[removeIndex + 1]
        ?? this.currentMode;
      if (deleteCount > 0) {
        this.legModes.splice(removeIndex, deleteCount, replacementMode);
      }
      this.normalizeLegModes();
    }
    this.updateWaypoints();
    this.recordHistoryState();
    if (this.waypoints.length >= 2) {
      this.getRoute();
    } else {
      this.clearRoute();
      this.updateStats(null);
      this.updateElevationProfile([]);
    }
  }

  setHoveredWaypointIndex(index) {
    this.hoveredWaypointIndex = index;
    const target = Number.isInteger(index) ? index : -1;
    if (this.map.getLayer('waypoint-hover-drag')) {
      this.map.setFilter('waypoint-hover-drag', ['==', 'index', target]);
    }
  }

  handleRouteSegmentHover(event) {
    if (!this.routeSegments.length) {
      this.resetSegmentHover('map');
      return;
    }

    const mousePixel = this.map.project(event.lngLat);
    let closestIndex = -1;
    let minDistance = Infinity;

    this.routeSegments.forEach((segment, index) => {
      const startPixel = this.map.project(toLngLat(segment.start));
      const endPixel = this.map.project(toLngLat(segment.end));
      const distance = this.pointToSegmentDistance(mousePixel, startPixel, endPixel);
      if (distance < minDistance && distance <= HOVER_PIXEL_TOLERANCE) {
        minDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex === -1) {
      this.resetSegmentHover('map');
    } else {
      const segment = this.routeSegments[closestIndex];
      if (!segment) {
        this.resetSegmentHover('map');
        return;
      }
      const projection = this.projectPointOnSegment(event.lngLat, segment.start, segment.end);
      this.showRouteHoverOnSegment(closestIndex, projection, { mousePoint: event.point, source: 'map' });
    }
  }

  setHoveredSegment(index) {
    this.hoveredSegmentIndex = Number.isInteger(index) ? index : null;
    this.hoveredLegIndex = this.hoveredSegmentIndex !== null
      ? this.segmentLegLookup[this.hoveredSegmentIndex] ?? null
      : null;

    if (this.map.getLayer('route-segment-hover')) {
      const target = this.hoveredSegmentIndex ?? -1;
      this.map.setFilter('route-segment-hover', ['==', 'segmentIndex', target]);
    }
  }

  clearHover(source = null) {
    if (source && this.activeHoverSource && source !== this.activeHoverSource) {
      return;
    }
    this.activeHoverSource = null;
    this.setHoveredSegment(null);
    this.hideRouteHover();
  }

  resetSegmentHover(source = null) {
    this.clearHover(source);
  }

  addViaWaypoint(lngLat, projectionOverride = null) {
    if (!lngLat || this.waypoints.length < 2) {
      return;
    }

    const ensureProjection = () => {
      if (projectionOverride) {
        return projectionOverride;
      }
      return this.projectOntoRoute(lngLat, ROUTE_CLICK_PIXEL_TOLERANCE);
    };

    const projectionResult = ensureProjection();
    let segmentIndex = Number.isInteger(projectionResult?.segmentIndex)
      ? projectionResult.segmentIndex
      : null;
    let snappedCoords = Array.isArray(projectionResult?.projection?.coordinates)
      ? projectionResult.projection.coordinates.slice()
      : null;

    if (!snappedCoords && this.hoveredSegmentIndex !== null) {
      const segment = this.routeSegments[this.hoveredSegmentIndex];
      if (segment) {
        const projection = this.projectPointOnSegment(lngLat, segment.start, segment.end);
        if (Array.isArray(projection?.coordinates)) {
          snappedCoords = projection.coordinates.slice();
          segmentIndex = this.hoveredSegmentIndex;
        }
      }
    }

    if (!Array.isArray(snappedCoords) || snappedCoords.length < 2) {
      return;
    }

    const [lng, lat] = snappedCoords;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return;
    }

    const snapped = [lng, lat];
    const alreadyExists = this.waypoints.some((coord) => this.coordinatesMatch(coord, snapped));
    if (alreadyExists) {
      this.resetSegmentHover();
      return;
    }

    let insertIndex = this.waypoints.length - 1;
    const projectedLeg = Number.isInteger(segmentIndex)
      ? this.segmentLegLookup?.[segmentIndex]
      : null;
    if (Number.isInteger(projectedLeg)) {
      insertIndex = Math.min(projectedLeg + 1, this.waypoints.length - 1);
    } else if (Number.isInteger(this.hoveredLegIndex)) {
      insertIndex = Math.min(this.hoveredLegIndex + 1, this.waypoints.length - 1);
    }

    insertIndex = Math.max(1, insertIndex);

    this.waypoints.splice(insertIndex, 0, snapped);
    if (!Array.isArray(this.legModes)) {
      this.legModes = [];
    }
    const modeIndex = Math.max(0, insertIndex - 1);
    const existingMode = this.legModes[modeIndex] ?? this.legModes[modeIndex - 1] ?? this.currentMode;
    this.legModes.splice(modeIndex, 1, existingMode, existingMode);
    this.updateWaypoints();
    this.resetSegmentHover();
    this.recordHistoryState();
    this.getRoute();
  }

  updateWaypoints() {
    const source = this.map.getSource('waypoints');
    if (!source) return;
    const total = this.waypoints.length;
    const features = this.waypoints.map((coords, index) => {
      const extras = this.buildWaypointDisplayProperties(coords, index, total);
      return createWaypointFeature(coords, index, total, extras);
    });
    source.setData({
      type: 'FeatureCollection',
      features
    });

    this.updateSegmentMarkers();
  }

  buildWaypointDisplayProperties(coords, index, total) {
    const color = this.resolveWaypointColor(coords, index, total);
    return { color };
  }

  resolveWaypointColor(coords, index, total) {
    const fallback = this.modeColors[this.currentMode];
    if (!Array.isArray(coords) || coords.length < 2) {
      return fallback;
    }

    const isStart = index === 0;
    const isEnd = total > 1 && index === total - 1;
    if (isStart) {
      return '#2f8f3b';
    }
    if (isEnd) {
      return '#d64545';
    }

    const viaFallback = this.cutSegments?.[0]?.color ?? fallback;
    if (!Array.isArray(this.routeSegments) || !this.routeSegments.length) {
      return viaFallback;
    }

    try {
      const lngLat = toLngLat(coords);
      const projection = this.projectOntoRoute(lngLat, ROUTE_CLICK_PIXEL_TOLERANCE);
      if (projection && Number.isFinite(projection.distanceKm)) {
        const segment = this.getCutSegmentForDistance(projection.distanceKm);
        if (segment?.color) {
          return segment.color;
        }
      }
    } catch (error) {
      console.warn('Failed to resolve waypoint color', error);
    }

    return viaFallback;
  }

  projectPointOnSegment(lngLat, startCoord, endCoord) {
    const startPixel = this.map.project(toLngLat(startCoord));
    const endPixel = this.map.project(toLngLat(endCoord));
    const clickPixel = this.map.project(lngLat);
    const dx = endPixel.x - startPixel.x;
    const dy = endPixel.y - startPixel.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      return { coordinates: [...startCoord], t: 0 };
    }
    let t = ((clickPixel.x - startPixel.x) * dx + (clickPixel.y - startPixel.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    const projected = {
      x: startPixel.x + t * dx,
      y: startPixel.y + t * dy
    };
    const result = this.map.unproject(projected);
    return { coordinates: [result.lng, result.lat], t };
  }

  pointToSegmentDistance(point, startPixel, endPixel) {
    const dx = endPixel.x - startPixel.x;
    const dy = endPixel.y - startPixel.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      return Math.hypot(point.x - startPixel.x, point.y - startPixel.y);
    }
    let t = ((point.x - startPixel.x) * dx + (point.y - startPixel.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    const projection = {
      x: startPixel.x + t * dx,
      y: startPixel.y + t * dy
    };
    return Math.hypot(point.x - projection.x, point.y - projection.y);
  }

  findProfileIntervalIndex(distanceKm) {
    const profile = this.routeProfile;
    const distances = profile?.cumulativeDistances;
    if (!profile || !Array.isArray(distances) || distances.length < 2) {
      return null;
    }
    if (!Number.isFinite(distanceKm)) {
      return null;
    }

    const lastIndex = distances.length - 1;
    if (distanceKm <= (distances[0] ?? 0)) {
      return 0;
    }
    if (distanceKm >= (distances[lastIndex] ?? 0)) {
      return Math.max(0, lastIndex - 1);
    }

    let low = 0;
    let high = lastIndex;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const value = distances[mid];
      if (!Number.isFinite(value)) {
        break;
      }
      if (value <= distanceKm) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const index = Math.max(0, Math.min(low - 1, lastIndex - 1));
    return index;
  }

  getElevationAtDistance(distanceKm) {
    if (!this.routeProfile || !Number.isFinite(distanceKm)) {
      return null;
    }

    const distances = this.routeProfile.cumulativeDistances ?? [];
    const elevations = this.routeProfile.elevations ?? [];
    if (!Array.isArray(distances) || !Array.isArray(elevations) || distances.length !== elevations.length) {
      return null;
    }

    const lastIndex = distances.length - 1;
    if (lastIndex < 0) {
      return null;
    }

    const findPrev = (startIndex) => {
      for (let index = Math.min(startIndex, lastIndex); index >= 0; index -= 1) {
        const distance = distances[index];
        const elevation = elevations[index];
        if (!Number.isFinite(distance) || distance > distanceKm) {
          continue;
        }
        if (Number.isFinite(elevation)) {
          return { distance, elevation };
        }
      }
      return null;
    };

    const findNext = (startIndex) => {
      for (let index = Math.max(startIndex, 0); index <= lastIndex; index += 1) {
        const distance = distances[index];
        const elevation = elevations[index];
        if (!Number.isFinite(distance) || distance < distanceKm) {
          continue;
        }
        if (Number.isFinite(elevation)) {
          return { distance, elevation };
        }
      }
      return null;
    };

    if (distanceKm <= (distances[0] ?? 0)) {
      const next = findNext(0);
      return next?.elevation ?? null;
    }

    if (distanceKm >= (distances[lastIndex] ?? 0)) {
      const prev = findPrev(lastIndex);
      return prev?.elevation ?? null;
    }

    const intervalIndex = this.findProfileIntervalIndex(distanceKm);
    if (intervalIndex === null) {
      return null;
    }

    const previous = findPrev(Math.min(intervalIndex + 1, lastIndex));
    const next = findNext(Math.max(intervalIndex, 0));

    if (previous && next && Number.isFinite(previous.distance) && Number.isFinite(next.distance)
      && next.distance > previous.distance) {
      const span = next.distance - previous.distance;
      const ratio = span > 0 ? (distanceKm - previous.distance) / span : 0;
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      return previous.elevation + (next.elevation - previous.elevation) * clampedRatio;
    }

    if (previous) {
      return previous.elevation;
    }
    if (next) {
      return next.elevation;
    }

    return null;
  }

  computeGradeAtDistance(distanceKm, windowMeters = 30) {
    if (!this.routeProfile || !Number.isFinite(distanceKm)) {
      return null;
    }

    const totalDistance = Number(this.routeProfile.totalDistanceKm);
    if (!Number.isFinite(totalDistance) || totalDistance <= 0) {
      return null;
    }

    const minimumWindowKm = Math.max(windowMeters / 1000, Math.min(totalDistance, 0.01));
    const dynamicWindowKm = Math.max(minimumWindowKm, totalDistance * 0.015);
    const windowKm = Math.min(dynamicWindowKm, totalDistance);

    let startDistance = Math.max(0, distanceKm - windowKm / 2);
    let endDistance = Math.min(totalDistance, distanceKm + windowKm / 2);

    if (endDistance - startDistance < minimumWindowKm) {
      const padding = (minimumWindowKm - (endDistance - startDistance)) / 2;
      startDistance = Math.max(0, startDistance - padding);
      endDistance = Math.min(totalDistance, endDistance + padding);
    }

    const span = endDistance - startDistance;
    if (!Number.isFinite(span) || span <= 0.002) {
      return null;
    }

    const startElevation = this.getElevationAtDistance(startDistance);
    const endElevation = this.getElevationAtDistance(endDistance);
    if (!Number.isFinite(startElevation) || !Number.isFinite(endElevation)) {
      return null;
    }

    const horizontalMeters = Math.max(span * 1000, 1);
    const grade = ((endElevation - startElevation) / horizontalMeters) * 100;
    if (!Number.isFinite(grade)) {
      return null;
    }

    const clamped = Math.max(Math.min(grade, 100), -100);
    return clamped;
  }

  computeDistanceKm(startCoord, endCoord) {
    if (!startCoord || !endCoord) return 0;
    if (turfApi) {
      try {
        return turfApi.distance(turfApi.point(startCoord), turfApi.point(endCoord), { units: 'kilometers' });
      } catch (error) {
        console.warn('Failed to measure distance with turf', error);
      }
    }

    const toRadians = (value) => (value * Math.PI) / 180;
    const [lng1, lat1] = startCoord;
    const [lng2, lat2] = endCoord;
    const earthRadiusKm = 6371;
    const dLat = toRadians((lat2 ?? 0) - (lat1 ?? 0));
    const dLng = toRadians((lng2 ?? 0) - (lng1 ?? 0));
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRadians(lat1 ?? 0)) * Math.cos(toRadians(lat2 ?? 0)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    return earthRadiusKm * c;
  }

  findSegmentIndexByDistance(distanceKm) {
    if (!Array.isArray(this.routeSegments) || !this.routeSegments.length) {
      return null;
    }
    if (!Number.isFinite(distanceKm)) {
      return null;
    }

    const lastIndex = this.routeSegments.length - 1;
    if (distanceKm <= (this.routeSegments[0]?.startDistanceKm ?? 0)) {
      return 0;
    }
    if (distanceKm >= (this.routeSegments[lastIndex]?.endDistanceKm ?? 0)) {
      return lastIndex;
    }

    let low = 0;
    let high = lastIndex;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const segment = this.routeSegments[mid];
      if (!segment) {
        break;
      }
      const start = segment.startDistanceKm ?? 0;
      const end = segment.endDistanceKm ?? start;
      if (distanceKm < start) {
        high = mid - 1;
      } else if (distanceKm > end) {
        low = mid + 1;
      } else {
        return mid;
      }
    }

    const candidate = Math.max(0, Math.min(low, lastIndex));
    return candidate;
  }

  interpolateSegmentCoordinate(segment, t, distanceKm) {
    if (!segment) {
      return null;
    }
    const start = segment.start ?? [];
    const end = segment.end ?? [];
    const startLng = Number(start[0]);
    const startLat = Number(start[1]);
    const endLng = Number(end[0]);
    const endLat = Number(end[1]);
    if (!Number.isFinite(startLng) || !Number.isFinite(startLat) || !Number.isFinite(endLng) || !Number.isFinite(endLat)) {
      return null;
    }

    const clampedT = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
    const lng = startLng + (endLng - startLng) * clampedT;
    const lat = startLat + (endLat - startLat) * clampedT;

    const coord = [lng, lat];
    const interpolatedElevation = this.getElevationAtDistance(distanceKm);
    if (Number.isFinite(interpolatedElevation)) {
      coord.push(interpolatedElevation);
      return coord;
    }

    const startElevation = Number(start[2]);
    const endElevation = Number(end[2]);
    if (Number.isFinite(startElevation) && Number.isFinite(endElevation)) {
      coord.push(startElevation + (endElevation - startElevation) * clampedT);
    } else if (Number.isFinite(startElevation)) {
      coord.push(startElevation);
    } else if (Number.isFinite(endElevation)) {
      coord.push(endElevation);
    }

    return coord;
  }

  showRouteHoverOnSegment(segmentIndex, projection, { mousePoint = null, source = null } = {}) {
    const segment = this.routeSegments?.[segmentIndex];
    if (!segment) {
      return;
    }

    const clampedT = Math.max(0, Math.min(1, Number.isFinite(projection?.t) ? projection.t : 0));
    const distanceKm = Number.isFinite(projection?.distanceKm)
      ? projection.distanceKm
      : (segment.startDistanceKm ?? 0) + (segment.distanceKm ?? 0) * clampedT;

    const coordinates = this.interpolateSegmentCoordinate(segment, clampedT, distanceKm) ?? projection?.coordinates ?? null;
    let screenPoint = mousePoint;
    if ((!screenPoint || !Number.isFinite(screenPoint.x) || !Number.isFinite(screenPoint.y)) && coordinates) {
      try {
        const projected = this.map.project(toLngLat(coordinates));
        if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
          screenPoint = { x: projected.x, y: projected.y };
        }
      } catch (error) {
        console.warn('Failed to project hover coordinate', error);
      }
    }

    const projectionData = {
      ...projection,
      coordinates,
      t: clampedT,
      distanceKm,
      source
    };

    this.activeHoverSource = source ?? null;
    this.setHoveredSegment(segmentIndex);
    this.updateRouteHoverDisplay(screenPoint, segment, projectionData);
  }

  showRouteHoverAtDistance(distanceKm, { source = null } = {}) {
    if (!Number.isFinite(distanceKm)) {
      this.resetSegmentHover(source ?? undefined);
      return;
    }

    const segmentIndex = this.findSegmentIndexByDistance(distanceKm);
    if (!Number.isInteger(segmentIndex)) {
      this.resetSegmentHover(source ?? undefined);
      return;
    }

    const segment = this.routeSegments?.[segmentIndex];
    if (!segment) {
      this.resetSegmentHover(source ?? undefined);
      return;
    }

    const startDistance = segment.startDistanceKm ?? 0;
    const segmentDistance = segment.distanceKm ?? 0;
    let relativeDistance = distanceKm - startDistance;
    if (!Number.isFinite(relativeDistance)) {
      relativeDistance = 0;
    }
    relativeDistance = Math.max(0, Math.min(segmentDistance, relativeDistance));
    const t = segmentDistance > 0 ? relativeDistance / segmentDistance : 0;

    this.showRouteHoverOnSegment(segmentIndex, { t, distanceKm }, { source });
  }

  buildRouteProfile(coordinates = []) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return null;
    }

    const cumulativeDistances = new Array(coordinates.length).fill(0);
    let totalDistance = 0;

    for (let index = 1; index < coordinates.length; index += 1) {
      const segmentDistance = this.computeDistanceKm(coordinates[index - 1], coordinates[index]);
      totalDistance += Number.isFinite(segmentDistance) ? segmentDistance : 0;
      cumulativeDistances[index] = totalDistance;
    }

    const elevations = coordinates.map((coord) => {
      const elevation = coord?.[2];
      return Number.isFinite(elevation) ? elevation : null;
    });

    return {
      coordinates,
      cumulativeDistances,
      totalDistanceKm: totalDistance,
      elevations
    };
  }

  generateElevationSamples(coordinates) {
    if (!this.routeProfile) return [];
    const profile = this.routeProfile;
    const points = (coordinates ?? [])
      .map((coord, index) => ({
        elevation: Number.isFinite(coord?.[2]) ? coord[2] : null,
        distanceKm: profile.cumulativeDistances[index] ?? 0
      }))
      .filter((point) => Number.isFinite(point.elevation));

    if (points.length < 2) {
      return [];
    }

    if (points.length <= MAX_ELEVATION_POINTS) {
      const samples = points.map((point, index) => ({
        elevation: point.elevation,
        startDistanceKm: index === 0 ? 0 : points[index - 1].distanceKm,
        endDistanceKm: point.distanceKm
      }));
      if (samples.length) {
        const lastSample = samples[samples.length - 1];
        if (Number.isFinite(profile.totalDistanceKm) && lastSample.endDistanceKm < profile.totalDistanceKm) {
          lastSample.endDistanceKm = profile.totalDistanceKm;
        }
      }
      return samples;
    }

    const samples = [];
    const bucketSize = points.length / MAX_ELEVATION_POINTS;

    for (let bucketIndex = 0; bucketIndex < MAX_ELEVATION_POINTS; bucketIndex += 1) {
      const start = Math.floor(bucketIndex * bucketSize);
      const end = bucketIndex === MAX_ELEVATION_POINTS - 1
        ? points.length
        : Math.max(start + 1, Math.floor((bucketIndex + 1) * bucketSize));

      let elevationSum = 0;
      let count = 0;
      for (let index = start; index < end; index += 1) {
        elevationSum += points[index].elevation;
        count += 1;
      }

      const firstPoint = points[start];
      const lastPoint = points[Math.min(end - 1, points.length - 1)];
      const startDistanceKm = firstPoint?.distanceKm ?? 0;
      const endDistanceKm = lastPoint?.distanceKm ?? startDistanceKm;
      samples.push({
        elevation: count ? elevationSum / count : firstPoint?.elevation ?? 0,
        startDistanceKm,
        endDistanceKm
      });
    }

    if (samples.length) {
      const lastSample = samples[samples.length - 1];
      if (Number.isFinite(profile.totalDistanceKm) && lastSample.endDistanceKm < profile.totalDistanceKm) {
        lastSample.endDistanceKm = profile.totalDistanceKm;
      }
    }

    return samples;
  }

  ensureRouteHoverTooltip() {
    if (this.routeHoverTooltip && this.routeHoverTooltip.parentElement) {
      return this.routeHoverTooltip;
    }
    const tooltip = document.createElement('div');
    tooltip.className = 'directions-route-tooltip';
    tooltip.setAttribute('role', 'presentation');
    tooltip.style.display = 'none';
    (this.mapContainer ?? document.body).appendChild(tooltip);
    this.routeHoverTooltip = tooltip;
    return tooltip;
  }

  formatGrade(value) {
    if (!Number.isFinite(value)) return '—';
    const rounded = Math.round(value * 10) / 10;
    const formatted = Math.abs(rounded) < 0.05 ? 0 : rounded;
    const sign = formatted > 0 ? '+' : '';
    return `${sign}${formatted.toFixed(1)}%`;
  }

  highlightElevationAt(distanceKm) {
    if (!this.elevationChartContainer) return;
    const bars = Array.from(this.elevationChartContainer.querySelectorAll('.elevation-bar'));
    let targetBar = null;
    let fallbackBar = null;
    let fallbackDelta = Infinity;

    if (Number.isFinite(distanceKm)) {
      for (const bar of bars) {
        const startKm = Number(bar.dataset.startKm);
        const endKm = Number(bar.dataset.endKm);
        if (!Number.isFinite(startKm) || !Number.isFinite(endKm)) {
          continue;
        }
        const segmentSpan = Math.max(endKm - startKm, 0);
        const tolerance = Math.max(0.0005, segmentSpan * 0.6);
        if (distanceKm >= startKm - tolerance && distanceKm <= endKm + tolerance) {
          targetBar = bar;
          break;
        }
        const center = startKm + segmentSpan / 2;
        const delta = Math.abs(center - distanceKm);
        if (delta < fallbackDelta) {
          fallbackDelta = delta;
          fallbackBar = bar;
        }
      }

      if (!targetBar && fallbackBar) {
        targetBar = fallbackBar;
      }
    }

    if (this.highlightedElevationBar && this.highlightedElevationBar !== targetBar) {
      this.highlightedElevationBar.classList.remove('highlighted');
    }

    if (targetBar) {
      if (targetBar !== this.highlightedElevationBar) {
        targetBar.classList.add('highlighted');
      }
      this.highlightedElevationBar = targetBar;
    } else {
      this.highlightedElevationBar = null;
    }
  }

  detachElevationChartEvents() {
    if (!this.elevationChartContainer) {
      return;
    }
    this.elevationChartContainer.removeEventListener('pointermove', this.handleElevationPointerMove);
    this.elevationChartContainer.removeEventListener('pointerleave', this.handleElevationPointerLeave);
  }

  attachElevationChartEvents() {
    if (!this.elevationChartContainer) {
      return;
    }
    this.elevationChartContainer.addEventListener('pointermove', this.handleElevationPointerMove);
    this.elevationChartContainer.addEventListener('pointerleave', this.handleElevationPointerLeave);
  }

  onElevationPointerMove(event) {
    if (!this.elevationChartContainer) {
      return;
    }

    const bars = Array.from(this.elevationChartContainer.querySelectorAll('.elevation-bar'));
    if (!bars.length) {
      return;
    }

    let target = event.target?.closest?.('.elevation-bar') ?? null;
    if (!target || !this.elevationChartContainer.contains(target)) {
      const rect = this.elevationChartContainer.getBoundingClientRect();
      const relativeX = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
      const ratio = Math.max(0, Math.min(0.9999, relativeX));
      const index = Math.max(0, Math.min(bars.length - 1, Math.floor(ratio * bars.length)));
      target = bars[index];
    }

    if (!target) {
      return;
    }

    const startKm = Number(target.dataset.startKm);
    const endKm = Number(target.dataset.endKm);
    if (!Number.isFinite(startKm) || !Number.isFinite(endKm)) {
      return;
    }

    const midpoint = Number(target.dataset.midKm);
    const distanceKm = Number.isFinite(midpoint)
      ? midpoint
      : Math.max(0, startKm + Math.max(0, endKm - startKm) / 2);

    if (this.activeHoverSource === 'chart' && this.lastElevationHoverDistance !== null
      && Math.abs(this.lastElevationHoverDistance - distanceKm) < 1e-4) {
      return;
    }

    this.lastElevationHoverDistance = distanceKm;
    this.showRouteHoverAtDistance(distanceKm, { source: 'chart' });
  }

  onElevationPointerLeave() {
    this.lastElevationHoverDistance = null;
    this.resetSegmentHover('chart');
  }

  hideRouteHover() {
    if (this.routeHoverTooltip) {
      this.routeHoverTooltip.style.display = 'none';
    }
    this.map.getSource('route-hover-point-source')?.setData(EMPTY_COLLECTION);
    if (this.map.getLayer('route-hover-point')) {
      this.map.setPaintProperty('route-hover-point', 'circle-opacity', 0);
    }
    const canvas = this.map.getCanvas?.();
    if (canvas) {
      canvas.style.cursor = '';
    }
    this.highlightElevationAt(null);
  }

  updateRouteHoverDisplay(mousePoint, segment, projection) {
    if (!segment || !projection) return;

    const tooltip = this.ensureRouteHoverTooltip();
    const clampedT = Math.max(0, Math.min(1, Number.isFinite(projection.t) ? projection.t : 0));
    const distanceKm = Number.isFinite(projection.distanceKm)
      ? projection.distanceKm
      : (segment.startDistanceKm ?? 0) + (segment.distanceKm ?? 0) * clampedT;
    const distanceLabel = this.formatDistance(distanceKm);
    const elevation = this.getElevationAtDistance(distanceKm);
    let gradeValue = this.computeGradeAtDistance(distanceKm);
    if (!Number.isFinite(gradeValue)) {
      if ((segment.distanceKm ?? 0) > 0 && Number.isFinite(segment.startElevation) && Number.isFinite(segment.endElevation)) {
        gradeValue = ((segment.endElevation - segment.startElevation) / Math.max(segment.distanceKm * 1000, 1)) * 100;
      } else {
        gradeValue = null;
      }
    }
    const altitudeLabel = Number.isFinite(elevation) ? `${Math.round(elevation)} m` : 'N/A';
    const gradeLabel = this.formatGrade(gradeValue);

    let screenPoint = mousePoint;
    if ((!screenPoint || !Number.isFinite(screenPoint.x) || !Number.isFinite(screenPoint.y)) && projection.coordinates) {
      try {
        const projected = this.map.project(toLngLat(projection.coordinates));
        if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
          screenPoint = { x: projected.x, y: projected.y };
        }
      } catch (error) {
        console.warn('Failed to project tooltip coordinate', error);
      }
    }

    tooltip.innerHTML = `
      <div class="tooltip-distance">${distanceLabel} km</div>
      <div class="tooltip-details">
        <span class="tooltip-altitude">Alt. ${altitudeLabel}</span>
        <span class="tooltip-grade">${gradeLabel}</span>
      </div>
    `;
    tooltip.style.display = 'block';

    const container = this.mapContainer;
    if (container && screenPoint) {
      const margin = 12;
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      const maxLeft = container.clientWidth - tooltipWidth - margin;
      const maxTop = container.clientHeight - tooltipHeight - margin;
      const centeredLeft = screenPoint.x - tooltipWidth / 2;
      let rawTop = screenPoint.y - tooltipHeight - margin;
      if (rawTop < margin) {
        rawTop = Math.min(screenPoint.y + margin, maxTop);
      }
      const left = Math.min(Math.max(centeredLeft, margin), Math.max(margin, maxLeft));
      const top = Math.min(Math.max(rawTop, margin), Math.max(margin, maxTop));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    if (this.map.getLayer('route-hover-point')) {
      const hoverSegment = this.getCutSegmentForDistance(distanceKm);
      const hoverColor = hoverSegment?.color ?? this.modeColors[this.currentMode];
      this.map.setPaintProperty('route-hover-point', 'circle-stroke-color', hoverColor);
      this.map.setPaintProperty('route-hover-point', 'circle-opacity', 1);
    }
    if (projection.coordinates) {
      this.map.getSource('route-hover-point-source')?.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: projection.coordinates }
          }
        ]
      });
    } else {
      this.map.getSource('route-hover-point-source')?.setData(EMPTY_COLLECTION);
    }

    const canvas = this.map.getCanvas?.();
    if (canvas) {
      const shouldPointer = projection.source === 'map';
      canvas.style.cursor = shouldPointer ? 'pointer' : '';
    }

    this.highlightElevationAt(distanceKm);
  }

  clearRoute() {
    this.pauseHikerAnimation();
    this.hikerLastPosition = null;
    this.segmentModeLookup = [];
    this.routeGeojson = null;
    this.routeSegments = [];
    this.segmentLegLookup = [];
    this.latestMetrics = null;
    this.routeProfile = null;
    this.elevationSamples = [];
    this.resetRouteCuts();
    this.detachElevationChartEvents();
    this.elevationChartContainer = null;
    this.highlightedElevationBar = null;
    this.lastElevationHoverDistance = null;
    this.draggedBivouacIndex = null;
    this.draggedBivouacLngLat = null;

    this.updateRouteLineSource();
    this.map.getSource('distance-markers-source')?.setData(EMPTY_COLLECTION);
    this.map.getSource('route-segments-source')?.setData(EMPTY_COLLECTION);
    this.clearHover();
    this.updateWaypoints();
    this.notifyRouteSegmentsUpdated();
    this.normalizeLegModes();
  }

  clearDirections() {
    this.waypoints = [];
    this.legModes = [];
    this.draggedBivouacLngLat = null;
    this.updateWaypoints();
    this.clearRoute();
    this.updateStats(null);
    this.updateElevationProfile([]);
    this.draggedWaypointIndex = null;
    this.draggedBivouacIndex = null;
    this.setHoveredWaypointIndex(null);
    this.recordHistoryState();
  }

  setTransportMode(mode) {
    if (!this.modeColors[mode]) return;
    this.currentMode = mode;
    this.transportModes.forEach((button) => {
      if (!button) return;
      const isActive = button.dataset.mode === mode;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    if (this.map.getLayer('route-line')) {
      this.map.setPaintProperty(
        'route-line',
        'line-color',
        ['coalesce', ['get', 'color'], this.modeColors[this.currentMode]]
      );
    }
    if (this.map.getLayer('route-hover-point')) {
      this.map.setPaintProperty('route-hover-point', 'circle-stroke-color', this.modeColors[this.currentMode]);
    }
    if (this.cutSegments.length) {
      this.updateCutSegmentColors();
      this.updateRouteLineSource();
      if (Array.isArray(this.routeGeojson?.geometry?.coordinates) && this.routeGeojson.geometry.coordinates.length >= 2) {
        this.updateElevationProfile(this.routeGeojson.geometry.coordinates);
      }
      this.notifyRouteSegmentsUpdated();
    }
    this.updateWaypoints();
    this.updatePlayButtonState();
  }

  rebuildSegmentData() {
    const coords = this.routeGeojson?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      this.routeSegments = [];
      this.segmentLegLookup = [];
      this.map.getSource('route-segments-source')?.setData(EMPTY_COLLECTION);
      this.resetSegmentHover();
      return;
    }

    const profile = this.routeProfile;
    const cumulative = profile?.cumulativeDistances ?? [];
    const elevations = profile?.elevations ?? [];

    this.routeSegments = coords.slice(0, -1).map((coord, index) => {
      const startDistanceKm = cumulative[index] ?? 0;
      const endDistanceKm = cumulative[index + 1] ?? startDistanceKm;
      const distanceKm = Math.max(0, endDistanceKm - startDistanceKm);
      return {
        start: coord,
        end: coords[index + 1],
        index,
        startDistanceKm,
        endDistanceKm,
        distanceKm,
        startElevation: elevations[index],
        endElevation: elevations[index + 1]
      };
    });

    this.segmentLegLookup = this.computeSegmentLegLookup(coords);

    const segmentFeatures = this.routeSegments.map((segment) => ({
      type: 'Feature',
      properties: { segmentIndex: segment.index },
      geometry: {
        type: 'LineString',
        coordinates: [segment.start, segment.end]
      }
    }));

    this.map.getSource('route-segments-source')?.setData({
      type: 'FeatureCollection',
      features: segmentFeatures
    });

    this.resetSegmentHover();
  }

  computeSegmentLegLookup(coords) {
    if (this.waypoints.length < 2) return [];
    const lookup = new Array(coords.length - 1).fill(0);
    let currentLeg = 0;
    let nextWaypointIndex = 1;

    for (let i = 0; i < coords.length - 1; i += 1) {
      lookup[i] = currentLeg;
      const nextWaypoint = this.waypoints[nextWaypointIndex];
      if (nextWaypoint && this.coordinatesMatch(coords[i + 1], nextWaypoint)) {
        currentLeg = Math.min(currentLeg + 1, this.waypoints.length - 2);
        nextWaypointIndex += 1;
      }
    }

    return lookup;
  }

  coordinatesMatch(a, b) {
    if (!a || !b) return false;
    if (Math.abs(a[0] - b[0]) <= COORD_EPSILON && Math.abs(a[1] - b[1]) <= COORD_EPSILON) {
      return true;
    }
    if (!turfApi) return false;
    try {
      const distance = turfApi.distance(turfApi.point(a), turfApi.point(b), { units: 'meters' });
      return Number.isFinite(distance) && distance <= WAYPOINT_MATCH_TOLERANCE_METERS;
    } catch (error) {
      console.warn('Failed to compare waypoint coordinates', error);
      return false;
    }
  }

  formatDistance(distanceKm) {
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      return '0.0';
    }
    if (distanceKm >= 100) {
      return Math.round(distanceKm).toString();
    }
    if (distanceKm >= 10) {
      return distanceKm.toFixed(1);
    }
    return parseFloat(distanceKm.toFixed(2)).toString();
  }

  niceNumber(value, round) {
    const absValue = Math.abs(value);
    if (!Number.isFinite(absValue) || absValue === 0) {
      return 1;
    }
    const exponent = Math.floor(Math.log10(absValue));
    const fraction = absValue / 10 ** exponent;
    let niceFraction;

    if (round) {
      if (fraction < 1.5) {
        niceFraction = 1;
      } else if (fraction < 3) {
        niceFraction = 2;
      } else if (fraction < 7) {
        niceFraction = 5;
      } else {
        niceFraction = 10;
      }
    } else if (fraction <= 1) {
      niceFraction = 1;
    } else if (fraction <= 2) {
      niceFraction = 2;
    } else if (fraction <= 5) {
      niceFraction = 5;
    } else {
      niceFraction = 10;
    }

    return niceFraction * 10 ** exponent;
  }

  computeAxisTicks(minValue, maxValue, maxTicks = 6) {
    let min = Number.isFinite(minValue) ? minValue : 0;
    let max = Number.isFinite(maxValue) ? maxValue : min;

    if (max < min) {
      [min, max] = [max, min];
    }

    if (max === min) {
      const adjustment = Math.max(1, Math.abs(max) * 0.05 || 1);
      min -= adjustment;
      max += adjustment;
    }

    const span = Math.max(max - min, Number.EPSILON);
    const niceRange = this.niceNumber(span, false);
    const step = Math.max(
      this.niceNumber(niceRange / Math.max(1, maxTicks - 1), true),
      Number.EPSILON
    );
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    const ticks = [];
    const epsilon = step * 0.001;
    for (let value = niceMin; value <= niceMax + epsilon; value += step) {
      ticks.push(Number(value.toFixed(6)));
    }
    return { ticks, min: niceMin, max: niceMax, step };
  }

  formatElevationLabel(value) {
    if (!Number.isFinite(value)) return '0 m';
    return `${Math.round(value)} m`;
  }

  formatDistanceTick(value) {
    if (!Number.isFinite(value) || Math.abs(value) < 1e-6) {
      return '0 km';
    }
    return `${this.formatDistance(value)} km`;
  }

  calculateRouteMetrics(route) {
    const metrics = { distanceKm: 0, ascent: 0, descent: 0 };
    if (!route || !route.geometry?.coordinates) {
      return metrics;
    }

    const coords = route.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      return metrics;
    }

    if (turfApi) {
      try {
        const line = turfApi.lineString(coords);
        metrics.distanceKm = Number(turfApi.length(line, { units: 'kilometers' })) || 0;
      } catch (error) {
        console.error('Error computing route length', error);
      }
    }

    if (!metrics.distanceKm) {
      const summaryDistance = Number(route.properties?.summary?.distance);
      if (Number.isFinite(summaryDistance) && summaryDistance > 0) {
        metrics.distanceKm = summaryDistance / 1000;
      } else if (Array.isArray(route.properties?.segments)) {
        const totalMeters = route.properties.segments
          .map((segment) => Number(segment.distance) || 0)
          .reduce((total, value) => total + value, 0);
        metrics.distanceKm = totalMeters / 1000;
      }
    }

    let previousElevation = null;
    coords.forEach((coord) => {
      const elevation = coord?.[2];
      if (!Number.isFinite(elevation)) return;
      if (previousElevation === null) {
        previousElevation = elevation;
        return;
      }
      const delta = elevation - previousElevation;
      if (delta > 0) {
        metrics.ascent += delta;
      } else if (delta < 0) {
        metrics.descent += Math.abs(delta);
      }
      previousElevation = elevation;
    });

    if (metrics.ascent === 0 && metrics.descent === 0 && Array.isArray(route.properties?.segments)) {
      metrics.ascent = route.properties.segments
        .map((segment) => Number(segment.ascent) || 0)
        .reduce((total, value) => total + value, 0);
      metrics.descent = route.properties.segments
        .map((segment) => Number(segment.descent) || 0)
        .reduce((total, value) => total + value, 0);
    }

    return metrics;
  }

  updateStats(route) {
    if (!this.routeStats) return;
    if (!route || !route.geometry?.coordinates || route.geometry.coordinates.length < 2) {
      this.routeStats.innerHTML = '';
      this.routeStats.classList.remove('has-stats');
      return;
    }

    const metrics = this.latestMetrics ?? this.calculateRouteMetrics(route);
    const distanceLabel = this.formatDistance(metrics.distanceKm);
    const ascent = Math.max(0, Math.round(metrics.ascent));
    const descent = Math.max(0, Math.round(metrics.descent));

    const stats = [
      { key: 'ascent', label: 'Total ascent', value: `${ascent} m` },
      { key: 'descent', label: 'Total descent', value: `${descent} m` },
      { key: 'distance', label: 'Total distance', value: `${distanceLabel} km` }
    ];

    const listItems = stats
      .map(({ key, label, value }) => {
        const icon = SUMMARY_ICONS[key] ?? '';
        const iconMarkup = icon ? `${icon}` : '';
        return `
        <li
          class="summary-item ${key}"
          aria-label="${label} ${value}"
          title="${label}"
        >
          ${iconMarkup}
          <span aria-hidden="true">${value}</span>
        </li>
      `.trim();
      })
      .join('');

    this.routeStats.innerHTML = `
      <span class="sr-only">
        Distance: ${distanceLabel} km. Ascent: ${ascent} m. Descent: ${descent} m.
      </span>
      <ul class="route-stats-list">
        ${listItems}
      </ul>
    `;
    this.routeStats.classList.add('has-stats');
  }

  updateElevationProfile(coordinates) {
    if (!this.elevationChart) return;
    this.detachElevationChartEvents();
    this.lastElevationHoverDistance = null;
    if (this.elevationResizeObserver) {
      this.elevationResizeObserver.disconnect();
      this.elevationResizeObserver = null;
    }
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      this.elevationChart.innerHTML = '';
      this.elevationSamples = [];
      this.elevationChartContainer = null;
      this.highlightedElevationBar = null;
      return;
    }

    const samples = this.generateElevationSamples(coordinates);

    if (!samples.length) {
      this.elevationChart.innerHTML = '';
      this.elevationSamples = [];
      this.elevationChartContainer = null;
      this.highlightedElevationBar = null;
      this.lastElevationHoverDistance = null;
      return;
    }

    const metrics = this.latestMetrics ?? this.calculateRouteMetrics({ geometry: { coordinates } });
    const totalDistance = Number(metrics.distanceKm) || 0;
    const distanceLabel = this.formatDistance(totalDistance);
    const ascent = Math.max(0, Math.round(metrics.ascent ?? 0));
    const descent = Math.max(0, Math.round(metrics.descent ?? 0));

    this.elevationSamples = samples;

    const elevations = samples.map((sample) => sample.elevation);
    const maxElevation = Math.max(...elevations);
    const minElevation = Math.min(...elevations);
    const yAxis = this.computeAxisTicks(minElevation, maxElevation, ELEVATION_TICK_TARGET);
    const range = Math.max(1, yAxis.max - yAxis.min);

    const chartHtml = samples
      .map((sample) => {
        const clamped = Math.min(yAxis.max, Math.max(yAxis.min, sample.elevation));
        const height = Math.max(2, ((clamped - yAxis.min) / range) * 100);
        const midDistance = (sample.startDistanceKm + sample.endDistanceKm) / 2;
        const segment = this.getCutSegmentForDistance(midDistance);
        const baseColor = segment?.color ?? this.modeColors[this.currentMode];
        const topColor = adjustHexColor(baseColor, 0.25);
        const bottomColor = adjustHexColor(baseColor, -0.25);
        const accentColor = adjustHexColor(baseColor, 0.15);
        const titleParts = [];
        if (Number.isFinite(sample.elevation)) {
          titleParts.push(`${Math.round(sample.elevation)} m`);
        }
        if (segment?.name) {
          titleParts.push(segment.name);
        }
        const title = titleParts.join(' · ');
        const style = [
          `height:${height.toFixed(2)}%`,
          `--bar-color:${topColor}`,
          `--bar-color-dark:${bottomColor}`,
          `--bar-accent:${accentColor}`
        ].join(';');
        return `
          <div
            class="elevation-bar"
            data-start-km="${sample.startDistanceKm.toFixed(4)}"
            data-end-km="${sample.endDistanceKm.toFixed(4)}"
            data-mid-km="${((sample.startDistanceKm + sample.endDistanceKm) / 2).toFixed(4)}"
            data-segment-index="${segment ? segment.index : -1}"
            style="${style}"
            title="${title}"
          ></div>
        `;
      })
      .join('');

    const yAxisLabels = [...yAxis.ticks]
      .sort((a, b) => b - a)
      .map((value) => `<span>${this.formatElevationLabel(value)}</span>`)
      .join('');

    const distanceAxis = this.computeAxisTicks(0, totalDistance, DISTANCE_TICK_TARGET);
    const rawTicks = [...distanceAxis.ticks];
    if (totalDistance > 0) {
      const lastTick = rawTicks[rawTicks.length - 1];
      if (!rawTicks.length || Math.abs(lastTick - totalDistance) > distanceAxis.step * 0.25) {
        rawTicks.push(totalDistance);
      }
    }
    const tickSet = new Set();
    rawTicks.forEach((value) => {
      const normalized = Number(value.toFixed(3));
      if (Number.isFinite(normalized) && normalized >= 0) {
        tickSet.add(normalized);
      }
    });
    if (totalDistance > 0) {
      tickSet.add(Number(totalDistance.toFixed(3)));
    }
    tickSet.add(0);
    const tolerance = distanceAxis.step || 1;
    const upperBound = totalDistance > 0
      ? Number(totalDistance.toFixed(3))
      : Math.max(...tickSet);
    const xTicks = Array.from(tickSet)
      .filter((value) => value <= upperBound + tolerance * 0.25)
      .sort((a, b) => a - b);
    const xAxisLabels = xTicks
      .map((value) => `<span>${this.formatDistanceTick(value)}</span>`)
      .join('');

    const markerOverlay = (() => {
      if (!totalDistance) {
        return '';
      }
      const markers = this.computeSegmentMarkers();
      if (!Array.isArray(markers) || !markers.length) {
        return '';
      }
      const elements = markers
        .filter((marker) => marker?.type === 'bivouac')
        .map((marker) => {
          const distanceKm = this.getMarkerDistance(marker);
          if (!Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > totalDistance) {
            return null;
          }
          const elevation = this.getElevationAtDistance(distanceKm);
          let percentY = null;
          if (Number.isFinite(elevation)) {
            const clampedElevation = Math.min(yAxis.max, Math.max(yAxis.min, elevation));
            percentY = ((clampedElevation - yAxis.min) / range) * 100;
            percentY = Math.max(0, Math.min(100, percentY));
          }
          const title = marker?.name ?? marker?.title ?? 'Bivouac';
          const verticalStyle = Number.isFinite(percentY)
            ? `bottom:${percentY.toFixed(2)}%`
            : 'bottom:0';
          return `
            <div
              class="elevation-marker bivouac"
              data-distance-km="${distanceKm.toFixed(4)}"
              style="${verticalStyle}"
              title="${title}"
            >
              ${BIVOUAC_ELEVATION_ICON}
            </div>
          `;
        })
        .filter(Boolean)
        .join('');
      if (!elements) {
        return '';
      }
      return `<div class="elevation-marker-layer" aria-hidden="true">${elements}</div>`;
    })();

    this.elevationChart.innerHTML = `
      <div class="elevation-summary" role="presentation">
        <div class="summary-item ascent" title="Total ascent">
          ${SUMMARY_ICONS.ascent}
          <span>${ascent} m</span>
        </div>
        <div class="summary-item descent" title="Total descent">
          ${SUMMARY_ICONS.descent}
          <span>${descent} m</span>
        </div>
        <div class="summary-item distance" title="Total distance">
          <span>${distanceLabel} km</span>
        </div>
      </div>
      <div class="elevation-plot">
        <div class="elevation-y-axis">${yAxisLabels}</div>
        <div class="elevation-plot-area">
          <div class="elevation-chart-container" role="presentation">${chartHtml}${markerOverlay}</div>
          <div class="elevation-x-axis">${xAxisLabels}</div>
        </div>
      </div>
    `;

    this.elevationChartContainer = this.elevationChart.querySelector('.elevation-chart-container');
    this.highlightedElevationBar = null;
    this.attachElevationChartEvents();
    this.updateElevationMarkerPositions();
    if (this.elevationChartContainer && typeof ResizeObserver !== 'undefined') {
      this.elevationResizeObserver = new ResizeObserver(() => {
        this.updateElevationMarkerPositions();
      });
      this.elevationResizeObserver.observe(this.elevationChartContainer);
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => this.updateElevationMarkerPositions());
    }
  }

  updateElevationMarkerPositions() {
    if (!this.elevationChartContainer) {
      return;
    }
    const markers = Array.from(
      this.elevationChartContainer.querySelectorAll('.elevation-marker[data-distance-km]')
    );
    if (!markers.length) {
      return;
    }
    const bars = Array.from(this.elevationChartContainer.querySelectorAll('.elevation-bar'));
    if (!bars.length) {
      return;
    }
    const containerRect = this.elevationChartContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;
    if (!containerWidth) {
      return;
    }
    const containerLeft = containerRect.left;
    const barMetrics = bars
      .map((bar) => {
        const startKm = Number(bar.dataset.startKm);
        const endKm = Number(bar.dataset.endKm);
        if (!Number.isFinite(startKm) || !Number.isFinite(endKm)) {
          return null;
        }
        const rect = bar.getBoundingClientRect();
        return { startKm, endKm, rect };
      })
      .filter(Boolean);
    if (!barMetrics.length) {
      return;
    }
    const totalDistance = Number(this.routeProfile?.totalDistanceKm) || 0;
    const epsilon = Math.max(1e-5, totalDistance * 1e-4);
    markers.forEach((marker) => {
      const distanceKm = Number(marker.dataset.distanceKm);
      if (!Number.isFinite(distanceKm)) {
        return;
      }
      let target = null;
      for (const metric of barMetrics) {
        if (distanceKm >= metric.startKm - epsilon && distanceKm <= metric.endKm + epsilon) {
          target = metric;
          break;
        }
      }
      if (!target) {
        target = barMetrics[barMetrics.length - 1];
      }
      if (!target) {
        return;
      }
      const span = Math.max(target.endKm - target.startKm, 1e-6);
      const ratio = Math.max(0, Math.min(1, (distanceKm - target.startKm) / span));
      const x = target.rect.left + ratio * target.rect.width;
      const offset = x - containerLeft;
      const percent = Math.max(0, Math.min(100, (offset / containerWidth) * 100));
      marker.style.left = `${percent.toFixed(4)}%`;
    });
  }

  updateDistanceMarkers(route) {
    const source = this.map.getSource('distance-markers-source');
    if (!source) return;

    const targetRoute = route ?? this.routeGeojson;

    if (!targetRoute || !targetRoute.geometry?.coordinates || !turfApi) {
      source.setData(EMPTY_COLLECTION);
      return;
    }

    try {
      const coordinates = targetRoute.geometry.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        source.setData(EMPTY_COLLECTION);
        return;
      }

      const metrics = this.latestMetrics ?? this.calculateRouteMetrics(targetRoute);
      const totalDistance = Number(metrics.distanceKm) || 0;
      if (totalDistance <= 0) {
        source.setData(EMPTY_COLLECTION);
        return;
      }

      const line = turfApi.lineString(coordinates);
      const markerInterval = totalDistance > MAX_DISTANCE_MARKERS
        ? Math.ceil(totalDistance / MAX_DISTANCE_MARKERS)
        : 1;

      const formatMarkerLabel = (value) => {
        if (!Number.isFinite(value)) return '';
        if (value === 0) return '0';
        if (value >= 100) return `${Math.round(value)}`;
        if (value >= 10) return `${parseFloat(value.toFixed(1))}`;
        if (value >= 1) return `${parseFloat(value.toFixed(1))}`;
        const precise = parseFloat(value.toFixed(2));
        return Number.isFinite(precise) ? `${precise}` : '';
      };

      const features = [];

      const addMarker = (distanceKm, labelValue = distanceKm) => {
        const clamped = Math.min(distanceKm, totalDistance);
        const point = turfApi.along(line, clamped, { units: 'kilometers' });
        const label = formatMarkerLabel(labelValue);
        if (!label) return;
        const color = this.getColorForDistance(clamped);
        const imageId = ensureDistanceMarkerImage(this.map, label, { fill: color });
        if (!imageId) return;
        features.push({
          type: 'Feature',
          properties: { label, imageId, color },
          geometry: { type: 'Point', coordinates: point.geometry.coordinates }
        });
      };

      for (let km = markerInterval; km < totalDistance; km += markerInterval) {
        addMarker(km, km);
      }

      source.setData({ type: 'FeatureCollection', features });
    } catch (error) {
      console.error('Error updating distance markers', error);
      source.setData(EMPTY_COLLECTION);
    }
  }

  stopHikerAnimation({ preserveMarker = false } = {}) {
    if (typeof cancelAnimationFrame === 'function' && this.hikerAnimationFrame) {
      cancelAnimationFrame(this.hikerAnimationFrame);
    }
    this.hikerAnimationFrame = null;
    this.hikerAnimationStart = null;
    this.hikerAnimationDuration = 0;
    if (!preserveMarker) {
      this.hikerLastPosition = null;
      this.map.getSource(HIKER_MARKER_SOURCE_ID)?.setData(EMPTY_COLLECTION);
      if (this.map.getLayer(HIKER_MARKER_LAYER_ID)) {
        this.map.setPaintProperty(HIKER_MARKER_LAYER_ID, 'icon-opacity', 0);
      }
    }
  }

  updateHikerMarkerPosition(coord, distanceKm = 0) {
    if (!Array.isArray(coord) || coord.length < 2) {
      return;
    }
    const [lng, lat] = coord;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return;
    }
    const feature = {
      type: 'Feature',
      properties: { distanceKm },
      geometry: {
        type: 'Point',
        coordinates: [lng, lat]
      }
    };
    this.map.getSource(HIKER_MARKER_SOURCE_ID)?.setData({
      type: 'FeatureCollection',
      features: [feature]
    });
    if (this.map.getLayer(HIKER_MARKER_LAYER_ID)) {
      this.map.setPaintProperty(HIKER_MARKER_LAYER_ID, 'icon-opacity', 1);
    }
    this.hikerLastPosition = { coord: [lng, lat], distanceKm };
  }

  runHikerAnimation() {
    if (!this.isHikerPlaying) {
      return;
    }
    const profile = this.routeProfile;
    const coordinates = profile?.coordinates;
    const totalDistance = Number(profile?.totalDistanceKm) || 0;

    if (!Array.isArray(coordinates) || coordinates.length < 2 || totalDistance <= 0) {
      this.stopHikerAnimation();
      return;
    }

    const startCoord = this.getCoordinateAtDistance(0);
    if (startCoord) {
      this.updateHikerMarkerPosition(startCoord, 0);
    }

    if (typeof requestAnimationFrame !== 'function') {
      const endCoord = this.getCoordinateAtDistance(totalDistance);
      if (endCoord) {
        this.updateHikerMarkerPosition(endCoord, totalDistance);
      }
      return;
    }

    const minDuration = 12000;
    const maxDuration = 90000;
    const duration = Math.max(minDuration, Math.min(maxDuration, totalDistance * 5000));
    this.hikerAnimationDuration = duration;
    this.hikerAnimationStart = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

    const step = (timestamp) => {
      if (!this.isHikerPlaying) {
        this.stopHikerAnimation({ preserveMarker: true });
        return;
      }
      const startTime = this.hikerAnimationStart;
      const totalDuration = this.hikerAnimationDuration;
      if (!Number.isFinite(startTime) || !Number.isFinite(totalDuration) || totalDuration <= 0) {
        return;
      }
      const currentTime = Number.isFinite(timestamp)
        ? timestamp
        : (typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now());
      const elapsed = currentTime - startTime;
      const progress = Math.max(0, Math.min(1, elapsed / totalDuration));
      const distanceKm = totalDistance * progress;
      const coord = this.getCoordinateAtDistance(distanceKm);
      if (coord) {
        this.updateHikerMarkerPosition(coord, distanceKm);
      }
      if (progress < 1) {
        this.hikerAnimationFrame = requestAnimationFrame(step);
      } else {
        this.hikerAnimationFrame = null;
        this.isHikerPlaying = false;
        this.updatePlayButtonState();
      }
    };

    this.hikerAnimationFrame = requestAnimationFrame(step);
  }

  startHikerAnimation() {
    if (!this.isHikerPlaying) {
      this.stopHikerAnimation();
      this.updatePlayButtonState();
      return;
    }
    this.stopHikerAnimation();
    const setup = this.ensureHikerLayer();
    if (setup && typeof setup.then === 'function') {
      setup
        .then(() => {
          if (this.isHikerPlaying) {
            this.runHikerAnimation();
          }
        })
        .catch(() => {});
    } else {
      if (this.isHikerPlaying) {
        this.runHikerAnimation();
      }
    }
  }

  onRouteGeometryUpdated() {
    const hasRoute = Array.isArray(this.routeProfile?.coordinates)
      && this.routeProfile.coordinates.length >= 2;
    if (!hasRoute) {
      this.pauseHikerAnimation();
      return;
    }
    this.isHikerPlaying = false;
    this.stopHikerAnimation();
    this.updatePlayButtonState();
  }

  updatePlayButtonState() {
    if (!this.playButton) {
      return;
    }
    const hasRoute = Array.isArray(this.routeProfile?.coordinates)
      && this.routeProfile.coordinates.length >= 2;
    this.playButton.disabled = !hasRoute;
    this.playButton.setAttribute('aria-pressed', String(this.isHikerPlaying));
    const state = this.isHikerPlaying ? 'playing' : 'paused';
    this.playButton.dataset.state = state;
    const label = this.isHikerPlaying ? 'Pause route animation' : 'Play route animation';
    this.playButton.setAttribute('aria-label', label);
    this.playButton.setAttribute('title', label);
  }

  playHikerAnimation() {
    const hasRoute = Array.isArray(this.routeProfile?.coordinates)
      && this.routeProfile.coordinates.length >= 2;
    if (!hasRoute) {
      return;
    }
    this.isHikerPlaying = true;
    this.updatePlayButtonState();
    this.startHikerAnimation();
  }

  pauseHikerAnimation() {
    this.isHikerPlaying = false;
    this.stopHikerAnimation();
    this.updatePlayButtonState();
  }

  applyRoute(route) {
    this.hideRouteHover();
    const previousCuts = Array.isArray(this.routeCutDistances) ? [...this.routeCutDistances] : [];
    this.routeGeojson = route;
    const coordinates = route?.geometry?.coordinates ?? [];
    this.routeProfile = this.buildRouteProfile(coordinates);
    this.latestMetrics = this.calculateRouteMetrics(route);
    this.rebuildSegmentData();
    const snapped = this.snapWaypointsToRoute();
    if (snapped) {
      this.rebuildSegmentData();
    }
    const newTotalDistance = Number(this.routeProfile?.totalDistanceKm) || 0;
    let restoredCuts = [];
    if (previousCuts.length && newTotalDistance > ROUTE_CUT_EPSILON_KM) {
      restoredCuts = previousCuts
        .map((value) => (Number.isFinite(value) ? value : null))
        .filter((value) => Number.isFinite(value));
    }

    this.resetRouteCuts();
    if (restoredCuts.length && newTotalDistance > ROUTE_CUT_EPSILON_KM) {
      const clamped = restoredCuts
        .map((value) => Math.max(0, Math.min(newTotalDistance, value)))
        .filter((value) => value > ROUTE_CUT_EPSILON_KM && newTotalDistance - value > ROUTE_CUT_EPSILON_KM)
        .sort((a, b) => a - b);
      const uniqueCuts = [];
      clamped.forEach((value) => {
        if (!uniqueCuts.some((existing) => Math.abs(existing - value) <= ROUTE_CUT_EPSILON_KM / 2)) {
          uniqueCuts.push(value);
        }
      });
      this.routeCutDistances = uniqueCuts;
    }
    this.updateCutDisplays();
    this.updateDistanceMarkers(route);
    this.updateStats(route);
  }

  async getRoute() {
    if (this.waypoints.length < 2) {
      return;
    }

    const requestId = (this.pendingRouteRequestId += 1);
    const groups = this.buildModeGroups();

    if (!groups.length) {
      this.clearRoute();
      this.updateStats(null);
      this.updateElevationProfile([]);
      return;
    }

    const segments = [];

    for (const group of groups) {
      if (requestId !== this.pendingRouteRequestId) {
        return;
      }

      if (group.mode === this.manualModeId) {
        const manualCoords = group.waypoints
          .map((coord) => {
            const lng = Number(coord?.[0]);
            const lat = Number(coord?.[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
              return null;
            }
            const elevation = Number(coord?.[2]);
            return Number.isFinite(elevation) ? [lng, lat, elevation] : [lng, lat];
          })
          .filter(Boolean);
        if (manualCoords.length >= 2) {
          segments.push({ mode: group.mode, coordinates: manualCoords });
        }
        continue;
      }

      try {
        const route = await this.fetchRouteSegment(group);
        if (!route || !Array.isArray(route.geometry?.coordinates) || route.geometry.coordinates.length < 2) {
          throw new Error('Invalid route geometry');
        }
        segments.push({ mode: group.mode, coordinates: route.geometry.coordinates, properties: route.properties });
      } catch (error) {
        if (requestId !== this.pendingRouteRequestId) {
          return;
        }
        console.error('Failed to fetch route segment', error);
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert('Unable to fetch a directions segment. Please try again.');
        }
        return;
      }
    }

    if (requestId !== this.pendingRouteRequestId) {
      return;
    }

    const { coordinates, segmentModes } = this.combineSegmentCoordinates(segments);

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      this.clearRoute();
      this.updateStats(null);
      this.updateElevationProfile([]);
      return;
    }

    const routeFeature = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {}
    };

    this.segmentModeLookup = segmentModes;
    this.applyRoute(routeFeature);
    this.onRouteGeometryUpdated();
  }

  async fetchRouteSegment(group) {
    const coords = Array.isArray(group?.waypoints)
      ? group.waypoints
          .map((coord) => {
            const lng = Number(coord?.[0]);
            const lat = Number(coord?.[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
              return null;
            }
            return [lng, lat];
          })
          .filter(Boolean)
      : [];

    if (coords.length < 2) {
      throw new Error('Not enough coordinates for routing');
    }

    const response = await fetch(`https://api.openrouteservice.org/v2/directions/${group.mode}/geojson`, {
      method: 'POST',
      headers: {
        Accept: 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
        'Content-Type': 'application/json',
        Authorization: '5b3ce3597851110001cf62483828a115553d4a98817dd43f61935829'
      },
      body: JSON.stringify({
        coordinates: coords,
        radiuses: Array(coords.length).fill(-1),
        elevation: true,
        extra_info: ['waytype', 'steepness'],
        geometry_simplify: false,
        preference: group.mode === 'foot-hiking' ? 'recommended' : 'fastest',
        units: 'km',
        language: 'en'
      })
    });

    if (!response.ok) {
      let message = 'Unable to fetch directions';
      try {
        const errorData = await response.json();
        if (errorData?.error?.message) {
          message = errorData.error.message;
        }
      } catch (_) {
        // ignore
      }
      throw new Error(message);
    }

    const data = await response.json();
    const route = data?.features?.[0];
    if (!route) {
      throw new Error('No route returned from the directions service');
    }
    return route;
  }

  combineSegmentCoordinates(segments) {
    const coordinates = [];
    const segmentModes = [];

    segments.forEach((segment, segmentIndex) => {
      const coords = Array.isArray(segment?.coordinates) ? segment.coordinates : [];
      coords.forEach((coord, coordIndex) => {
        if (!Array.isArray(coord) || coord.length < 2) {
          return;
        }
        const lng = Number(coord[0]);
        const lat = Number(coord[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
          return;
        }
        const elevation = Number(coord[2]);
        const normalized = Number.isFinite(elevation) ? [lng, lat, elevation] : [lng, lat];
        const isFirstCoordinate = segmentIndex === 0 && coordIndex === 0;
        const shouldSkip = segmentIndex > 0 && coordIndex === 0;
        if (isFirstCoordinate) {
          coordinates.push(normalized);
        } else if (!shouldSkip) {
          coordinates.push(normalized);
        }
        if (coordIndex < coords.length - 1) {
          segmentModes.push(segment.mode);
        }
      });
    });

    return { coordinates, segmentModes };
  }

  buildManualRouteFeature() {
    if (!Array.isArray(this.waypoints) || this.waypoints.length < 2) {
      return null;
    }

    const coordinates = this.waypoints
      .map((coord) => (Array.isArray(coord) ? coord.slice(0, 3) : null))
      .filter((coord) => {
        if (!Array.isArray(coord) || coord.length < 2) {
          return false;
        }
        const [lng, lat] = coord;
        return Number.isFinite(lng) && Number.isFinite(lat);
      })
      .map((coord) => {
        const [lng, lat, ele] = coord;
        const cleaned = [lng, lat];
        if (Number.isFinite(ele)) {
          cleaned.push(ele);
        }
        return cleaned;
      });

    if (coordinates.length < 2) {
      return null;
    }

    let totalDistanceKm = 0;
    const segments = [];
    for (let index = 1; index < coordinates.length; index += 1) {
      const distanceKm = Number(this.computeDistanceKm(coordinates[index - 1], coordinates[index])) || 0;
      totalDistanceKm += Math.max(0, distanceKm);
      segments.push({
        distance: distanceKm * 1000,
        duration: null,
        ascent: 0,
        descent: 0
      });
    }

    return {
      type: 'Feature',
      properties: {
        mode: this.manualModeId,
        summary: { distance: totalDistanceKm * 1000 },
        segments
      },
      geometry: {
        type: 'LineString',
        coordinates
      }
    };
  }
}
