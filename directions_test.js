import { getOpenFreeMapIcon } from './scripts/openfreemap-sprites.js';
import { OVERPASS_ENDPOINT as OVERPASS_INTERPRETER_ENDPOINT } from './scripts/overpass-network.js';

const EMPTY_COLLECTION = {
  type: 'FeatureCollection',
  features: []
};

const MODE_COLORS = {
  'foot-hiking': '#f8b40b',
  manual: '#2d7bd6'
};

const HOVER_PIXEL_TOLERANCE = 12;
const COORD_EPSILON = 1e-6;
const WAYPOINT_MATCH_TOLERANCE_METERS = 30;
const MAX_ELEVATION_POINTS = 180;
const MAX_DISTANCE_MARKERS = 60;
const WAYPOINT_HISTORY_LIMIT = 20;
const ELEVATION_TICK_TARGET = 5;
const DISTANCE_TICK_TARGET = 6;
const ROUTE_CUT_EPSILON_KM = 0.02;
const ROUTE_CLICK_PIXEL_TOLERANCE = 18;
const ROUTE_GRADIENT_BLEND_DISTANCE_KM = 0.05;
const turfApi = typeof turf !== 'undefined' ? turf : null;

const POI_SEARCH_RADIUS_METERS = 100;
const POI_CATEGORY_DISTANCE_OVERRIDES = Object.freeze({
  peak: 100,
  volcano: 200,
  mountain_pass: 100,
  saddle: 100,
  alpine_hut: 100,
  wilderness_hut: 100,
  hut: 100,
  cabin: 100,
  shelter: 100
});
const POI_MAX_SEARCH_RADIUS_METERS = Math.max(
  POI_SEARCH_RADIUS_METERS,
  ...Object.values(POI_CATEGORY_DISTANCE_OVERRIDES)
);
const DEFAULT_POI_COLOR = '#2d7bd6';
const ELEVATION_PROFILE_POI_MARKER_OFFSET_PX = -12;
const ELEVATION_MARKER_LABEL_VERTICAL_GAP_PX = 4;
const ELEVATION_MARKER_LABEL_HORIZONTAL_PADDING_PX = 6;
const DEFAULT_POI_TITLE = 'Point d’intérêt';
const POI_NAME_PROPERTIES = Object.freeze(['name:fr', 'name', 'name:en', 'ref']);
const POI_ADDITIONAL_PROPERTY_TAGS = Object.freeze([
  'ele',
  'importance',
  'importance:level',
  'prominence',
  'prominence:meters',
  'prominence:metres',
  'rank',
  'peak'
]);
const POI_FALLBACK_MAX_BOUND_SPAN_DEGREES = 2.5;
const POI_FALLBACK_TIMEOUT_SECONDS = 60;
const POI_FALLBACK_ENDPOINT = OVERPASS_INTERPRETER_ENDPOINT;
const POI_ICON_DEFINITIONS = Object.freeze({
  peak: { icon: 'peak', label: 'Sommet', color: '#2d7bd6' },
  volcano: { icon: 'peak', label: 'Volcan', color: '#2d7bd6' },
  mountain_pass: { icon: 'mountain_pass', label: 'Col', color: '#4a6d8c' },
  saddle: { icon: 'mountain_pass', label: 'Col', color: '#4a6d8c' },
  viewpoint: { icon: 'viewpoint', label: 'Point de vue', color: '#35a3ad' },
  alpine_hut: { icon: 'alpine_hut', label: 'Refuge', color: '#c26d2d' },
  wilderness_hut: { icon: 'wilderness_hut', label: 'Cabane', color: '#c26d2d' },
  hut: { icon: 'wilderness_hut', label: 'Cabane', color: '#c26d2d' },
  cabin: { icon: 'wilderness_hut', label: 'Cabane', color: '#c26d2d' },
  shelter: { icon: 'shelter', label: 'Abri', color: '#c26d2d' },
  parking: { icon: 'parking', label: 'Parking', color: '#4b5563' },
  parking_underground: { icon: 'parking', label: 'Parking', color: '#4b5563' },
  'parking_multi-storey': { icon: 'parking', label: 'Parking', color: '#4b5563' },
  parking_multistorey: { icon: 'parking', label: 'Parking', color: '#4b5563' },
  parking_multi_storey: { icon: 'parking', label: 'Parking', color: '#4b5563' }
});

const ELEVATION_PROFILE_POI_CATEGORY_KEYS = Object.freeze([
  'peak',
  'volcano',
  'mountain_pass',
  'saddle',
  'viewpoint',
  'alpine_hut',
  'wilderness_hut',
  'hut',
  'cabin',
  'shelter',
  'parking',
  'parking_underground',
  'parking_multi-storey',
  'parking_multistorey',
  'parking_multi_storey'
]);
const ELEVATION_PROFILE_POI_CATEGORY_SET = new Set(ELEVATION_PROFILE_POI_CATEGORY_KEYS);

const ROUTE_POI_SOURCE_ID = 'route-pois';
const ROUTE_POI_LAYER_ID = 'route-pois';
const ROUTE_POI_LABEL_LAYER_ID = 'route-poi-labels';

const POI_CLUSTER_MIN_SPACING_KM = 0.05;
const POI_CLUSTER_MAX_SPACING_KM = 1.5;
const POI_CLUSTER_DISTANCE_SCALE = 120;

const ELEVATION_PROFILE_POI_CLUSTER_MIN_WINDOW_KM = 0.4;
const ELEVATION_PROFILE_POI_CLUSTER_MAX_WINDOW_KM = 2;
const ELEVATION_PROFILE_POI_CLUSTER_DISTANCE_SCALE = 30;

const PEAK_CATEGORY_KEYS = Object.freeze(['peak', 'volcano']);
const PEAK_CATEGORY_SET = new Set(PEAK_CATEGORY_KEYS);
const PASS_CATEGORY_KEYS = Object.freeze(['mountain_pass', 'saddle']);
const LABELLED_POI_CATEGORY_KEYS = Object.freeze([
  ...PEAK_CATEGORY_KEYS,
  ...PASS_CATEGORY_KEYS,
  'viewpoint',
  'alpine_hut',
  'wilderness_hut',
  'hut',
  'cabin',
  'shelter'
]);
const LABELLED_POI_CATEGORY_SET = new Set(LABELLED_POI_CATEGORY_KEYS);
const PEAK_LABEL_ELEVATION_THRESHOLD_METERS = 3500;
const PEAK_IMPORTANCE_VALUE_MAP = new Map([
  ['international', 5],
  ['continental', 5],
  ['national', 4],
  ['state', 4],
  ['provincial', 4],
  ['regional', 3],
  ['cantonal', 3],
  ['departmental', 3],
  ['local', 2],
  ['municipal', 2]
]);
const PEAK_ROLE_VALUE_MAP = new Map([
  ['major', 4],
  ['principal', 4],
  ['main', 4],
  ['primary', 4],
  ['summit', 3],
  ['mountain', 3],
  ['secondary', 2],
  ['minor', 1]
]);
const PEAK_PROMINENCE_THRESHOLDS = Object.freeze([
  { min: 1500, score: 5 },
  { min: 600, score: 4 },
  { min: 300, score: 3 },
  { min: 150, score: 2 }
]);
const PEAK_ELEVATION_THRESHOLDS = Object.freeze([
  { min: 4200, score: 5 },
  { min: 3600, score: 4 },
  { min: 3000, score: 3 },
  { min: 2400, score: 2 }
]);

const POI_ELEVATION_PROPERTY_KEYS = Object.freeze(['ele', 'elevation', 'height']);

function isElevationProfilePoiCategory(key) {
  if (typeof key !== 'string' || !key) {
    return false;
  }
  return ELEVATION_PROFILE_POI_CATEGORY_SET.has(key);
}

function normalizePoiValue(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

function parseNumericValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) {
      return null;
    }
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) {
      return null;
    }
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parsePoiElevation(properties = {}) {
  for (const key of POI_ELEVATION_PROPERTY_KEYS) {
    const raw = properties?.[key];
    if (raw === null || raw === undefined) {
      continue;
    }
    const numeric = parseNumericValue(raw);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function computePeakImportanceScore(properties = {}, fallbackElevation = null) {
  const importanceValue = normalizePoiValue(properties?.importance || properties?.['importance:level']);
  let score = importanceValue && PEAK_IMPORTANCE_VALUE_MAP.has(importanceValue)
    ? PEAK_IMPORTANCE_VALUE_MAP.get(importanceValue)
    : 0;

  const rankValue = parseNumericValue(properties?.rank);
  if (Number.isFinite(rankValue)) {
    const clampedRank = Math.max(0, Math.min(rankValue, 9));
    const rankScore = Math.max(0, 6 - Math.min(clampedRank, 6));
    score = Math.max(score, rankScore);
  }

  const peakRoleValue = normalizePoiValue(properties?.peak);
  if (peakRoleValue && PEAK_ROLE_VALUE_MAP.has(peakRoleValue)) {
    score = Math.max(score, PEAK_ROLE_VALUE_MAP.get(peakRoleValue));
  }

  const prominenceCandidates = [
    properties?.prominence,
    properties?.['prominence:meters'],
    properties?.['prominence:metres']
  ];
  let prominenceValue = null;
  for (const candidate of prominenceCandidates) {
    const numeric = parseNumericValue(candidate);
    if (Number.isFinite(numeric)) {
      prominenceValue = numeric;
      break;
    }
  }
  if (Number.isFinite(prominenceValue)) {
    for (const threshold of PEAK_PROMINENCE_THRESHOLDS) {
      if (prominenceValue >= threshold.min) {
        score = Math.max(score, threshold.score);
        break;
      }
    }
  }

  let elevationValue = parsePoiElevation(properties);
  if (!Number.isFinite(elevationValue) && Number.isFinite(fallbackElevation)) {
    elevationValue = fallbackElevation;
  }
  if (Number.isFinite(elevationValue)) {
    for (const threshold of PEAK_ELEVATION_THRESHOLDS) {
      if (elevationValue >= threshold.min) {
        score = Math.max(score, threshold.score);
        break;
      }
    }
  }

  return {
    score,
    importance: importanceValue,
    rank: Number.isFinite(rankValue) ? rankValue : null,
    peakRole: peakRoleValue,
    prominence: Number.isFinite(prominenceValue) ? prominenceValue : null,
    elevation: Number.isFinite(elevationValue) ? elevationValue : null
  };
}

function computePoiClusterSpacing(totalDistanceKm) {
  const normalizedDistance = Number(totalDistanceKm);
  if (!Number.isFinite(normalizedDistance) || normalizedDistance <= 0) {
    return POI_CLUSTER_MIN_SPACING_KM;
  }
  const scaled = normalizedDistance / POI_CLUSTER_DISTANCE_SCALE;
  const clamped = Math.max(POI_CLUSTER_MIN_SPACING_KM, Math.min(POI_CLUSTER_MAX_SPACING_KM, scaled));
  return clamped;
}

function selectClusterRepresentative(items, categoryKey) {
  if (!Array.isArray(items) || !items.length) {
    return null;
  }
  if (PEAK_CATEGORY_SET.has(categoryKey)) {
    let chosen = null;
    let bestScore = -Infinity;
    let bestElevation = -Infinity;
    items.forEach((item) => {
      if (!item) {
        return;
      }
      const importanceScore = Number(item.peakImportanceScore);
      const score = Number.isFinite(importanceScore) ? importanceScore : 0;
      const elevation = Number(item.elevation);
      const normalizedElevation = Number.isFinite(elevation) ? elevation : -Infinity;
      if (score > bestScore) {
        bestScore = score;
        bestElevation = normalizedElevation;
        chosen = item;
        return;
      }
      if (score === bestScore) {
        if (normalizedElevation > bestElevation) {
          bestElevation = normalizedElevation;
          chosen = item;
          return;
        }
        if (normalizedElevation === bestElevation) {
          const chosenHasName = typeof chosen?.name === 'string' && chosen.name;
          const itemHasName = typeof item.name === 'string' && item.name;
          if (!chosenHasName && itemHasName) {
            chosen = item;
          }
        }
        return;
      }
    });
    return chosen ?? items[0];
  }
  const named = items.find((item) => typeof item?.name === 'string' && item.name.trim());
  return named ?? items[0];
}

function clusterRoutePointsOfInterest(pois, totalDistanceKm) {
  if (!Array.isArray(pois) || !pois.length) {
    return [];
  }
  const spacingKm = computePoiClusterSpacing(totalDistanceKm);
  const grouped = new Map();
  pois.forEach((poi) => {
    if (!poi || !Number.isFinite(poi.distanceKm)) {
      return;
    }
    const key = poi.categoryKey ?? 'default';
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(poi);
  });

  const results = [];
  grouped.forEach((list, categoryKey) => {
    const sorted = list
      .filter((poi) => poi && Number.isFinite(poi.distanceKm))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    if (!sorted.length) {
      return;
    }
    let cluster = [];
    let clusterBase = null;
    sorted.forEach((poi) => {
      const distance = Number(poi.distanceKm);
      if (!Number.isFinite(distance)) {
        return;
      }
      if (!cluster.length) {
        cluster = [poi];
        clusterBase = distance;
        return;
      }
      if (Math.abs(distance - clusterBase) <= spacingKm) {
        cluster.push(poi);
      } else {
        const representative = selectClusterRepresentative(cluster, categoryKey);
        if (representative) {
          results.push(representative);
        }
        cluster = [poi];
        clusterBase = distance;
      }
    });
    if (cluster.length) {
      const representative = selectClusterRepresentative(cluster, categoryKey);
      if (representative) {
        results.push(representative);
      }
    }
  });

  results.sort((a, b) => a.distanceKm - b.distanceKm);
  return results;
}

function computeElevationProfilePoiClusterWindow(totalDistanceKm) {
  const distance = Number(totalDistanceKm);
  if (!Number.isFinite(distance) || distance <= 0) {
    return ELEVATION_PROFILE_POI_CLUSTER_MIN_WINDOW_KM;
  }
  const scaled = distance / ELEVATION_PROFILE_POI_CLUSTER_DISTANCE_SCALE;
  const clamped = Math.min(
    ELEVATION_PROFILE_POI_CLUSTER_MAX_WINDOW_KM,
    Math.max(ELEVATION_PROFILE_POI_CLUSTER_MIN_WINDOW_KM, scaled)
  );
  return clamped;
}

function selectElevationProfileLabelLeader(items) {
  if (!Array.isArray(items) || !items.length) {
    return null;
  }
  let chosen = null;
  let bestScore = -Infinity;
  let bestElevation = -Infinity;
  items.forEach((item) => {
    if (!item) {
      return;
    }
    const peakImportanceScore = Number(item.peakImportanceScore);
    const elevation = Number(item.elevation);
    const hasElevation = Number.isFinite(elevation);
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const weightedScore = (Number.isFinite(peakImportanceScore) ? peakImportanceScore : 0) * 10
      + (hasElevation ? elevation / 1000 : 0)
      + (name ? 0.01 : 0);
    if (weightedScore > bestScore) {
      bestScore = weightedScore;
      bestElevation = hasElevation ? elevation : -Infinity;
      chosen = item;
      return;
    }
    if (weightedScore === bestScore) {
      if (hasElevation && (!Number.isFinite(bestElevation) || elevation > bestElevation)) {
        bestElevation = elevation;
        chosen = item;
        return;
      }
      if (hasElevation && elevation === bestElevation) {
        const chosenHasName = typeof chosen?.name === 'string' && chosen.name.trim();
        if (!chosenHasName && name) {
          chosen = item;
        }
      }
    }
  });
  return chosen ?? items[0] ?? null;
}

function markElevationProfileLabelLeaders(pois, totalDistanceKm) {
  if (!Array.isArray(pois) || !pois.length) {
    return Array.isArray(pois) ? pois : [];
  }
  const windowKm = Math.max(
    Number.EPSILON,
    computeElevationProfilePoiClusterWindow(totalDistanceKm)
  );
  const sorted = pois
    .filter((poi) => poi && Number.isFinite(poi.distanceKm))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  pois.forEach((poi) => {
    if (poi) {
      poi.showElevationProfileLabel = false;
    }
  });

  const eligible = sorted.filter((poi) => poi && poi.showLabel);
  if (!eligible.length) {
    return pois;
  }

  let cluster = [];
  let clusterBase = null;
  eligible.forEach((poi) => {
    const distance = Number(poi.distanceKm);
    if (!cluster.length) {
      cluster = [poi];
      clusterBase = distance;
      return;
    }
    if (Math.abs(distance - clusterBase) <= windowKm) {
      cluster.push(poi);
      return;
    }
    const leader = selectElevationProfileLabelLeader(cluster);
    if (leader) {
      leader.showElevationProfileLabel = true;
    }
    cluster = [poi];
    clusterBase = distance;
  });

  if (cluster.length) {
    const leader = selectElevationProfileLabelLeader(cluster);
    if (leader) {
      leader.showElevationProfileLabel = true;
    }
  }

  return pois;
}

function shouldShowPoiLabel(poi) {
  if (!poi) {
    return false;
  }
  const categoryKey = typeof poi.categoryKey === 'string' ? poi.categoryKey : '';
  if (!LABELLED_POI_CATEGORY_SET.has(categoryKey)) {
    return false;
  }
  const name = typeof poi.name === 'string' ? poi.name.trim() : '';
  if (!name) {
    return false;
  }
  if (PEAK_CATEGORY_SET.has(categoryKey)) {
    const score = Number(poi.peakImportanceScore);
    if (Number.isFinite(score) && score > 0) {
      return true;
    }
    const elevation = Number(poi.elevation);
    if (Number.isFinite(elevation) && elevation >= PEAK_LABEL_ELEVATION_THRESHOLD_METERS) {
      return true;
    }
    return false;
  }
  return true;
}

function resolvePoiName(properties = {}) {
  for (const key of POI_NAME_PROPERTIES) {
    const raw = properties[key];
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return '';
}

function resolvePoiDefinition(properties = {}) {
  const candidates = [];
  const subclass = normalizePoiValue(properties.subclass);
  const className = normalizePoiValue(properties.class);
  const amenity = normalizePoiValue(properties.amenity);
  const tourism = normalizePoiValue(properties.tourism);
  const manMade = normalizePoiValue(properties.man_made);
  [subclass, className, amenity, tourism, manMade]
    .filter((value, index, array) => value && array.indexOf(value) === index)
    .forEach((value) => {
      candidates.push(value);
    });
  for (const candidate of candidates) {
    if (candidate && POI_ICON_DEFINITIONS[candidate] && isElevationProfilePoiCategory(candidate)) {
      return { key: candidate, definition: POI_ICON_DEFINITIONS[candidate] };
    }
  }
  return null;
}

function buildPoiIdentifier(categoryKey, coordinates, rawId) {
  if (typeof rawId === 'string' && rawId.trim()) {
    return `${categoryKey}:${rawId.trim()}`;
  }
  if (Number.isFinite(rawId)) {
    return `${categoryKey}:${rawId}`;
  }
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      const precision = 1e6;
      const lngKey = Math.round(lng * precision) / precision;
      const latKey = Math.round(lat * precision) / precision;
      return `${categoryKey}:${lngKey},${latKey}`;
    }
  }
  const randomId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${categoryKey}:${randomId}`;
}

const EARTH_RADIUS_METERS = 6371000;
const toRadians = (value) => (value * Math.PI) / 180;
const toDegrees = (value) => (value * 180) / Math.PI;

const normalizeOverpassValue = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
};

function normalizeLongitude(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return Math.min(180, Math.max(-180, normalized));
}

function normalizeLatitude(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.min(90, Math.max(-90, value));
}

function clampBounds(bounds) {
  if (!bounds) {
    return null;
  }
  const { west, south, east, north } = bounds;
  const normalizedWest = normalizeLongitude(west);
  const normalizedEast = normalizeLongitude(east);
  const normalizedSouth = normalizeLatitude(south);
  const normalizedNorth = normalizeLatitude(north);
  if (normalizedWest == null || normalizedEast == null
    || normalizedSouth == null || normalizedNorth == null) {
    return null;
  }
  return {
    west: normalizedWest,
    east: normalizedEast,
    south: normalizedSouth,
    north: normalizedNorth
  };
}

function getBufferedRouteBounds(line, bufferMeters = POI_SEARCH_RADIUS_METERS) {
  if (!turfApi || typeof turfApi.buffer !== 'function' || typeof turfApi.bbox !== 'function') {
    return null;
  }
  try {
    const padded = turfApi.buffer(line, bufferMeters, { units: 'meters' });
    const bbox = turfApi.bbox(padded);
    if (!Array.isArray(bbox) || bbox.length !== 4) {
      return null;
    }
    const [west, south, east, north] = bbox.map((value) => Number.isFinite(value) ? value : null);
    if ([west, south, east, north].some((value) => value == null)) {
      return null;
    }
    if (east < west) {
      return null;
    }
    return clampBounds({ west, south, east, north });
  } catch (error) {
    console.warn('Failed to compute buffered bounds for POI fallback query', error);
    return null;
  }
}

function buildOverpassPoiQuery(bounds, { timeoutSeconds = POI_FALLBACK_TIMEOUT_SECONDS } = {}) {
  const { west, south, east, north } = bounds ?? {};
  if (!Number.isFinite(west) || !Number.isFinite(south)
    || !Number.isFinite(east) || !Number.isFinite(north)) {
    return null;
  }
  const timeout = Math.min(180, Math.max(10, Math.round(timeoutSeconds)));
  const bbox = `${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)}`;
  const filters = [
    'node["natural"="peak"]',
    'way["natural"="peak"]',
    'relation["natural"="peak"]',
    'node["natural"="volcano"]',
    'way["natural"="volcano"]',
    'relation["natural"="volcano"]',
    'node["natural"="saddle"]',
    'way["natural"="saddle"]',
    'relation["natural"="saddle"]',
    'node["natural"="mountain_pass"]',
    'way["natural"="mountain_pass"]',
    'relation["natural"="mountain_pass"]',
    'node["mountain_pass"="yes"]',
    'way["mountain_pass"="yes"]',
    'relation["mountain_pass"="yes"]',
    'node["tourism"="viewpoint"]',
    'way["tourism"="viewpoint"]',
    'relation["tourism"="viewpoint"]',
    'node["amenity"="parking"]',
    'way["amenity"="parking"]',
    'relation["amenity"="parking"]'
  ];
  const query = `
[out:json][timeout:${timeout}];
(
  ${filters.map((filter) => `${filter}(${bbox});`).join('\n  ')}
);
out center tags;
  `.trim();
  return query;
}

function classifyOverpassPoi(tags = {}) {
  const amenity = normalizeOverpassValue(tags.amenity);
  const tourism = normalizeOverpassValue(tags.tourism);
  const natural = normalizeOverpassValue(tags.natural);
  const mountainPass = normalizeOverpassValue(tags.mountain_pass);
  const parkingType = normalizeOverpassValue(tags.parking);

  const buildResult = (key, extras = {}) => {
    if (!isElevationProfilePoiCategory(key)) {
      return null;
    }
    return { key, ...extras };
  };

  if (natural === 'peak') {
    return buildResult('peak');
  }
  if (natural === 'volcano') {
    return buildResult('volcano');
  }
  if (natural === 'saddle') {
    return buildResult('saddle');
  }
  if (natural === 'mountain_pass' || mountainPass === 'yes' || mountainPass === 'true') {
    return buildResult('mountain_pass');
  }
  if (tourism === 'viewpoint') {
    return buildResult('viewpoint');
  }
  if (amenity === 'parking') {
    if (parkingType === 'underground') {
      return buildResult('parking_underground', { class: 'parking' });
    }
    if (['multi-storey', 'multistorey', 'multi_storey', 'multi level', 'multi-level'].includes(parkingType)) {
      return buildResult('parking_multi-storey', { class: 'parking' });
    }
    return buildResult('parking', { class: 'parking' });
  }
  return null;
}

function convertOverpassElementToFeature(element) {
  if (!element || typeof element !== 'object') {
    return null;
  }
  const tags = element.tags || {};
  const classification = classifyOverpassPoi(tags);
  if (!classification) {
    return null;
  }
  const lngCandidates = [element.lon, element.lng, element?.center?.lon, element?.center?.lng];
  const latCandidates = [element.lat, element.latitude, element?.center?.lat, element?.center?.latitude];
  let lng = null;
  let lat = null;
  for (const candidate of lngCandidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      lng = numeric;
      break;
    }
  }
  for (const candidate of latCandidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      lat = numeric;
      break;
    }
  }
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  const properties = {};
  const subclass = classification.key;
  const className = classification.class ?? classification.key;
  properties.class = className;
  properties.subclass = subclass;
  if (element.id != null) {
    properties.id = `${element.type || 'node'}/${element.id}`;
    properties.osm_id = element.id;
  }
  POI_NAME_PROPERTIES.forEach((propertyKey) => {
    const tagValue = tags[propertyKey];
    if (typeof tagValue === 'string' && tagValue.trim()) {
      properties[propertyKey] = tagValue.trim();
    }
  });
  POI_ADDITIONAL_PROPERTY_TAGS.forEach((propertyKey) => {
    if (!Object.prototype.hasOwnProperty.call(tags, propertyKey)) {
      return;
    }
    const raw = tags[propertyKey];
    if (raw === null || raw === undefined) {
      return;
    }
    if (typeof raw === 'number') {
      if (Number.isFinite(raw)) {
        properties[propertyKey] = raw;
      }
      return;
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed) {
        properties[propertyKey] = trimmed;
      }
    }
  });
  if (typeof tags.name === 'string' && tags.name.trim()) {
    properties.name = tags.name.trim();
  }
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [lng, lat]
    },
    properties
  };
}

async function fetchOverpassRoutePois(line, {
  bufferMeters = POI_MAX_SEARCH_RADIUS_METERS,
  endpoint = POI_FALLBACK_ENDPOINT,
  signal
} = {}) {
  const bounds = getBufferedRouteBounds(line, bufferMeters);
  if (!bounds) {
    return [];
  }
  const { west, east, south, north } = bounds;
  const lngSpan = Math.abs(east - west);
  const latSpan = Math.abs(north - south);
  if (lngSpan > POI_FALLBACK_MAX_BOUND_SPAN_DEGREES || latSpan > POI_FALLBACK_MAX_BOUND_SPAN_DEGREES) {
    return [];
  }
  const query = buildOverpassPoiQuery(bounds);
  if (!query) {
    return [];
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8'
      },
      body: query,
      signal
    });
    if (!response.ok) {
      throw new Error(`Overpass POI request failed with status ${response.status}`);
    }
    const payload = await response.json();
    const elements = Array.isArray(payload?.elements) ? payload.elements : [];
    return elements
      .map((element) => {
        try {
          return convertOverpassElementToFeature(element);
        } catch (error) {
          console.warn('Failed to convert Overpass POI element', error);
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (signal && signal.aborted) {
      return [];
    }
    throw error;
  }
}

const haversineDistanceMeters = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) {
    return null;
  }
  const lat1 = Number(a[1]);
  const lat2 = Number(b[1]);
  const lon1 = Number(a[0]);
  const lon2 = Number(b[0]);
  if (!Number.isFinite(lat1) || !Number.isFinite(lat2) || !Number.isFinite(lon1) || !Number.isFinite(lon2)) {
    return null;
  }
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const aTerm = sinLat * sinLat + Math.cos(radLat1) * Math.cos(radLat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(aTerm), Math.sqrt(Math.max(0, 1 - aTerm)));
  return EARTH_RADIUS_METERS * c;
};

const bearingBetween = (start, end) => {
  if (!Array.isArray(start) || !Array.isArray(end) || start.length < 2 || end.length < 2) {
    return null;
  }
  const lat1 = toRadians(Number(start[1]));
  const lat2 = toRadians(Number(end[1]));
  const lon1 = toRadians(Number(start[0]));
  const lon2 = toRadians(Number(end[0]));
  if (!Number.isFinite(lat1) || !Number.isFinite(lat2) || !Number.isFinite(lon1) || !Number.isFinite(lon2)) {
    return null;
  }
  const dLon = lon2 - lon1;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  if (x === 0 && y === 0) {
    return 0;
  }
  let bearing = toDegrees(Math.atan2(y, x));
  if (!Number.isFinite(bearing)) {
    return null;
  }
  bearing = (bearing + 360) % 360;
  return bearing;
};

const SEGMENT_COLOR_PALETTE = [
  '#3ab7c6',
  '#9c27b0',
  '#4caf50',
  '#f1635f',
  '#8e44ad',
  '#16a085',
  '#ff6f61'
];

const ASCENT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 18a1 1 0 0 1-.7-1.7l6.3-6.3a1 1 0 0 1 1.4 0l3.3 3.3 4.9-6.7H17a1 1 0 0 1 0-2h5a1 1 0 0 1 1 1v5a1 1 0 0 1-2 0V7.41l-5.6 7.6a1 1 0 0 1-1.5.12l-3.3-3.3-5.6 5.6a1 1 0 0 1-.7.27Z"/></svg>';
const DESCENT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 6a1 1 0 0 1 .7 1.7l-6.3 6.3a1 1 0 0 1-1.4 0l-3.3-3.3-4.9 6.7H7a1 1 0 0 1 0 2H2a1 1 0 0 1-1-1v-5a1 1 0 0 1 2 0v3.59l5.6-7.6a1 1 0 0 1 1.5-.12l3.3 3.3 5.6-5.6a1 1 0 0 1 .7-.27Z"/></svg>';
const DISTANCE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><circle cx="6" cy="6" r="2.4"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="18" r="2.4"/><path d="M8.95 7.05 10.36 5.64 18.36 13.64 16.95 15.05 8.95 7.05Z"/></svg>';

const SUMMARY_ICONS = {
  ascent: ASCENT_ICON,
  descent: DESCENT_ICON,
  distance: DISTANCE_ICON
};

// Use the shared bivouac marker PNG so the UI references the canonical asset.
const BIVOUAC_ICON_URL = new URL('./data/bivouac.png', import.meta.url).href;
const BIVOUAC_ELEVATION_ICON = `<img class="elevation-marker__icon" src="${BIVOUAC_ICON_URL}" alt="" aria-hidden="true" loading="lazy" decoding="async" />`;

const DISTANCE_MARKER_PREFIX = 'distance-marker-';
const DEFAULT_DISTANCE_MARKER_COLOR = '#f38b1c';

const SEGMENT_MARKER_SOURCE_ID = 'segment-markers';
const SEGMENT_MARKER_LAYER_ID = 'segment-markers';
const SEGMENT_MARKER_COLORS = {
  start: '#2f8f3b',
  bivouac: '#2d7bd6',
  end: '#d64545'
};
const START_MARKER_ICON_ID = 'segment-marker-start';
const BIVOUAC_MARKER_ICON_ID = 'segment-marker-bivouac';
const END_MARKER_ICON_ID = 'segment-marker-end';
const SEGMENT_MARKER_ICONS = {
  start: START_MARKER_ICON_ID,
  bivouac: BIVOUAC_MARKER_ICON_ID,
  end: END_MARKER_ICON_ID
};

const CONNECTOR_METADATA_SOURCES = new Set(['connector', 'connector-start', 'connector-end']);

const isConnectorMetadataSource = (source) => typeof source === 'string' && CONNECTOR_METADATA_SOURCES.has(source);

const SAC_SCALE_RANK = Object.freeze({
  hiking: 1,
  mountain_hiking: 2,
  demanding_mountain_hiking: 3,
  alpine_hiking: 4,
  demanding_alpine_hiking: 5,
  difficult_alpine_hiking: 6
});

const TRAIL_VISIBILITY_RANK = Object.freeze({
  excellent: 1,
  good: 2,
  intermediate: 3,
  bad: 4,
  horrible: 5,
  no: 6
});

const SURFACE_SEVERITY_RANK = Object.freeze({
  paved: 1,
  asphalt: 1,
  concrete: 1,
  'concrete:lanes': 1,
  paving_stones: 1,
  sett: 1,
  cobblestone: 1,
  compacted: 2,
  fine_gravel: 2,
  gravel_turf: 2,
  dirt: 3,
  earth: 3,
  ground: 3,
  gravel: 3,
  grass: 3,
  mud: 3,
  sand: 3,
  scree: 4,
  rock: 4,
  stone: 4,
  pebblestone: 4,
  shingle: 4,
  bare_rock: 4,
  glacier: 5,
  snow: 5,
  ice: 5
});

const TRAIL_VISIBILITY_VALUES = new Set(Object.keys(TRAIL_VISIBILITY_RANK));

function normalizeTagString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeSacScale(value) {
  const normalized = normalizeTagString(value);
  if (!normalized) {
    return null;
  }
  const lower = normalized.toLowerCase().replace(/\s+/g, '_');
  if (SAC_SCALE_RANK[lower]) {
    return lower;
  }
  const sanitized = lower.replace(/\+/g, '');
  if (SAC_SCALE_RANK[sanitized]) {
    return sanitized;
  }
  const alias = {
    t1: 'hiking',
    t2: 'mountain_hiking',
    t3: 'demanding_mountain_hiking',
    t4: 'alpine_hiking',
    t5: 'demanding_alpine_hiking',
    t6: 'difficult_alpine_hiking'
  };
  return alias[sanitized] || alias[lower] || null;
}

function resolveSacScale(...values) {
  for (const value of values) {
    const normalized = normalizeSacScale(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function normalizeTrailVisibility(value) {
  const normalized = normalizeTagString(value);
  if (!normalized) {
    return null;
  }
  const lower = normalized.toLowerCase().replace(/\s+/g, '_');
  return TRAIL_VISIBILITY_VALUES.has(lower) ? lower : null;
}

function normalizeSurfaceType(value) {
  const normalized = normalizeTagString(value);
  if (!normalized) {
    return null;
  }
  return normalized.toLowerCase().replace(/\s+/g, '_');
}

function normalizeCoordinatePair(coord) {
  if (!Array.isArray(coord) || coord.length < 2) {
    return null;
  }
  const lng = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }
  return [lng, lat];
}

function formatTagLabel(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  return value
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatSacScaleLabel(value) {
  const normalized = normalizeSacScale(value);
  if (!normalized) {
    return null;
  }
  const label = SAC_SCALE_LABELS[normalized];
  if (label) {
    return label;
  }
  return formatTagLabel(normalized);
}

function formatSurfaceLabel(value) {
  const normalized = normalizeSurfaceType(value);
  if (!normalized) {
    return null;
  }
  const label = SURFACE_LABELS[normalized];
  if (label) {
    return label;
  }
  return formatTagLabel(normalized);
}

function formatTrailVisibilityLabel(value) {
  const normalized = normalizeTrailVisibility(value);
  if (!normalized) {
    return null;
  }
  return formatTagLabel(normalized);
}

const SLOPE_CLASSIFICATIONS = Object.freeze([
  { key: 'slope-very-steep-descent', label: 'Very steep descent (<-18%)', color: '#0b3d91', maxGrade: -18, maxInclusive: false },
  { key: 'slope-steep-descent', label: 'Steep descent (-18% to -12%)', color: '#1f5fa5', minGrade: -18, minInclusive: true, maxGrade: -12, maxInclusive: false },
  { key: 'slope-moderate-descent', label: 'Moderate descent (-12% to -6%)', color: '#4aa3f0', minGrade: -12, minInclusive: true, maxGrade: -6, maxInclusive: false },
  { key: 'slope-rolling', label: 'Rolling (-6% to 6%)', color: '#27ae60', minGrade: -6, minInclusive: true, maxGrade: 6, maxInclusive: true },
  { key: 'slope-moderate-climb', label: 'Moderate climb (6% to 12%)', color: '#f4d03f', minGrade: 6, minInclusive: true, maxGrade: 12, maxInclusive: false },
  { key: 'slope-hard-climb', label: 'Climb (12% to 18%)', color: '#f39c12', minGrade: 12, minInclusive: true, maxGrade: 18, maxInclusive: false },
  { key: 'slope-steep-climb', label: 'Steep climb (>18%)', color: '#c0392b', minGrade: 18, minInclusive: true }
]);

const SURFACE_CLASSIFICATIONS = Object.freeze([
  {
    key: 'surface-paved',
    label: 'Paved road',
    color: '#b8b0a0',
    maxMultiplier: 0.95,
    maxInclusive: true,
    surfaceValues: Object.freeze(['paved', 'asphalt', 'concrete', 'concrete:lanes', 'paving_stones', 'sett', 'cobblestone'])
  },
  {
    key: 'surface-compact',
    label: 'Compact surface',
    color: '#2ecc71',
    minMultiplier: 0.95,
    minInclusive: false,
    maxMultiplier: 1.05,
    maxInclusive: true,
    surfaceValues: Object.freeze(['compacted', 'fine_gravel', 'gravel_turf'])
  },
  {
    key: 'surface-dirt',
    label: 'Dirt / gravel',
    color: '#cfa97a',
    minMultiplier: 1.05,
    minInclusive: false,
    maxMultiplier: 1.15,
    maxInclusive: true,
    surfaceValues: Object.freeze(['dirt', 'earth', 'ground', 'gravel', 'grass', 'mud', 'sand'])
  },
  {
    key: 'surface-rocky',
    label: 'Rocky trail',
    color: '#8f9299',
    minMultiplier: 1.15,
    minInclusive: false,
    maxMultiplier: 1.3,
    maxInclusive: true,
    surfaceValues: Object.freeze(['scree', 'rock', 'stone', 'pebblestone', 'shingle', 'bare_rock'])
  },
  {
    key: 'surface-alpine',
    label: 'Glacier / alpine',
    color: '#f0f4f7',
    minMultiplier: 1.3,
    minInclusive: false,
    surfaceValues: Object.freeze(['glacier', 'snow', 'ice'])
  }
]);

const SURFACE_LABELS = Object.freeze(
  SURFACE_CLASSIFICATIONS.reduce((accumulator, entry) => {
    if (!entry || !entry.label) {
      return accumulator;
    }
    const values = Array.isArray(entry.surfaceValues) ? entry.surfaceValues : [];
    values.forEach((value) => {
      if (typeof value === 'string' && value) {
        accumulator[value] = entry.label;
      }
    });
    return accumulator;
  }, {})
);

const UNKNOWN_CATEGORY_CLASSIFICATION = Object.freeze({
  key: 'category-unknown',
  label: 'No info',
  color: '#d0d4db'
});

const CATEGORY_CLASSIFICATIONS = Object.freeze([
  UNKNOWN_CATEGORY_CLASSIFICATION,
  {
    key: 'category-t1',
    label: 'Easy Hike',
    color: '#a8f0c5',
    maxMultiplier: 1,
    maxGrade: 8,
    sacScaleValues: Object.freeze(['hiking'])
  },
  {
    key: 'category-t2',
    label: 'Mountain Trail',
    color: '#27ae60',
    maxMultiplier: 1.1,
    maxGrade: 12,
    sacScaleValues: Object.freeze(['mountain_hiking'])
  },
  {
    key: 'category-t3',
    label: 'Alpine Hike',
    color: '#f7d774',
    maxMultiplier: 1.2,
    maxGrade: 18,
    sacScaleValues: Object.freeze(['demanding_mountain_hiking'])
  },
  {
    key: 'category-t4',
    label: 'Alpine Route',
    color: '#e67e22',
    maxMultiplier: 1.35,
    sacScaleValues: Object.freeze(['alpine_hiking'])
  },
  {
    key: 'category-t5',
    label: 'Technical Alpine',
    color: '#4a0404',
    sacScaleValues: Object.freeze(['demanding_alpine_hiking', 'difficult_alpine_hiking'])
  }
]);

const SAC_SCALE_LABELS = Object.freeze(
  CATEGORY_CLASSIFICATIONS.reduce((accumulator, entry) => {
    if (!entry || !entry.label) {
      return accumulator;
    }
    const values = Array.isArray(entry.sacScaleValues) ? entry.sacScaleValues : [];
    values.forEach((value) => {
      if (typeof value === 'string' && value) {
        accumulator[value] = entry.label;
      }
    });
    return accumulator;
  }, {})
);

const PROFILE_MODE_DEFINITIONS = Object.freeze({
  none: { key: 'none', label: 'None' },
  slope: { key: 'slope', label: 'Slope' },
  surface: { key: 'surface', label: 'Surface' },
  category: { key: 'category', label: 'Difficulty' },
  poi: { key: 'poi', label: 'POI' }
});

const PROFILE_GRADIENT_MODES = Object.freeze(['slope', 'surface']);

const PROFILE_LEGEND_SHOW_DELAY_MS = 1000;

const SLOPE_GRADIENT_LABELS = Object.freeze(['-18%', '-12%', '-6%', '0%', '6%', '12%', '18%', '>18%']);

const PROFILE_MODE_LEGENDS = Object.freeze({
  slope: SLOPE_CLASSIFICATIONS,
  surface: SURFACE_CLASSIFICATIONS,
  category: CATEGORY_CLASSIFICATIONS
});

const DEFAULT_PROFILE_MODE = PROFILE_MODE_DEFINITIONS.none.key;
const MIN_PROFILE_SEGMENT_DISTANCE_KM = 1e-6;
const MULTIPLIER_TOLERANCE = 1e-6;
const GRADE_TOLERANCE = 1e-4;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function isProfileGradientMode(mode) {
  return PROFILE_GRADIENT_MODES.includes(mode);
}

let bivouacMarkerImagePromise = null;

function cloneClassificationEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  return { ...entry };
}

function isUnknownCategoryClassification(classification) {
  if (!classification || typeof classification !== 'object') {
    return true;
  }
  const key = typeof classification.key === 'string' ? classification.key : '';
  if (UNKNOWN_CATEGORY_CLASSIFICATION?.key && key === UNKNOWN_CATEGORY_CLASSIFICATION.key) {
    return true;
  }
  const color = typeof classification.color === 'string' ? classification.color.trim() : '';
  return !color;
}

function loadBivouacMarkerImageElement() {
  if (bivouacMarkerImagePromise) {
    return bivouacMarkerImagePromise;
  }
  bivouacMarkerImagePromise = new Promise((resolve) => {
    try {
      const image = new Image();
      image.decoding = 'async';
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = BIVOUAC_ICON_URL;
    } catch (error) {
      console.warn('Failed to start loading bivouac marker PNG', error);
      resolve(null);
    }
  });
  return bivouacMarkerImagePromise;
}

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

function createTentMarkerImage(fillColor) {
  const base = createMarkerCanvas();
  if (!base) {
    return null;
  }

  const { ctx, size } = base;
  const baseY = size * 0.84;
  const topY = size * 0.18;
  const leftX = size * 0.24;
  const rightX = size * 0.76;
  const centerX = size * 0.5;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.beginPath();
  ctx.ellipse(centerX, baseY + size * 0.03, size * 0.28, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  const shade = adjustHexColor(fillColor, -0.2);
  const gradient = ctx.createLinearGradient(leftX, topY, rightX, baseY);
  gradient.addColorStop(0, fillColor);
  gradient.addColorStop(1, shade);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(centerX, topY);
  ctx.lineTo(rightX, baseY);
  ctx.lineTo(leftX, baseY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = adjustHexColor(fillColor, -0.35);
  ctx.lineWidth = size * 0.03;
  ctx.beginPath();
  ctx.moveTo(centerX, topY);
  ctx.lineTo(centerX, baseY);
  ctx.stroke();

  ctx.fillStyle = adjustHexColor(fillColor, -0.35);
  ctx.beginPath();
  ctx.moveTo(centerX, topY + size * 0.05);
  ctx.lineTo(centerX + size * 0.04, baseY);
  ctx.lineTo(centerX - size * 0.04, baseY);
  ctx.closePath();
  ctx.fill();

  return finalizeMarkerImage(base);
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
    loadBivouacMarkerImageElement()
      .then((image) => {
        if (!map || typeof map.addImage !== 'function') {
          return;
        }
        if (map.hasImage(BIVOUAC_MARKER_ICON_ID)) {
          return;
        }
        if (image) {
          try {
            map.addImage(BIVOUAC_MARKER_ICON_ID, image, { pixelRatio: 1 });
            return;
          } catch (error) {
            console.warn('Unable to register bivouac marker PNG', error);
          }
        }
        const fallbackIcon = createTentMarkerImage(SEGMENT_MARKER_COLORS.bivouac);
        if (fallbackIcon && !map.hasImage(BIVOUAC_MARKER_ICON_ID)) {
          map.addImage(BIVOUAC_MARKER_ICON_ID, fallbackIcon.image, { pixelRatio: fallbackIcon.pixelRatio });
        }
      })
      .catch((error) => {
        console.warn('Failed to load bivouac marker PNG', error);
        const fallbackIcon = createTentMarkerImage(SEGMENT_MARKER_COLORS.bivouac);
        if (fallbackIcon && !map.hasImage(BIVOUAC_MARKER_ICON_ID)) {
          map.addImage(BIVOUAC_MARKER_ICON_ID, fallbackIcon.image, { pixelRatio: fallbackIcon.pixelRatio });
        }
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

function escapeHtml(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  constructor(map, uiElements = [], options = {}) {
    if (!map || typeof map.addSource !== 'function') {
      throw new Error('A valid MapLibre GL JS map instance is required');
    }

    const [
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
      directionsHint,
      profileModeToggle,
      profileModeMenu,
      profileLegend
    ] = uiElements;

    const {
      router = null,
      deferRouterInitialization = false
    } = options ?? {};

    this.map = map;
    this.mapContainer = map.getContainer?.() ?? null;
    this.directionsToggle = directionsToggle ?? null;
    this.directionsDock = directionsDock ?? null;
    this.directionsControl = directionsControl ?? null;
    this.transportModes = transportModes ? Array.from(transportModes) : [];
    this.swapButton = swapButton ?? null;
    this.undoButton = undoButton ?? null;
    this.redoButton = redoButton ?? null;
    this.clearButton = clearButton ?? null;
    this.routeStats = routeStats ?? null;
    this.elevationChart = elevationChart ?? null;
    this.infoButton = directionsInfoButton ?? null;
    this.directionsHint = directionsHint ?? null;
    this.profileModeToggle = profileModeToggle ?? null;
    this.profileModeMenu = profileModeMenu ?? null;
    this.profileModeOptions = this.profileModeMenu
      ? Array.from(this.profileModeMenu.querySelectorAll('[data-profile-mode]'))
      : [];
    this.profileModeLabel = this.profileModeToggle
      ? this.profileModeToggle.querySelector('.profile-mode-button__label')
      : null;
    this.profileLegend = profileLegend ?? null;
    this.profileLegendVisible = false;
    this.profileLegendHoldTimeout = null;

    this.handleProfileLegendPointerEnter = this.handleProfileLegendPointerEnter.bind(this);
    this.handleProfileLegendPointerLeave = this.handleProfileLegendPointerLeave.bind(this);
    this.handleProfileLegendFocus = this.handleProfileLegendFocus.bind(this);
    this.handleProfileLegendBlur = this.handleProfileLegendBlur.bind(this);
    this.handleProfileLegendKeyDown = this.handleProfileLegendKeyDown.bind(this);

    if (this.profileModeToggle) {
      this.profileModeToggle.addEventListener('pointerenter', this.handleProfileLegendPointerEnter);
      this.profileModeToggle.addEventListener('pointerleave', this.handleProfileLegendPointerLeave);
      this.profileModeToggle.addEventListener('pointerdown', this.handleProfileLegendPointerEnter);
      this.profileModeToggle.addEventListener('pointerup', this.handleProfileLegendPointerLeave);
      this.profileModeToggle.addEventListener('pointercancel', this.handleProfileLegendPointerLeave);
      this.profileModeToggle.addEventListener('focus', this.handleProfileLegendFocus);
      this.profileModeToggle.addEventListener('blur', this.handleProfileLegendBlur);
      this.profileModeToggle.addEventListener('keydown', this.handleProfileLegendKeyDown);
      this.profileModeToggle.addEventListener('click', () => {
        this.hideProfileLegend();
      });
    }

    if (this.routeStats) {
      this.routeStats.setAttribute('aria-live', 'polite');
      this.routeStats.setAttribute('role', 'group');
    }

    this.waypoints = [];
    this.waypointHistory = [];
    this.waypointRedoHistory = [];
    this.currentMode = 'foot-hiking';
    this.modeColors = { ...MODE_COLORS };

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
    this.cachedLegSegments = new Map();
    this.routeProfile = null;
    this.routeCoordinateMetadata = [];
    this.elevationSamples = [];
    this.elevationDomain = null;
    this.elevationYAxis = null;
    this.routeLineGradientSupported = true;
    this.routeLineGradientExpression = null;
    this.routeLineGradientData = EMPTY_COLLECTION;
    this.routeLineFallbackData = EMPTY_COLLECTION;
    this.elevationChartContainer = null;
    this.elevationHoverReadout = null;
    this.highlightedElevationBar = null;
    this.activeHoverSource = null;
    this.lastElevationHoverDistance = null;
    this.setRoutePointsOfInterest([]);
    this.pendingPoiRequest = null;
    this.offlinePoiCollection = EMPTY_COLLECTION;

    this.setHintVisible(false);

    this.router = null;

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
    this.profileSegments = [];
    this.profileMode = DEFAULT_PROFILE_MODE;
    this.profileMenuOpen = false;
    this.routeSegmentsListener = null;
    this.networkPreparationCallback = null;
    this.elevationResizeObserver = null;
    this.terrainElevationErrorLogged = false;

    this.setupRouteLayers();
    this.setupUIHandlers();
    this.setupMapHandlers();
    this.setProfileMode(this.profileMode, { silent: true });
    this.setRouter(router ?? null, { deferEnsureReady: deferRouterInitialization });
    this.updateUndoAvailability();
    this.updatePanelVisibilityState();
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
    removeLayer(ROUTE_POI_LABEL_LAYER_ID);
    removeLayer(ROUTE_POI_LAYER_ID);

    removeSource('route-line-source');
    removeSource('route-segments-source');
    removeSource('distance-markers-source');
    removeSource('route-hover-point-source');
    removeSource('waypoints');
    removeSource(SEGMENT_MARKER_SOURCE_ID);
    removeSource(ROUTE_POI_SOURCE_ID);

    this.map.addSource('route-line-source', {
      type: 'geojson',
      data: EMPTY_COLLECTION,
      lineMetrics: true
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

    this.map.addSource(ROUTE_POI_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_COLLECTION
    });

    const routeLineLayer = {
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
    };

    try {
      this.map.addLayer(routeLineLayer);
    } catch (error) {
      if (this.routeLineGradientSupported && this.isLineGradientUnsupportedError(error)) {
        this.disableRouteLineGradient();
        this.map.addLayer(routeLineLayer);
      } else {
        throw error;
      }
    }

    if (this.routeLineGradientSupported) {
      this.setRouteLineGradient();
    }

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

    this.map.addLayer({
      id: ROUTE_POI_LAYER_ID,
      type: 'circle',
      source: ROUTE_POI_SOURCE_ID,
      layout: {
        visibility: 'none'
      },
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          3,
          12,
          5,
          16,
          7
        ],
        'circle-color': ['coalesce', ['get', 'color'], DEFAULT_POI_COLOR],
        'circle-stroke-color': 'rgba(255, 255, 255, 0.9)',
        'circle-stroke-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          1,
          12,
          1.2,
          16,
          1.6
        ],
        'circle-opacity': 0.95
      },
      filter: ['==', '$type', 'Point']
    });

    this.map.addLayer({
      id: ROUTE_POI_LABEL_LAYER_ID,
      type: 'symbol',
      source: ROUTE_POI_SOURCE_ID,
      layout: {
        'text-field': ['coalesce', ['get', 'name'], ['get', 'title'], ''],
        'text-size': 12,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-font': ['Noto Sans Bold'],
        'text-optional': true,
        visibility: 'none'
      },
      paint: {
        'text-color': ['coalesce', ['get', 'color'], DEFAULT_POI_COLOR],
        'text-halo-color': 'rgba(255, 255, 255, 0.95)',
        'text-halo-width': 1.1,
        'text-halo-blur': 0.25
      },
      filter: ['==', ['get', 'showLabel'], true]
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
          ['match', ['get', 'type'], 'bivouac', 0.12, 0.55],
          12,
          ['match', ['get', 'type'], 'bivouac', 0.18, 0.75],
          16,
          ['match', ['get', 'type'], 'bivouac', 0.24, 0.95]
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
    this.updateRoutePoiData();
    this.updateRoutePoiLayerVisibility();
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

    this.swapButton?.addEventListener('click', () => {
      if (this.waypoints.length < 2) return;
      this.recordWaypointState();
      this.mirrorRouteCutsForReversedRoute();
      this.waypoints.reverse();
      this.invalidateCachedLegSegments();
      this.updateWaypoints();
      this.getRoute();
    });

    this.undoButton?.addEventListener('click', () => {
      this.undoLastWaypointChange();
    });

    this.redoButton?.addEventListener('click', () => {
      this.redoLastWaypointChange();
    });

    this.clearButton?.addEventListener('click', () => {
      this.clearDirections();
    });

    if (this.profileModeToggle) {
      this.profileModeToggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleProfileMenu();
      });
    }

    if (this.profileModeMenu) {
      this.profileModeMenu.setAttribute('aria-hidden', this.profileMenuOpen ? 'false' : 'true');
      this.profileModeMenu.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.closeProfileMenu({ restoreFocus: true });
        }
      });
    }

    if (this.profileModeOptions.length) {
      this.profileModeOptions.forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const mode = button.dataset.profileMode;
          this.setProfileMode(mode);
          this.closeProfileMenu();
        });
      });
    }

    this.handleDocumentClickForProfileMenu = (event) => {
      if (!this.profileMenuOpen) {
        return;
      }
      const target = event.target;
      if (this.profileModeMenu?.contains(target)) {
        return;
      }
      if (this.profileModeToggle && target === this.profileModeToggle) {
        return;
      }
      this.closeProfileMenu();
    };
    document.addEventListener('click', this.handleDocumentClickForProfileMenu);
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

  getProfileModeDefinition(mode) {
    const definition = PROFILE_MODE_DEFINITIONS?.[mode];
    return definition || PROFILE_MODE_DEFINITIONS[DEFAULT_PROFILE_MODE];
  }

  getProfileLegendEntries(mode) {
    if (!mode || mode === 'none') {
      return [];
    }
    const entries = PROFILE_MODE_LEGENDS?.[mode];
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries.map((entry) => cloneClassificationEntry(entry)).filter(Boolean);
  }

  updateProfileModeUI() {
    const definition = this.getProfileModeDefinition(this.profileMode);
    const label = definition?.label ?? this.profileMode;
    if (this.profileModeLabel) {
      this.profileModeLabel.textContent = label;
    }
    if (this.profileModeToggle) {
      this.profileModeToggle.setAttribute('aria-expanded', this.profileMenuOpen ? 'true' : 'false');
    }
    if (this.profileModeMenu) {
      this.profileModeMenu.classList.toggle('profile-mode-menu__list--open', this.profileMenuOpen);
      this.profileModeMenu.setAttribute('aria-hidden', this.profileMenuOpen ? 'false' : 'true');
    }
    this.profileModeOptions.forEach((button) => {
      const mode = button?.dataset?.profileMode;
      const isActive = mode === this.profileMode;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
    const hasRoute = Array.isArray(this.routeGeojson?.geometry?.coordinates)
      && this.routeGeojson.geometry.coordinates.length >= 2;
    this.updateProfileLegend(hasRoute);
  }

  updateProfileLegend(hasRoute = true) {
    if (!this.profileLegend) {
      return;
    }
    const shouldDisplay = Boolean(
      hasRoute && this.profileMode !== 'none' && this.profileMode !== 'poi'
    );
    if (!shouldDisplay) {
      this.profileLegend.innerHTML = '';
      this.profileLegend.setAttribute('aria-hidden', 'true');
      this.profileLegend.classList.remove('profile-legend--gradient');
      this.profileLegend.dataset.ready = 'false';
      this.profileLegendVisible = false;
      this.cancelProfileLegendReveal();
      return;
    }
    const entries = this.getProfileLegendEntries(this.profileMode);
    if (!entries.length) {
      this.profileLegend.innerHTML = '';
      this.profileLegend.setAttribute('aria-hidden', 'true');
      this.profileLegend.classList.remove('profile-legend--gradient');
      this.profileLegend.dataset.ready = 'false';
      this.profileLegendVisible = false;
      this.cancelProfileLegendReveal();
      return;
    }
    const fallbackColor = this.modeColors?.[this.currentMode] ?? '#3ab7c6';
    const normalizeColor = (value) => {
      if (typeof value !== 'string') {
        return fallbackColor;
      }
      const trimmed = value.trim();
      if (HEX_COLOR_PATTERN.test(trimmed)) {
        return trimmed;
      }
      return fallbackColor;
    };
    const isGradientMode = this.profileMode === 'slope';
    this.profileLegend.classList.toggle('profile-legend--gradient', isGradientMode);
    this.profileLegend.innerHTML = '';
    this.profileLegend.dataset.ready = 'true';
    this.profileLegendVisible = this.profileLegendVisible && shouldDisplay;
    if (isGradientMode) {
      const totalStops = entries.length - 1;
      const gradientStops = entries
        .map((entry, index) => {
          const color = normalizeColor(entry.color);
          if (totalStops <= 0) {
            return `${color} 0%`;
          }
          const percentage = (index / totalStops) * 100;
          const clamped = Number.isFinite(percentage) ? Math.max(0, Math.min(percentage, 100)) : 0;
          return `${color} ${clamped.toFixed(2)}%`;
        });
      const gradientBar = document.createElement('div');
      gradientBar.className = 'profile-legend__gradient-bar';
      const gradientTrack = document.createElement('div');
      gradientTrack.className = 'profile-legend__gradient-track';
      if (gradientStops.length) {
        gradientTrack.style.setProperty('--profile-gradient', `linear-gradient(90deg, ${gradientStops.join(', ')})`);
      }
      gradientBar.appendChild(gradientTrack);
      const labelsWrapper = document.createElement('div');
      labelsWrapper.className = 'profile-legend__gradient-labels';
      const extractRangeLabel = (entry) => {
        if (!entry || typeof entry !== 'object') {
          return '';
        }
        if (typeof entry.label === 'string') {
          const match = entry.label.match(/\(([^)]+)\)/);
          if (match && match[1]) {
            return match[1];
          }
          return entry.label;
        }
        if (typeof entry.key === 'string') {
          return entry.key;
        }
        return '';
      };
      const labels = this.profileMode === 'slope'
        ? SLOPE_GRADIENT_LABELS
        : entries.map((entry) => extractRangeLabel(entry)).filter((label) => typeof label === 'string' && label);
      labels.forEach((labelText) => {
        const labelElement = document.createElement('span');
        labelElement.className = 'profile-legend__gradient-label';
        labelElement.textContent = labelText;
        labelsWrapper.appendChild(labelElement);
      });
      this.profileLegend.appendChild(gradientBar);
      this.profileLegend.appendChild(labelsWrapper);
    } else {
      const items = entries
        .map((entry) => {
          const color = normalizeColor(entry.color);
          const safeLabel = escapeHtml(entry.label ?? entry.key ?? '');
          return `
          <li class="profile-legend__item">
            <span class="profile-legend__swatch" style="--legend-color:${color}"></span>
            <span class="profile-legend__label">${safeLabel}</span>
          </li>
        `.trim();
        })
        .join('');
      this.profileLegend.innerHTML = `<ul class="profile-legend__list">${items}</ul>`;
    }
    this.profileLegend.setAttribute('aria-hidden', this.profileLegendVisible ? 'false' : 'true');
  }

  openProfileMenu() {
    if (this.profileMenuOpen) {
      return;
    }
    this.profileMenuOpen = true;
    this.updateProfileModeUI();
    if (this.profileModeMenu && typeof this.profileModeMenu.focus === 'function') {
      this.profileModeMenu.focus();
    }
    this.hideProfileLegend();
  }

  closeProfileMenu({ restoreFocus = false } = {}) {
    if (!this.profileMenuOpen) {
      return;
    }
    this.profileMenuOpen = false;
    this.updateProfileModeUI();
    if (restoreFocus && this.profileModeToggle && typeof this.profileModeToggle.focus === 'function') {
      this.profileModeToggle.focus();
    }
    this.hideProfileLegend();
  }

  toggleProfileMenu() {
    if (this.profileMenuOpen) {
      this.closeProfileMenu();
    } else {
      this.openProfileMenu();
    }
  }

  setProfileMode(mode, { silent = false } = {}) {
    const normalized = typeof mode === 'string' && PROFILE_MODE_DEFINITIONS[mode]
      ? mode
      : DEFAULT_PROFILE_MODE;
    this.profileMode = normalized;
    this.updateProfileModeUI();
    this.hideProfileLegend();
    this.updateRoutePoiLayerVisibility();
    if (silent) {
      return;
    }
    this.updateProfileSegments();
    if (Array.isArray(this.routeGeojson?.geometry?.coordinates)
      && this.routeGeojson.geometry.coordinates.length >= 2) {
      this.updateElevationProfile(this.routeGeojson.geometry.coordinates);
    }
  }

  hasProfileLegendContent() {
    return Boolean(this.profileLegend) && this.profileLegend.dataset?.ready === 'true';
  }

  cancelProfileLegendReveal() {
    if (this.profileLegendHoldTimeout !== null) {
      clearTimeout(this.profileLegendHoldTimeout);
      this.profileLegendHoldTimeout = null;
    }
  }

  scheduleProfileLegendReveal() {
    if (!this.hasProfileLegendContent() || this.profileMenuOpen || this.profileLegendVisible) {
      return;
    }
    this.cancelProfileLegendReveal();
    this.profileLegendHoldTimeout = globalThis.setTimeout(() => {
      this.profileLegendHoldTimeout = null;
      this.showProfileLegend();
    }, PROFILE_LEGEND_SHOW_DELAY_MS);
  }

  showProfileLegend() {
    if (!this.hasProfileLegendContent() || this.profileMenuOpen || !this.profileLegend) {
      return;
    }
    this.cancelProfileLegendReveal();
    this.profileLegendVisible = true;
    this.profileLegend.setAttribute('aria-hidden', 'false');
  }

  hideProfileLegend() {
    this.cancelProfileLegendReveal();
    this.profileLegendVisible = false;
    if (this.profileLegend) {
      this.profileLegend.setAttribute('aria-hidden', 'true');
    }
  }

  handleProfileLegendPointerEnter(event) {
    if (!event) {
      return;
    }
    if (event.type === 'pointerenter' && event.pointerType === 'touch') {
      return;
    }
    if (event.type === 'pointerdown' && typeof event.button === 'number' && event.button !== 0) {
      return;
    }
    this.scheduleProfileLegendReveal();
  }

  handleProfileLegendPointerLeave() {
    this.cancelProfileLegendReveal();
    if (this.profileModeToggle && document.activeElement === this.profileModeToggle) {
      return;
    }
    this.hideProfileLegend();
  }

  handleProfileLegendFocus() {
    this.scheduleProfileLegendReveal();
  }

  handleProfileLegendBlur() {
    this.hideProfileLegend();
  }

  handleProfileLegendKeyDown(event) {
    if (event?.key === 'Escape') {
      this.hideProfileLegend();
    }
  }

  getSegmentMetadata(segment) {
    if (!segment || typeof segment !== 'object') {
      return null;
    }
    const rawMetadata = segment.metadata;
    const metadata = rawMetadata && !Array.isArray(rawMetadata) && typeof rawMetadata === 'object'
      ? rawMetadata
      : null;
    const metadataEntries = Array.isArray(rawMetadata)
      ? rawMetadata
          .map((entry) => (entry && typeof entry === 'object' ? entry : null))
          .filter(Boolean)
      : [];
    const distanceKm = Number(segment.distanceKm ?? metadata?.distanceKm);
    const startDistanceKm = Number(metadata?.startDistanceKm ?? metadata?.cumulativeStartKm ?? segment.startDistanceKm);
    const endDistanceKm = Number(metadata?.endDistanceKm ?? metadata?.cumulativeEndKm ?? segment.endDistanceKm);
    const ascent = Number(metadata?.ascent ?? segment.ascent ?? 0);
    const descent = Number(metadata?.descent ?? segment.descent ?? 0);
    const costMultiplier = Number(metadata?.costMultiplier);

    let sacScale = null;
    let sacRank = -Infinity;
    let category = null;
    let surface = null;
    let surfaceRank = -Infinity;
    let trailVisibility = null;
    let trailRank = -Infinity;

    const processEntry = (entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const hiking = entry.hiking && typeof entry.hiking === 'object' ? entry.hiking : null;
      const sacCandidates = [
        hiking?.sacScale,
        entry.sacScale,
        hiking?.category,
        entry.category,
        hiking?.difficulty,
        entry.difficulty
      ];
      sacCandidates.forEach((candidate) => {
        const normalizedSacScale = normalizeSacScale(candidate);
        if (!normalizedSacScale) {
          return;
        }
        const rank = SAC_SCALE_RANK[normalizedSacScale] || 0;
        if (rank > sacRank) {
          sacRank = rank;
          sacScale = normalizedSacScale;
          category = typeof candidate === 'string' && candidate ? candidate : normalizedSacScale;
        }
      });
      const normalizedSurface = normalizeSurfaceType(hiking?.surface ?? entry.surface);
      const normalizedTrail = normalizeTrailVisibility(hiking?.trailVisibility ?? entry.trailVisibility);
      if (normalizedSurface) {
        const rank = SURFACE_SEVERITY_RANK[normalizedSurface] || 0;
        if (rank > surfaceRank) {
          surfaceRank = rank;
          surface = normalizedSurface;
        }
      }
      if (normalizedTrail) {
        const rank = TRAIL_VISIBILITY_RANK[normalizedTrail] || 0;
        if (rank > trailRank) {
          trailRank = rank;
          trailVisibility = normalizedTrail;
        }
      }
    };

    metadataEntries.forEach(processEntry);
    if (metadata) {
      processEntry(metadata);
    }

    return {
      distanceKm: Number.isFinite(distanceKm) ? distanceKm : Math.max(0, (endDistanceKm ?? 0) - (startDistanceKm ?? 0)),
      startDistanceKm: Number.isFinite(startDistanceKm) ? startDistanceKm : null,
      endDistanceKm: Number.isFinite(endDistanceKm) ? endDistanceKm : null,
      ascent: Number.isFinite(ascent) ? ascent : 0,
      descent: Number.isFinite(descent) ? descent : 0,
      costMultiplier: Number.isFinite(costMultiplier) && costMultiplier > 0 ? costMultiplier : 1,
      source: metadata?.source ?? 'network',
      sacScale,
      category: category ? normalizeSacScale(category) ?? category : null,
      surface,
      trailVisibility
    };
  }

  computeSegmentGrade(segment) {
    if (!segment) {
      return 0;
    }
    const distanceKm = Number(segment.distanceKm);
    const startElevation = Number(segment.startElevation);
    const endElevation = Number(segment.endElevation);
    const distanceMeters = Number.isFinite(distanceKm) ? distanceKm * 1000 : 0;
    if (!Number.isFinite(startElevation) || !Number.isFinite(endElevation) || !(distanceMeters > 0)) {
      const metadata = this.getSegmentMetadata(segment);
      const metadataDistanceKm = Number.isFinite(metadata?.distanceKm)
        ? metadata.distanceKm
        : Number(segment.distanceKm);
      const netElevation = (Number(metadata?.ascent) || 0) - (Number(metadata?.descent) || 0);
      if (Number.isFinite(metadataDistanceKm) && metadataDistanceKm > 0 && Number.isFinite(netElevation) && netElevation !== 0) {
        return (netElevation / (metadataDistanceKm * 1000)) * 100;
      }
      return 0;
    }
    return ((endElevation - startElevation) / distanceMeters) * 100;
  }

  classifySlopeSegment(segment) {
    const grade = this.computeSegmentGrade(segment);
    if (!Number.isFinite(grade)) {
      return null;
    }
    for (const entry of SLOPE_CLASSIFICATIONS) {
      const min = Number.isFinite(entry.minGrade) ? entry.minGrade : -Infinity;
      const max = Number.isFinite(entry.maxGrade) ? entry.maxGrade : Infinity;
      const lowerOk = min === -Infinity
        ? true
        : entry.minInclusive === false
          ? grade > min + GRADE_TOLERANCE
          : grade >= min - GRADE_TOLERANCE;
      const upperOk = max === Infinity
        ? true
        : entry.maxInclusive === true
          ? grade <= max + GRADE_TOLERANCE
          : grade < max - GRADE_TOLERANCE;
      if (lowerOk && upperOk) {
        return cloneClassificationEntry(entry);
      }
    }
    return cloneClassificationEntry(SLOPE_CLASSIFICATIONS[SLOPE_CLASSIFICATIONS.length - 1]);
  }

  classifySurfaceSegment(segment) {
    const metadata = this.getSegmentMetadata(segment);
    const surfaceTag = normalizeSurfaceType(metadata?.surface);
    if (surfaceTag) {
      for (const entry of SURFACE_CLASSIFICATIONS) {
        if (Array.isArray(entry.surfaceValues) && entry.surfaceValues.includes(surfaceTag)) {
          return cloneClassificationEntry(entry);
        }
      }
    }
    const multiplier = Number(metadata?.costMultiplier) || 1;
    for (const entry of SURFACE_CLASSIFICATIONS) {
      const min = Number.isFinite(entry.minMultiplier) ? entry.minMultiplier : -Infinity;
      const max = Number.isFinite(entry.maxMultiplier) ? entry.maxMultiplier : Infinity;
      const lowerOk = min === -Infinity
        ? true
        : entry.minInclusive === false
          ? multiplier > min + MULTIPLIER_TOLERANCE
          : multiplier >= min - MULTIPLIER_TOLERANCE;
      const upperOk = max === Infinity
        ? true
        : entry.maxInclusive === true
          ? multiplier <= max + MULTIPLIER_TOLERANCE
          : multiplier < max - MULTIPLIER_TOLERANCE;
      if (lowerOk && upperOk) {
        return cloneClassificationEntry(entry);
      }
    }
    return cloneClassificationEntry(SURFACE_CLASSIFICATIONS[SURFACE_CLASSIFICATIONS.length - 1]);
  }

  classifyCategorySegment(segment) {
    const metadata = this.getSegmentMetadata(segment);
    const hikingMetadata = metadata?.hiking && typeof metadata.hiking === 'object' ? metadata.hiking : null;
    const sacScale = resolveSacScale(
      metadata?.sacScale,
      metadata?.category,
      hikingMetadata?.sacScale,
      hikingMetadata?.category,
      hikingMetadata?.difficulty
    );
    if (sacScale) {
      for (const entry of CATEGORY_CLASSIFICATIONS) {
        if (Array.isArray(entry.sacScaleValues) && entry.sacScaleValues.includes(sacScale)) {
          return cloneClassificationEntry(entry);
        }
      }
    }
    return cloneClassificationEntry(UNKNOWN_CATEGORY_CLASSIFICATION);
  }

  classifySegment(segment) {
    if (!segment) {
      return null;
    }
    switch (this.profileMode) {
      case 'slope':
        return this.classifySlopeSegment(segment);
      case 'surface':
        return this.classifySurfaceSegment(segment);
      case 'category':
        return this.classifyCategorySegment(segment);
      case 'poi':
      case 'none':
      default:
        return null;
    }
  }

  getWaypointCoordinates() {
    if (!Array.isArray(this.waypoints)) {
      return [];
    }
    return this.waypoints.map((coord) => normalizeCoordinatePair(coord)).filter(Boolean);
  }

  segmentTouchesWaypoint(segment, waypointCoordinates = this.getWaypointCoordinates()) {
    if (!segment || !Array.isArray(waypointCoordinates) || !waypointCoordinates.length) {
      return false;
    }
    const start = Array.isArray(segment.start) ? segment.start : null;
    const end = Array.isArray(segment.end) ? segment.end : null;
    if (!start && !end) {
      return false;
    }
    return waypointCoordinates.some((waypoint) => {
      if (!Array.isArray(waypoint) || waypoint.length < 2) {
        return false;
      }
      if (start && this.coordinatesMatch(start, waypoint)) {
        return true;
      }
      return end ? this.coordinatesMatch(end, waypoint) : false;
    });
  }

  segmentsShareBoundary(first, second) {
    if (!first || !second) {
      return false;
    }
    const boundaries = [
      Array.isArray(first.start) ? first.start : null,
      Array.isArray(first.end) ? first.end : null
    ];
    const comparison = [
      Array.isArray(second.start) ? second.start : null,
      Array.isArray(second.end) ? second.end : null
    ];
    return boundaries.some((candidate) => {
      if (!candidate) {
        return false;
      }
      return comparison.some((other) => other && this.coordinatesMatch(candidate, other));
    });
  }

  resolveCategorySegmentEntries(segmentEntries) {
    if (!Array.isArray(segmentEntries) || !segmentEntries.length) {
      return Array.isArray(segmentEntries) ? segmentEntries : [];
    }

    const resolved = segmentEntries.map((entry) => {
      if (!entry) {
        return null;
      }
      const segment = entry.segment ?? null;
      const classification = entry.classification ? cloneClassificationEntry(entry.classification) : null;
      return { segment, classification };
    });

    const waypointCoordinates = this.getWaypointCoordinates();

    const findNeighborClassification = (startIndex, step) => {
      let index = startIndex + step;
      while (index >= 0 && index < resolved.length) {
        const candidate = resolved[index];
        if (!candidate || !candidate.segment) {
          index += step;
          continue;
        }
        const { classification } = candidate;
        if (!classification || isUnknownCategoryClassification(classification)) {
          index += step;
          continue;
        }
        return classification;
      }
      return null;
    };

    const assignClassification = (entry, classification) => {
      if (!entry || !classification) {
        return;
      }
      entry.classification = cloneClassificationEntry(classification);
    };

    resolved.forEach((entry, index) => {
      if (!entry || !entry.segment) {
        return;
      }
      const metadataSource = entry.segment?.metadata?.source;
      if (!isConnectorMetadataSource(metadataSource)) {
        return;
      }
      if (!isUnknownCategoryClassification(entry.classification)) {
        return;
      }
      const fallback = findNeighborClassification(index, -1) ?? findNeighborClassification(index, 1);
      if (fallback) {
        assignClassification(entry, fallback);
      }
    });

    if (waypointCoordinates.length) {
      resolved.forEach((entry, index) => {
        if (!entry || !entry.segment) {
          return;
        }
        const metadataSource = entry.segment?.metadata?.source;
        if (!isConnectorMetadataSource(metadataSource)) {
          return;
        }
        if (!isUnknownCategoryClassification(entry.classification)) {
          return;
        }
        if (!this.segmentTouchesWaypoint(entry.segment, waypointCoordinates)) {
          return;
        }
        const fallback = findNeighborClassification(index, -1) ?? findNeighborClassification(index, 1);
        if (fallback) {
          assignClassification(entry, fallback);
        }
      });
    }

    let updated = true;
    while (updated) {
      updated = false;
      resolved.forEach((entry, index) => {
        if (!entry || !entry.segment) {
          return;
        }
        const metadataSource = entry.segment?.metadata?.source;
        if (!isConnectorMetadataSource(metadataSource)) {
          return;
        }
        if (!isUnknownCategoryClassification(entry.classification)) {
          return;
        }
        const previous = index > 0 ? resolved[index - 1] : null;
        if (previous && previous.segment && !isUnknownCategoryClassification(previous.classification)
          && this.segmentsShareBoundary(entry.segment, previous.segment)) {
          assignClassification(entry, previous.classification);
          updated = true;
          return;
        }
        const next = index + 1 < resolved.length ? resolved[index + 1] : null;
        if (next && next.segment && !isUnknownCategoryClassification(next.classification)
          && this.segmentsShareBoundary(entry.segment, next.segment)) {
          assignClassification(entry, next.classification);
          updated = true;
        }
      });
    }

    return resolved;
  }

  updateProfileSegments() {
    if (this.profileMode === 'none'
      || this.profileMode === 'poi'
      || !Array.isArray(this.routeSegments)
      || !this.routeSegments.length) {
      this.profileSegments = [];
      this.updateRouteLineSource();
      return;
    }
    const segments = [];
    let current = null;
    const appendCoordinate = (list, coord) => {
      if (!Array.isArray(list) || !Array.isArray(coord) || coord.length < 2) {
        return;
      }
      const last = list[list.length - 1];
      if (last
        && Math.abs(last[0] - coord[0]) <= COORD_EPSILON
        && Math.abs(last[1] - coord[1]) <= COORD_EPSILON) {
        return;
      }
      list.push(coord);
    };

    let segmentEntries = this.routeSegments.map((segment) => {
      if (!segment) {
        return null;
      }
      return {
        segment,
        classification: this.classifySegment(segment) || null
      };
    });

    if (this.profileMode === 'category' && segmentEntries.length) {
      segmentEntries = this.resolveCategorySegmentEntries(segmentEntries);
    }

    segmentEntries.forEach((entry) => {
      if (!entry || !entry.segment) {
        return;
      }
      const { segment } = entry;
      const classification = entry.classification || {};
      const color = typeof classification.color === 'string' ? classification.color : this.modeColors[this.currentMode];
      const name = classification.label ?? '';
      const key = classification.key ?? `${this.profileMode}-default`;
      const startKm = Number(segment.startDistanceKm) || 0;
      const endKm = Number(segment.endDistanceKm) || startKm;
      const distanceKm = Math.max(0, endKm - startKm);
      const startCoord = Array.isArray(segment.start) ? segment.start.slice() : null;
      const endCoord = Array.isArray(segment.end) ? segment.end.slice() : null;
      if (!startCoord || startCoord.length < 2 || !endCoord || endCoord.length < 2) {
        return;
      }
      const zeroLengthSegment = distanceKm <= MIN_PROFILE_SEGMENT_DISTANCE_KM
        && Math.abs(startCoord[0] - endCoord[0]) <= COORD_EPSILON
        && Math.abs(startCoord[1] - endCoord[1]) <= COORD_EPSILON;
      if (zeroLengthSegment) {
        return;
      }
      if (!current || current.key !== key) {
        if (current) {
          if (Array.isArray(current.coordinates) && current.coordinates.length >= 2) {
            segments.push(current);
          }
        }
        const coordinates = [];
        appendCoordinate(coordinates, startCoord);
        appendCoordinate(coordinates, endCoord);
        current = {
          key,
          color,
          name,
          startKm,
          endKm,
          distanceKm,
          coordinates,
          index: segments.length
        };
        return;
      }
      current.endKm = endKm;
      current.distanceKm += distanceKm;
      appendCoordinate(current.coordinates, endCoord);
    });
    if (current && Array.isArray(current.coordinates) && current.coordinates.length >= 2) {
      segments.push(current);
    }
    this.profileSegments = segments.map((entry, index) => ({
      ...entry,
      index,
      coordinates: entry.coordinates.filter((coord) => Array.isArray(coord) && coord.length >= 2)
    })).filter((entry) => entry.coordinates.length >= 2);
    this.updateRouteLineSource();
  }

  getProfileSegmentForDistance(distanceKm) {
    if (!Array.isArray(this.profileSegments) || !this.profileSegments.length) {
      return null;
    }
    const epsilon = 1e-6;
    return this.profileSegments.find((segment, index) => {
      if (!segment) {
        return false;
      }
      const startKm = Number(segment.startKm ?? 0);
      const endKm = Number(segment.endKm ?? startKm);
      if (index === this.profileSegments.length - 1) {
        return distanceKm >= startKm - epsilon && distanceKm <= endKm + epsilon;
      }
      return distanceKm >= startKm - epsilon && distanceKm < endKm - epsilon * 0.5;
    }) ?? null;
  }

  cloneWaypoints(source = this.waypoints) {
    if (!Array.isArray(source)) {
      return [];
    }
    return source.map((coords) => (Array.isArray(coords) ? coords.slice() : []));
  }

  buildWaypointCoordinate(coords) {
    if (!Array.isArray(coords) || coords.length < 2) {
      return null;
    }

    const lng = Number(coords[0]);
    const lat = Number(coords[1]);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return null;
    }

    let elevation = coords.length > 2 && Number.isFinite(coords[2]) ? Number(coords[2]) : null;

    if (!Number.isFinite(elevation)) {
      const terrainElevation = this.queryTerrainElevationValue([lng, lat]);
      if (Number.isFinite(terrainElevation)) {
        elevation = terrainElevation;
      }
    }

    return Number.isFinite(elevation) ? [lng, lat, elevation] : [lng, lat];
  }

  normalizeRouteCutEntry(entry) {
    if (entry === null || entry === undefined) {
      return null;
    }

    if (typeof entry === 'number') {
      const distance = Number(entry);
      return Number.isFinite(distance) ? { distanceKm: distance, lng: null, lat: null } : null;
    }

    if (typeof entry === 'object') {
      const distance = Number(entry.distanceKm ?? entry.distance ?? entry.value);
      if (!Number.isFinite(distance)) {
        return null;
      }

      let lng = null;
      let lat = null;

      if (Array.isArray(entry.coordinates) && entry.coordinates.length >= 2) {
        const [coordLng, coordLat] = entry.coordinates;
        lng = Number(coordLng);
        lat = Number(coordLat);
      } else {
        const maybeLng = Number(entry.lng ?? entry.lon ?? entry.longitude);
        const maybeLat = Number(entry.lat ?? entry.latitude);
        if (Number.isFinite(maybeLng) && Number.isFinite(maybeLat)) {
          lng = maybeLng;
          lat = maybeLat;
        }
      }

      return {
        distanceKm: distance,
        lng: Number.isFinite(lng) ? lng : null,
        lat: Number.isFinite(lat) ? lat : null
      };
    }

    return null;
  }

  cloneRouteCuts(source = this.routeCutDistances) {
    if (!Array.isArray(source)) {
      return [];
    }

    return source
      .map((entry) => this.normalizeRouteCutEntry(entry))
      .filter((entry) => entry && Number.isFinite(entry.distanceKm))
      .map((entry) => ({ ...entry }));
  }

  setRouteCutDistances(cuts) {
    if (!Array.isArray(cuts) || !cuts.length) {
      this.routeCutDistances = [];
      return;
    }

    const normalized = cuts
      .map((entry) => this.normalizeRouteCutEntry(entry))
      .filter((entry) => entry && Number.isFinite(entry.distanceKm))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .map((entry) => ({ ...entry }));

    this.routeCutDistances = normalized;
  }

  createHistorySnapshot() {
    const waypoints = this.cloneWaypoints();
    const routeCuts = this.cloneRouteCuts();
    return { waypoints, routeCuts };
  }

  restoreStateFromSnapshot(snapshot) {
    if (!snapshot) {
      return false;
    }

    let waypointSnapshot = null;
    let routeCutSnapshot = [];

    if (Array.isArray(snapshot)) {
      waypointSnapshot = this.cloneWaypoints(snapshot);
    } else if (Array.isArray(snapshot.waypoints)) {
      waypointSnapshot = this.cloneWaypoints(snapshot.waypoints);
      routeCutSnapshot = this.cloneRouteCuts(
        Array.isArray(snapshot.routeCuts) ? snapshot.routeCuts : []
      );
    }

    if (!Array.isArray(waypointSnapshot)) {
      return false;
    }

    this.waypoints = waypointSnapshot;
    this.setRouteCutDistances(routeCutSnapshot);
    return true;
  }

  trimHistoryStack(stack) {
    if (!Array.isArray(stack)) {
      return;
    }
    if (stack.length > WAYPOINT_HISTORY_LIMIT) {
      stack.splice(0, stack.length - WAYPOINT_HISTORY_LIMIT);
    }
  }

  recordWaypointState() {
    const snapshot = this.createHistorySnapshot();
    if (!snapshot || !Array.isArray(snapshot.waypoints)) {
      return;
    }
    this.waypointHistory.push(snapshot);
    this.trimHistoryStack(this.waypointHistory);
    this.waypointRedoHistory = [];
    this.updateUndoAvailability();
  }

  updateUndoAvailability() {
    const hasHistory = Array.isArray(this.waypointHistory) && this.waypointHistory.length > 0;
    if (this.undoButton) {
      this.undoButton.disabled = !hasHistory;
    }
    const hasRedo = Array.isArray(this.waypointRedoHistory) && this.waypointRedoHistory.length > 0;
    if (this.redoButton) {
      this.redoButton.disabled = !hasRedo;
    }
  }

  undoLastWaypointChange() {
    if (!Array.isArray(this.waypointHistory) || !this.waypointHistory.length) {
      return;
    }
    const previous = this.waypointHistory.pop();
    const currentSnapshot = this.createHistorySnapshot();
    const restored = this.restoreStateFromSnapshot(previous);
    if (!restored) {
      this.updateUndoAvailability();
      return;
    }
    if (currentSnapshot && Array.isArray(currentSnapshot.waypoints)) {
      this.waypointRedoHistory.push(currentSnapshot);
      this.trimHistoryStack(this.waypointRedoHistory);
    }
    this.invalidateCachedLegSegments();
    if (this.waypoints.length >= 2) {
      this.updateWaypoints();
      this.getRoute();
    } else {
      this.clearRoute();
      this.updateWaypoints();
      this.updateStats(null);
      this.updateElevationProfile([]);
    }
    this.updateModeAvailability();
    this.updateUndoAvailability();
  }

  redoLastWaypointChange() {
    if (!Array.isArray(this.waypointRedoHistory) || !this.waypointRedoHistory.length) {
      return;
    }
    const next = this.waypointRedoHistory.pop();
    const currentSnapshot = this.createHistorySnapshot();
    const restored = this.restoreStateFromSnapshot(next);
    if (!restored) {
      this.updateUndoAvailability();
      return;
    }
    if (currentSnapshot && Array.isArray(currentSnapshot.waypoints)) {
      this.waypointHistory.push(currentSnapshot);
      this.trimHistoryStack(this.waypointHistory);
    }
    this.invalidateCachedLegSegments();
    if (this.waypoints.length >= 2) {
      this.updateWaypoints();
      this.getRoute();
    } else {
      this.clearRoute();
      this.updateWaypoints();
      this.updateStats(null);
      this.updateElevationProfile([]);
    }
    this.updateModeAvailability();
    this.updateUndoAvailability();
  }

  updateModeAvailability() {
    if (!Array.isArray(this.transportModes) || !this.transportModes.length) {
      return;
    }

    const supports = (mode) => {
      if (!this.router || typeof this.router.supportsMode !== 'function') {
        return true;
      }
      return this.router.supportsMode(mode);
    };

    let hasActiveMode = false;

    this.transportModes.forEach((button) => {
      const mode = button.dataset.mode;
      if (!mode) return;
      const supported = supports(mode);
      button.disabled = !supported;
      button.classList.toggle('mode-disabled', !supported);
      const shouldBeActive = supported && mode === this.currentMode;
      button.classList.toggle('active', shouldBeActive);
      if (shouldBeActive) {
        hasActiveMode = true;
      }
    });

    if (!hasActiveMode) {
      const fallbackButton = this.transportModes.find((button) => {
        const mode = button.dataset.mode;
        return mode && supports(mode);
      });
      if (fallbackButton) {
        this.setTransportMode(fallbackButton.dataset.mode);
      }
    }
  }

  setRouter(router, options = {}) {
    this.router = router ?? null;
    const { reroute = false, deferEnsureReady = false } = options ?? {};
    if (this.router && typeof this.router.ensureReady === 'function' && !deferEnsureReady) {
      this.router.ensureReady().catch((error) => {
        console.error('Router failed to initialize', error);
      });
    }
    this.updateModeAvailability();
    if (reroute && this.waypoints.length >= 2) {
      this.getRoute();
    }
  }

  setOfflinePointsOfInterest(collection) {
    let normalized = EMPTY_COLLECTION;
    if (collection && typeof collection === 'object' && collection.type === 'FeatureCollection'
      && Array.isArray(collection.features)) {
      const features = collection.features
        .map((feature) => {
          if (!feature || typeof feature !== 'object') {
            return null;
          }
          const geometry = feature.geometry;
          if (!geometry || geometry.type !== 'Point' || !Array.isArray(geometry.coordinates)) {
            return null;
          }
          const lng = Number(geometry.coordinates[0]);
          const lat = Number(geometry.coordinates[1]);
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            return null;
          }
          const originalCoords = Array.isArray(geometry.coordinates)
            ? geometry.coordinates
            : [];
          const elevation = originalCoords.length >= 3 ? Number(originalCoords[2]) : null;
          const properties = feature.properties && typeof feature.properties === 'object'
            ? { ...feature.properties }
            : {};
          if (!Object.prototype.hasOwnProperty.call(properties, 'ele') && Number.isFinite(elevation)) {
            properties.ele = elevation;
          }
          const coordinates = Number.isFinite(elevation)
            ? [lng, lat, elevation]
            : [lng, lat];
          return {
            type: 'Feature',
            properties,
            geometry: {
              type: 'Point',
              coordinates
            }
          };
        })
        .filter(Boolean);
      if (features.length) {
        normalized = { type: 'FeatureCollection', features };
      }
    }
    this.offlinePoiCollection = normalized;
    if (Array.isArray(this.routeProfile?.coordinates) && this.routeProfile.coordinates.length >= 2) {
      this.refreshRoutePointsOfInterest().catch(() => {});
    } else {
      this.setRoutePointsOfInterest([]);
      this.pendingPoiRequest = null;
    }
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

  setNetworkPreparationCallback(callback) {
    this.networkPreparationCallback = typeof callback === 'function' ? callback : null;
  }

  async prepareNetwork(context = {}) {
    if (typeof this.networkPreparationCallback !== 'function') {
      return;
    }

    const reason = typeof context.reason === 'string' && context.reason
      ? context.reason
      : 'route-request';

    try {
      await this.networkPreparationCallback({
        waypoints: this.snapshotWaypoints(),
        mode: this.currentMode,
        reason
      });
    } catch (error) {
      console.warn('Failed to prepare routing network', error);
    }
  }

  resetRouteCuts() {
    this.routeCutDistances = [];
    this.cutSegments = [];
    this.updateSegmentMarkers();
    this.updateDistanceMarkers(this.routeGeojson);
  }

  getSegmentColor(index) {
    if (!Number.isInteger(index) || index < 0) {
      return this.modeColors[this.currentMode];
    }
    if (index === 0) {
      return this.modeColors[this.currentMode];
    }
    const paletteIndex = (index - 1) % SEGMENT_COLOR_PALETTE.length;
    return SEGMENT_COLOR_PALETTE[paletteIndex] ?? this.modeColors[this.currentMode];
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
          .map((entry) => Number(entry?.distanceKm ?? entry))
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
        const nextSegment = this.cutSegments?.[segmentIndex];
        if (nextSegment && Number.isFinite(nextSegment.startKm)) {
          return Number(nextSegment.startKm);
        }
        const prevSegment = this.cutSegments?.[segmentIndex - 1];
        if (prevSegment && Number.isFinite(prevSegment.endKm)) {
          return Number(prevSegment.endKm);
        }
        const cutEntry = this.routeCutDistances?.[segmentIndex - 1];
        const cutValue = Number(cutEntry?.distanceKm ?? cutEntry);
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

  setRoutePointsOfInterest(pois) {
    this.routePointsOfInterest = Array.isArray(pois) ? pois : [];
    this.updateRoutePoiData();
    this.updateRoutePoiLayerVisibility();
  }

  updateRoutePoiData() {
    if (!this.map || typeof this.map.getSource !== 'function') {
      return;
    }
    const source = this.map.getSource(ROUTE_POI_SOURCE_ID);
    if (!source || typeof source.setData !== 'function') {
      return;
    }
    const pois = Array.isArray(this.routePointsOfInterest) ? this.routePointsOfInterest : [];
    if (!pois.length) {
      source.setData(EMPTY_COLLECTION);
      return;
    }
    const features = pois
      .map((poi) => {
        if (!poi) {
          return null;
        }
        const coords = Array.isArray(poi.coordinates) ? poi.coordinates : null;
        if (!coords || coords.length < 2) {
          return null;
        }
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
          return null;
        }
        const name = typeof poi.name === 'string' ? poi.name.trim() : '';
        const title = typeof poi.title === 'string' ? poi.title : name;
        return {
          type: 'Feature',
          properties: {
            id: poi.id ?? null,
            title: title || '',
            name,
            categoryKey: poi.categoryKey ?? '',
            color: typeof poi.color === 'string' && poi.color.trim() ? poi.color.trim() : DEFAULT_POI_COLOR,
            showLabel: Boolean(poi.showLabel && name)
          },
          geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          }
        };
      })
      .filter(Boolean);
    source.setData(features.length ? { type: 'FeatureCollection', features } : EMPTY_COLLECTION);
  }

  updateRoutePoiLayerVisibility() {
    if (!this.map || typeof this.map.getLayer !== 'function' || typeof this.map.setLayoutProperty !== 'function') {
      return;
    }
    const hasPois = Array.isArray(this.routePointsOfInterest) && this.routePointsOfInterest.length > 0;
    const shouldShow = this.profileMode === 'poi' && hasPois;
    const visibility = shouldShow ? 'visible' : 'none';
    [ROUTE_POI_LAYER_ID, ROUTE_POI_LABEL_LAYER_ID].forEach((layerId) => {
      if (this.map.getLayer(layerId)) {
        try {
          this.map.setLayoutProperty(layerId, 'visibility', visibility);
        } catch (error) {
          console.warn('Failed to set POI layer visibility', layerId, error);
        }
      }
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
      if (!result.length) {
        result.push(clone);
        return;
      }

      const last = result[result.length - 1];
      const lngDelta = Math.abs((last?.[0] ?? 0) - (clone?.[0] ?? 0));
      const latDelta = Math.abs((last?.[1] ?? 0) - (clone?.[1] ?? 0));
      const withinCoordinateEpsilon = lngDelta <= COORD_EPSILON && latDelta <= COORD_EPSILON;

      let withinDistanceTolerance = false;
      if (!withinCoordinateEpsilon) {
        const separationKm = this.computeDistanceKm(last, clone);
        withinDistanceTolerance = Number.isFinite(separationKm) && separationKm <= 0.0005;
      }

      if (!withinCoordinateEpsilon && !withinDistanceTolerance) {
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

  generateRouteLineGradientExpression(segments) {
    if (!Array.isArray(segments) || !segments.length) {
      return null;
    }

    const totalDistanceKm = segments.reduce((sum, segment) => {
      const value = Number(segment?.distanceKm);
      if (!Number.isFinite(value) || value <= 0) {
        return sum;
      }
      return sum + value;
    }, 0);

    if (!Number.isFinite(totalDistanceKm) || totalDistanceKm <= 0) {
      return null;
    }

    const clamp01 = (value) => {
      if (!Number.isFinite(value)) {
        return 0;
      }
      if (value <= 0) {
        return 0;
      }
      if (value >= 1) {
        return 1;
      }
      return value;
    };

    const stops = [];
    let traversed = 0;
    let previousColor = null;
    let previousNormalizedColor = null;

    segments.forEach((segment, index) => {
      if (!segment) {
        return;
      }
      const color = typeof segment.color === 'string' ? segment.color : null;
      const normalizedColor = typeof segment.normalizedColor === 'string' ? segment.normalizedColor : null;
      const segmentDistance = Number(segment.distanceKm);
      const distanceKm = Number.isFinite(segmentDistance) && segmentDistance > 0 ? segmentDistance : 0;
      const blendPortion = clamp01(Number(segment.blendPortion));
      const startRatio = traversed / totalDistanceKm;
      const endRatio = (traversed + distanceKm) / totalDistanceKm;
      const clampedStart = clamp01(startRatio);
      const clampedEnd = clamp01(endRatio);

      if (index === 0) {
        if (color) {
          stops.push({ offset: 0, color });
        }
      } else if (color && normalizedColor && previousColor && previousNormalizedColor && previousNormalizedColor !== normalizedColor) {
        stops.push({ offset: clampedStart, color: previousColor });
        if (blendPortion > 0 && distanceKm > 0) {
          const blendDistance = Math.min(distanceKm * blendPortion, distanceKm);
          const blendOffset = clamp01((traversed + blendDistance) / totalDistanceKm);
          if (blendOffset > clampedStart) {
            stops.push({ offset: blendOffset, color });
          } else {
            stops.push({ offset: clampedStart, color });
          }
        } else {
          stops.push({ offset: clampedStart, color });
        }
      }

      if (color) {
        if (distanceKm > 0) {
          stops.push({ offset: clampedEnd, color });
        } else if (!stops.length || stops[stops.length - 1].color !== color) {
          stops.push({ offset: clampedStart, color });
        }
      }

      traversed += distanceKm;
      previousColor = color ?? previousColor;
      previousNormalizedColor = normalizedColor ?? previousNormalizedColor;
    });

    if (!stops.length) {
      return null;
    }

    const normalizedStops = [];
    let lastOffset = null;

    stops
      .filter((stop) => stop && typeof stop.color === 'string')
      .forEach((stop) => {
        const color = stop.color.trim();
        if (!color) {
          return;
        }
        const offset = clamp01(stop.offset);
        if (lastOffset !== null && Math.abs(offset - lastOffset) <= 1e-6) {
          if (normalizedStops.length) {
            normalizedStops[normalizedStops.length - 1].color = color;
          }
          lastOffset = offset;
          return;
        }
        lastOffset = offset;
        normalizedStops.push({ offset, color });
      });

    if (!normalizedStops.length) {
      return null;
    }

    const firstStop = normalizedStops[0];
    if (firstStop.offset !== 0) {
      normalizedStops.unshift({ offset: 0, color: firstStop.color });
    }

    const lastStop = normalizedStops[normalizedStops.length - 1];
    if (lastStop.offset !== 1) {
      normalizedStops.push({ offset: 1, color: lastStop.color });
    }

    if (normalizedStops.length < 2) {
      return null;
    }

    const expression = ['interpolate', ['linear'], ['line-progress']];
    normalizedStops.forEach((stop) => {
      expression.push(clamp01(stop.offset));
      expression.push(stop.color);
    });

    return expression;
  }

  getRouteLineGradientExpression() {
    if (!Array.isArray(this.routeLineGradientExpression) || this.routeLineGradientExpression.length <= 4) {
      return null;
    }
    return this.routeLineGradientExpression;
  }

  isLineGradientUnsupportedError(error) {
    if (!error || typeof error.message !== 'string') {
      return false;
    }
    return error.message.includes('line-gradient') || error.message.includes('lineMetrics');
  }

  disableRouteLineGradient() {
    if (!this.routeLineGradientSupported) {
      return;
    }
    this.routeLineGradientSupported = false;
    this.routeLineGradientExpression = null;
    if (this.map.getLayer('route-line')) {
      try {
        this.map.setPaintProperty('route-line', 'line-gradient', null);
      } catch (setError) {
        // Ignore failures when clearing unsupported properties.
      }
    }
    const source = this.map.getSource('route-line-source');
    if (source) {
      source.setData(this.routeLineFallbackData ?? EMPTY_COLLECTION);
    }
  }

  setRouteLineGradient() {
    if (!this.routeLineGradientSupported || !this.map.getLayer('route-line')) {
      return;
    }
    try {
      this.map.setPaintProperty('route-line', 'line-gradient', this.getRouteLineGradientExpression());
    } catch (error) {
      if (this.isLineGradientUnsupportedError(error)) {
        this.disableRouteLineGradient();
      } else {
        throw error;
      }
    }
  }

  updateRouteLineSource() {
    const source = this.map.getSource('route-line-source');
    if (!source) {
      return;
    }

    const displaySegments = Array.isArray(this.profileSegments) && this.profileSegments.length
      ? this.profileSegments
      : this.cutSegments;

    const allowGradient = isProfileGradientMode(this.profileMode);
    const useBaseColor = this.profileMode === 'none' && displaySegments !== this.cutSegments;
    const fallbackColor = this.modeColors[this.currentMode];
    const normalizeColor = (value) => {
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    };

    const fallbackFeatures = [];
    const normalizedSegments = [];

    const waypointCoordinates = this.getWaypointCoordinates();
    const waypointMatchCache = new Map();
    const coordinatesNearWaypoint = (candidate) => {
      if (!waypointCoordinates.length) {
        return false;
      }
      const normalized = normalizeCoordinatePair(candidate);
      if (!normalized) {
        return false;
      }
      const [lng, lat] = normalized;
      const cacheKey = `${lng.toFixed(6)},${lat.toFixed(6)}`;
      if (waypointMatchCache.has(cacheKey)) {
        return waypointMatchCache.get(cacheKey);
      }
      const matches = waypointCoordinates.some((waypoint) => this.coordinatesMatch(waypoint, normalized));
      waypointMatchCache.set(cacheKey, matches);
      return matches;
    };

    let previousColorValue = null;

    const coordinateDistanceKm = (coords) => {
      if (!Array.isArray(coords) || coords.length < 2) {
        return 0;
      }
      let totalMeters = 0;
      for (let index = 1; index < coords.length; index += 1) {
        const segmentDistance = haversineDistanceMeters(coords[index - 1], coords[index]);
        if (Number.isFinite(segmentDistance) && segmentDistance > 0) {
          totalMeters += segmentDistance;
        }
      }
      return totalMeters / 1000;
    };

    if (Array.isArray(displaySegments)) {
      displaySegments.forEach((segment) => {
        if (!segment) {
          return;
        }
        const coordinates = Array.isArray(segment.coordinates)
          ? segment.coordinates.map((coord) => (Array.isArray(coord) ? coord.slice() : null)).filter(Boolean)
          : [];
        if (coordinates.length < 2) {
          return;
        }

        const segmentColorValue = normalizeColor(useBaseColor ? fallbackColor : segment.color) ?? fallbackColor;
        const normalizedCurrent = segmentColorValue.toLowerCase();
        const normalizedPrevious = typeof previousColorValue === 'string'
          ? previousColorValue.toLowerCase()
          : null;

        let startKm = Number(segment.startKm);
        if (!Number.isFinite(startKm)) {
          startKm = Number(segment.startDistanceKm);
        }
        let endKm = Number(segment.endKm);
        if (!Number.isFinite(endKm)) {
          endKm = Number(segment.endDistanceKm);
        }

        let distanceKm = Number(segment.distanceKm);
        if (!Number.isFinite(distanceKm)) {
          if (Number.isFinite(startKm) && Number.isFinite(endKm)) {
            distanceKm = Math.max(0, endKm - startKm);
          } else {
            distanceKm = coordinateDistanceKm(coordinates);
          }
        }
        if (!Number.isFinite(distanceKm) || distanceKm < 0) {
          distanceKm = 0;
        }

        const previousSegmentEntry = normalizedSegments[normalizedSegments.length - 1];
        const boundaryNearWaypoint = (() => {
          if (!allowGradient || useBaseColor || !previousSegmentEntry) {
            return false;
          }
          if (!waypointCoordinates.length) {
            return false;
          }
          const previousCoords = Array.isArray(previousSegmentEntry.coordinates)
            ? previousSegmentEntry.coordinates
            : [];
          const previousEnd = previousCoords.length ? previousCoords[previousCoords.length - 1] : null;
          const currentStart = coordinates.length ? coordinates[0] : null;
          return coordinatesNearWaypoint(currentStart) || coordinatesNearWaypoint(previousEnd);
        })();

        let blendPortion = 0;
        const shouldBlend = allowGradient
          && !useBaseColor
          && normalizedPrevious
          && normalizedPrevious !== normalizedCurrent
          && !boundaryNearWaypoint;
        if (shouldBlend) {
          if (distanceKm > 0) {
            const ratio = ROUTE_GRADIENT_BLEND_DISTANCE_KM / Math.max(distanceKm, ROUTE_GRADIENT_BLEND_DISTANCE_KM);
            blendPortion = Math.min(0.4, Math.max(0.05, ratio));
          } else {
            blendPortion = 0.2;
          }
        }

        fallbackFeatures.push({
          type: 'Feature',
          properties: {
            color: segmentColorValue,
            segmentIndex: segment.index,
            name: segment.name,
            startKm: Number.isFinite(startKm) ? startKm : null,
            endKm: Number.isFinite(endKm) ? endKm : null
          },
          geometry: {
            type: 'LineString',
            coordinates
          }
        });

        normalizedSegments.push({
          coordinates,
          color: segmentColorValue,
          normalizedColor: normalizedCurrent,
          distanceKm,
          blendPortion
        });

        previousColorValue = segmentColorValue;
      });
    }

    this.routeLineFallbackData = fallbackFeatures.length
      ? {
        type: 'FeatureCollection',
        features: fallbackFeatures
      }
      : EMPTY_COLLECTION;

    const gradientCoordinates = [];
    normalizedSegments.forEach((segment) => {
      if (!Array.isArray(segment.coordinates)) {
        return;
      }
      segment.coordinates.forEach((coord, index) => {
        if (!Array.isArray(coord) || coord.length < 2) {
          return;
        }
        if (gradientCoordinates.length && index === 0) {
          const last = gradientCoordinates[gradientCoordinates.length - 1];
          if (last
            && Math.abs(last[0] - coord[0]) <= COORD_EPSILON
            && Math.abs(last[1] - coord[1]) <= COORD_EPSILON) {
            return;
          }
        }
        gradientCoordinates.push(coord);
      });
    });

    if (allowGradient) {
      this.routeLineGradientExpression = this.generateRouteLineGradientExpression(normalizedSegments);

      this.routeLineGradientData = gradientCoordinates.length >= 2 && this.routeLineGradientExpression
        ? {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: gradientCoordinates
              }
            }
          ]
        }
        : EMPTY_COLLECTION;
    } else {
      this.routeLineGradientExpression = null;
      this.routeLineGradientData = EMPTY_COLLECTION;
    }

    const shouldUseGradient = allowGradient
      && this.routeLineGradientSupported
      && Array.isArray(this.routeLineGradientExpression)
      && this.routeLineGradientExpression.length > 4
      && this.routeLineGradientData?.features?.length;

    const targetData = shouldUseGradient ? this.routeLineGradientData : this.routeLineFallbackData;
    source.setData(targetData ?? EMPTY_COLLECTION);

    if (this.routeLineGradientSupported) {
      this.setRouteLineGradient();
    }

    this.updateSegmentMarkers();
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
    if (this.profileMode === 'none') {
      const cutSegment = this.getCutSegmentForDistance(distanceKm);
      if (cutSegment?.color) {
        return cutSegment.color;
      }
      return this.modeColors[this.currentMode];
    }
    const profileSegment = this.getProfileSegmentForDistance(distanceKm);
    if (profileSegment?.color) {
      return profileSegment.color;
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

  async snapLngLatToNetwork(lngLat) {
    if (!lngLat || !this.router) {
      return null;
    }

    const lng = Number(lngLat.lng);
    const lat = Number(lngLat.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return null;
    }

    try {
      if (typeof this.router.ensureReady === 'function') {
        await this.router.ensureReady();
      }
    } catch (error) {
      console.warn('Failed to ensure offline router readiness for waypoint snapping', error);
      return null;
    }

    const coord = [lng, lat];
    let snap = null;
    if (typeof this.router.findNearestPoint === 'function') {
      snap = this.router.findNearestPoint(coord);
    } else if (this.router.pathFinder?.findNearestPoint) {
      snap = this.router.pathFinder.findNearestPoint(coord);
    }

    if (!snap || !Array.isArray(snap.point) || snap.point.length < 2) {
      return null;
    }

    const distanceMeters = Number(snap.distanceMeters);
    const maxSnapDistance = Number(this.router.maxSnapDistanceMeters);
    if (Number.isFinite(maxSnapDistance) && Number.isFinite(distanceMeters) && distanceMeters > maxSnapDistance) {
      return null;
    }

    const snappedLng = Number(snap.point[0]);
    const snappedLat = Number(snap.point[1]);
    if (!Number.isFinite(snappedLng) || !Number.isFinite(snappedLat)) {
      return null;
    }

    return [snappedLng, snappedLat];
  }

  snapshotWaypoints() {
    if (!Array.isArray(this.waypoints)) {
      return [];
    }
    return this.waypoints.map((coord) => (Array.isArray(coord) ? coord.slice() : coord));
  }

  normalizeWaypointForLog(coord) {
    if (!Array.isArray(coord) || coord.length < 2) {
      return null;
    }
    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return null;
    }
    const roundedLng = Math.round(lng * 1e6) / 1e6;
    const roundedLat = Math.round(lat * 1e6) / 1e6;
    return {
      raw: [lng, lat],
      rounded: [roundedLng, roundedLat],
      string: `[${roundedLng.toFixed(6)}, ${roundedLat.toFixed(6)}]`
    };
  }

  collectViaWaypointEntries(list) {
    const result = new Map();
    if (!Array.isArray(list) || list.length < 3) {
      return result;
    }
    for (let index = 1; index < list.length - 1; index += 1) {
      const normalized = this.normalizeWaypointForLog(list[index]);
      if (normalized) {
        result.set(index, { ...normalized, index });
      }
    }
    return result;
  }

  buildWaypointLogSummary(list) {
    if (!Array.isArray(list) || !list.length) {
      return [];
    }

    const total = list.length;
    let viaOrder = 0;
    const roundPixel = (value) => (Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null);

    return list
      .map((coord, index) => {
        const normalized = this.normalizeWaypointForLog(coord);
        if (!normalized) {
          return null;
        }

        const [rawLng, rawLat] = normalized.raw;
        let role = 'via';
        let label = '';
        let id = '';
        let order = 0;

        if (index === 0) {
          role = 'start';
          label = 'Départ';
          id = 'start';
        } else if (index === total - 1) {
          role = 'end';
          label = 'Arrivée';
          id = 'end';
        } else {
          viaOrder += 1;
          role = 'via';
          order = viaOrder;
          label = `Via ${viaOrder}`;
          id = `via-${viaOrder}`;
        }

        const projected =
          this.map && typeof this.map.project === 'function'
            ? this.map.project(new maplibregl.LngLat(rawLng, rawLat))
            : null;

        return {
          index,
          role,
          id,
          label,
          order,
          lng: normalized.rounded[0],
          lat: normalized.rounded[1],
          rawLng,
          rawLat,
          x: roundPixel(projected?.x),
          y: roundPixel(projected?.y)
        };
      })
      .filter(Boolean);
  }

  buildWaypointListEntries(summary = []) {
    if (!Array.isArray(summary) || !summary.length) {
      return [];
    }

    return summary
      .map((item, index) => {
        if (!item) {
          return null;
        }

        const waypointNumber = index + 1;
        const rawLng = Number(item.rawLng);
        const rawLat = Number(item.rawLat);
        const hasValidCoordinates = Number.isFinite(rawLng) && Number.isFinite(rawLat);
        const coordinateText = hasValidCoordinates
          ? `[${rawLng.toFixed(6)}, ${rawLat.toFixed(6)}]`
          : null;
        const roleLabel = typeof item.label === 'string' && item.label.length ? item.label : item.role;
        const descriptionBase = `Waypoint ${waypointNumber}`;
        const descriptionRole = roleLabel ? ` (${roleLabel})` : '';
        const description = hasValidCoordinates
          ? `${descriptionBase}${descriptionRole}: ${coordinateText}`
          : `${descriptionBase}${descriptionRole}`;

        return {
          waypoint: `Waypoint ${waypointNumber}`,
          index: item.index,
          role: item.role,
          label: roleLabel,
          coordinates: hasValidCoordinates ? [rawLng, rawLat] : null,
          coordinatesText: coordinateText,
          description
        };
      })
      .filter(Boolean);
  }

  haveWaypointSummariesChanged(previous = [], next = []) {
    if (!Array.isArray(previous) || !Array.isArray(next)) {
      return true;
    }

    if (previous.length !== next.length) {
      return true;
    }

    for (let index = 0; index < previous.length; index += 1) {
      const prev = previous[index];
      const nextItem = next[index];
      if (!prev || !nextItem) {
        return true;
      }

      if (prev.id !== nextItem.id || prev.role !== nextItem.role) {
        return true;
      }

      const lngDelta = Math.abs((prev.rawLng ?? 0) - (nextItem.rawLng ?? 0));
      const latDelta = Math.abs((prev.rawLat ?? 0) - (nextItem.rawLat ?? 0));
      if (Number.isFinite(lngDelta) && Number.isFinite(latDelta)) {
        if (lngDelta > COORD_EPSILON || latDelta > COORD_EPSILON) {
          return true;
        }
      }
    }

    return false;
  }

  buildBivouacLogSummary(distances) {
    if (!Array.isArray(distances) || !distances.length) {
      return [];
    }

    if (!turfApi) {
      return [];
    }

    const geometry = this.routeGeojson?.geometry;
    const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : null;
    if (!coordinates || coordinates.length < 2) {
      return [];
    }

    const totalDistance = Number(this.routeProfile?.totalDistanceKm);
    if (!Number.isFinite(totalDistance) || totalDistance <= ROUTE_CUT_EPSILON_KM) {
      return [];
    }

    const roundPixel = (value) => (Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null);

    return distances
      .map((value, index) => {
        const distanceKm = Number(value);
        if (!Number.isFinite(distanceKm)) {
          return null;
        }

        const clamped = Math.max(0, Math.min(distanceKm, totalDistance));
        let coords = null;

        try {
          const point = turfApi.along(geometry, clamped, { units: 'kilometers' });
          coords = Array.isArray(point?.geometry?.coordinates) ? point.geometry.coordinates : null;
        } catch (error) {
          console.warn('Failed to compute bivouac position', error);
          return null;
        }

        if (!coords || coords.length < 2) {
          return null;
        }

        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
          return null;
        }

        const roundedLng = Math.round(lng * 1e6) / 1e6;
        const roundedLat = Math.round(lat * 1e6) / 1e6;
        const projected =
          this.map && typeof this.map.project === 'function'
            ? this.map.project(new maplibregl.LngLat(lng, lat))
            : null;

        return {
          order: index + 1,
          id: `bivouac-${index + 1}`,
          label: `Bivouac ${index + 1}`,
          distanceKm: Math.round(clamped * 1000) / 1000,
          originalDistanceKm: Math.round(distanceKm * 1000) / 1000,
          lng: roundedLng,
          lat: roundedLat,
          rawLng: lng,
          rawLat: lat,
          x: roundPixel(projected?.x),
          y: roundPixel(projected?.y)
        };
      })
      .filter(Boolean);
  }

  haveBivouacSummariesChanged(previous = [], next = []) {
    if (!Array.isArray(previous) || !Array.isArray(next)) {
      return true;
    }

    if (previous.length !== next.length) {
      return true;
    }

    for (let index = 0; index < previous.length; index += 1) {
      const prev = previous[index];
      const nextItem = next[index];
      if (!prev || !nextItem) {
        return true;
      }

      if (prev.id !== nextItem.id) {
        return true;
      }

      const lngDelta = Math.abs((prev.rawLng ?? 0) - (nextItem.rawLng ?? 0));
      const latDelta = Math.abs((prev.rawLat ?? 0) - (nextItem.rawLat ?? 0));
      if (Number.isFinite(lngDelta) && Number.isFinite(latDelta)) {
        if (lngDelta > COORD_EPSILON || latDelta > COORD_EPSILON) {
          return true;
        }
      }

      const distanceDelta = Math.abs((prev.distanceKm ?? 0) - (nextItem.distanceKm ?? 0));
      if (Number.isFinite(distanceDelta) && distanceDelta > ROUTE_CUT_EPSILON_KM / 10) {
        return true;
      }
    }

    return false;
  }

  areLoggedWaypointsEqual(previous, next) {
    if (!previous || !next) {
      return false;
    }

    const prevRaw = Array.isArray(previous.raw) ? previous.raw : null;
    const nextRaw = Array.isArray(next.raw) ? next.raw : null;
    if (prevRaw && nextRaw) {
      const lngDelta = Math.abs(prevRaw[0] - nextRaw[0]);
      const latDelta = Math.abs(prevRaw[1] - nextRaw[1]);
      if (Number.isFinite(lngDelta) && Number.isFinite(latDelta) && lngDelta <= COORD_EPSILON && latDelta <= COORD_EPSILON) {
        return true;
      }
    }

    if (Array.isArray(previous.rounded) && Array.isArray(next.rounded)) {
      if (previous.rounded[0] === next.rounded[0] && previous.rounded[1] === next.rounded[1]) {
        return true;
      }
    }

    if (typeof previous.string === 'string' && typeof next.string === 'string') {
      return previous.string === next.string;
    }

    return false;
  }

  computeWaypointDeltaMeters(previous, next) {
    if (!previous?.raw || !next?.raw || !turfApi) {
      return null;
    }

    try {
      const distance = turfApi.distance(
        turfApi.point(previous.raw),
        turfApi.point(next.raw),
        { units: 'meters' }
      );
      if (Number.isFinite(distance)) {
        return Math.round(distance * 100) / 100;
      }
    } catch (error) {
      console.warn('Failed to compute waypoint delta distance', error);
    }

    return null;
  }

  snapWaypointsToRoute() {
    if (!Array.isArray(this.waypoints) || this.waypoints.length < 2) {
      return false;
    }

    const normalizeCoord = (coord) => {
      if (!Array.isArray(coord) || coord.length < 2) {
        return null;
      }
      const lng = Number(coord[0]);
      const lat = Number(coord[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return null;
      }
      const elevation = coord.length > 2 && Number.isFinite(coord[2]) ? Number(coord[2]) : null;
      return Number.isFinite(elevation) ? [lng, lat, elevation] : [lng, lat];
    };

    const normalizedWaypoints = this.waypoints.map((coord) => normalizeCoord(coord) ?? coord);
    const routeCoords = Array.isArray(this.routeProfile?.coordinates)
      ? this.routeProfile.coordinates.filter((coord) => Array.isArray(coord) && coord.length >= 2)
      : [];

    const shouldSnapToRoute = this.currentMode !== 'manual' && routeCoords.length >= 2;
    const applyCoordinateUpdate = (coord, index) => {
      if (!Array.isArray(coord) || coord.length < 2) {
        return false;
      }
      const current = this.waypoints[index];
      const hasComparableCurrent = Array.isArray(current) && current.length >= 2;
      const lengthChanged = !Array.isArray(current) || current.length !== coord.length;
      const differs = hasComparableCurrent ? !this.coordinatesMatch(current, coord) : true;
      if (lengthChanged || differs) {
        this.waypoints[index] = coord.slice();
        return true;
      }
      return false;
    };

    let changed = false;

    if (shouldSnapToRoute) {
      const toleranceMeters = Math.max(75, WAYPOINT_MATCH_TOLERANCE_METERS || 0);
      const lastWaypointIndex = normalizedWaypoints.length - 1;
      let searchStartIndex = 0;

      normalizedWaypoints.forEach((waypoint, index) => {
        if (!Array.isArray(waypoint) || waypoint.length < 2) {
          return;
        }

        let targetCoord = null;
        if (index === 0) {
          targetCoord = routeCoords[0];
          searchStartIndex = 0;
        } else if (index === lastWaypointIndex) {
          targetCoord = routeCoords[routeCoords.length - 1];
        } else {
          let bestIndex = null;
          let bestDistance = Infinity;
          for (let routeIndex = searchStartIndex; routeIndex < routeCoords.length; routeIndex += 1) {
            const candidate = routeCoords[routeIndex];
            if (!Array.isArray(candidate) || candidate.length < 2) {
              continue;
            }
            const distance = this.computeCoordinateDistanceMeters(waypoint, candidate);
            if (!Number.isFinite(distance)) {
              continue;
            }
            if (distance < bestDistance) {
              bestDistance = distance;
              bestIndex = routeIndex;
            }
            if (distance <= toleranceMeters) {
              break;
            }
          }

          if (bestIndex !== null) {
            targetCoord = routeCoords[bestIndex];
            searchStartIndex = bestIndex;
          }
        }

        const normalizedTarget = normalizeCoord(targetCoord) ?? waypoint;
        if (applyCoordinateUpdate(normalizedTarget, index)) {
          changed = true;
        }
      });

      return changed;
    }

    normalizedWaypoints.forEach((coord, index) => {
      if (applyCoordinateUpdate(normalizeCoord(coord) ?? coord, index)) {
        changed = true;
      }
    });

    return changed;
  }

  addRouteCut(distanceKm, coordinates = null) {
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

    const exists = Array.isArray(this.routeCutDistances) && this.routeCutDistances.some((cut) => {
      const value = Number(cut?.distanceKm ?? cut);
      return Number.isFinite(value) && Math.abs(value - clamped) <= ROUTE_CUT_EPSILON_KM / 2;
    });
    if (exists) {
      return;
    }

    this.recordWaypointState();
    let targetCoordinates = null;
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      targetCoordinates = coordinates;
    } else {
      targetCoordinates = this.getCoordinateAtDistance(clamped);
    }
    const lng = Number(targetCoordinates?.[0]);
    const lat = Number(targetCoordinates?.[1]);
    const nextCuts = Array.isArray(this.routeCutDistances) ? [...this.routeCutDistances] : [];
    nextCuts.push({
      distanceKm: clamped,
      lng: Number.isFinite(lng) ? lng : null,
      lat: Number.isFinite(lat) ? lat : null
    });
    this.setRouteCutDistances(nextCuts);
    this.updateCutDisplays();
  }

  mirrorRouteCutsForReversedRoute() {
    if (!this.routeProfile || !Array.isArray(this.routeCutDistances) || !this.routeCutDistances.length) {
      return;
    }

    const totalDistance = Number(this.routeProfile.totalDistanceKm);
    if (!Number.isFinite(totalDistance) || totalDistance <= ROUTE_CUT_EPSILON_KM) {
      return;
    }

    const mirrored = Array.isArray(this.routeCutDistances)
      ? this.routeCutDistances
          .map((entry) => this.normalizeRouteCutEntry(entry))
          .filter((entry) => entry && Number.isFinite(entry.distanceKm))
          .map((entry) => ({
            distanceKm: totalDistance - entry.distanceKm,
            lng: Number.isFinite(entry.lng) ? entry.lng : null,
            lat: Number.isFinite(entry.lat) ? entry.lat : null
          }))
          .filter((entry) => entry.distanceKm > ROUTE_CUT_EPSILON_KM
            && totalDistance - entry.distanceKm > ROUTE_CUT_EPSILON_KM)
          .sort((a, b) => a.distanceKm - b.distanceKm)
      : [];

    this.setRouteCutDistances(mirrored);
  }

  updateDraggedBivouac(distanceKm, coordinates = null) {
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

    const prevEntry = index > 0 ? this.routeCutDistances[index - 1] : null;
    const nextEntry = index < this.routeCutDistances.length - 1 ? this.routeCutDistances[index + 1] : null;
    const prevDistance = index > 0 ? Number(prevEntry?.distanceKm ?? prevEntry) : 0;
    const nextDistance = index < this.routeCutDistances.length - 1
      ? Number(nextEntry?.distanceKm ?? nextEntry)
      : totalDistance;
    if ((index > 0 && !Number.isFinite(prevDistance))
      || (index < this.routeCutDistances.length - 1 && !Number.isFinite(nextDistance))) {
      return;
    }

    const minDistance = index > 0 ? prevDistance + ROUTE_CUT_EPSILON_KM : ROUTE_CUT_EPSILON_KM;
    const maxDistance = index < this.routeCutDistances.length - 1
      ? nextDistance - ROUTE_CUT_EPSILON_KM
      : totalDistance - ROUTE_CUT_EPSILON_KM;
    if (maxDistance <= minDistance) {
      return;
    }

    const clamped = Math.max(minDistance, Math.min(maxDistance, distanceKm));
    if (!Number.isFinite(clamped)) {
      return;
    }

    const currentEntry = this.routeCutDistances[index];
    const currentDistance = Number(currentEntry?.distanceKm ?? currentEntry);
    const hasCoordinateUpdate = Array.isArray(coordinates) && coordinates.length >= 2;
    if (!hasCoordinateUpdate && Number.isFinite(currentDistance) && Math.abs(currentDistance - clamped) <= 1e-5) {
      return;
    }

    let targetCoordinates = null;
    if (hasCoordinateUpdate) {
      targetCoordinates = coordinates;
    } else {
      targetCoordinates = this.getCoordinateAtDistance(clamped);
    }
    const lng = Number(targetCoordinates?.[0]);
    const lat = Number(targetCoordinates?.[1]);

    const nextCuts = [...this.routeCutDistances];
    nextCuts[index] = {
      distanceKm: clamped,
      lng: Number.isFinite(lng) ? lng : null,
      lat: Number.isFinite(lat) ? lat : null
    };
    this.setRouteCutDistances(nextCuts);
    this.updateCutDisplays();
  }

  finishBivouacDrag(lngLat) {
    const previewLngLat = Array.isArray(this.draggedBivouacLngLat)
      ? this.draggedBivouacLngLat
      : null;
    let target = null;

    const hasDraggedCut = Number.isInteger(this.draggedBivouacIndex)
      && this.draggedBivouacIndex >= 0
      && Array.isArray(this.routeCutDistances)
      && this.routeCutDistances.length > this.draggedBivouacIndex;
    if (hasDraggedCut) {
      this.recordWaypointState();
    }

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
        const projectedCoordinates = projection.projection?.coordinates;
        this.updateDraggedBivouac(projection.distanceKm, projectedCoordinates);
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

    this.addRouteCut(projection.distanceKm, projection.projection?.coordinates);
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

  ensurePanelVisible() {
    if (this.directionsControl && !this.isPanelVisible()) {
      this.directionsControl.classList.add('visible');
      this.directionsToggle?.classList.add('active');
      this.updatePanelVisibilityState();
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
      const coords = [event.lngLat.lng, event.lngLat.lat];
      this.waypoints[this.draggedWaypointIndex] = this.buildWaypointCoordinate(coords) ?? coords;
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
    const movedWaypointIndex = this.draggedWaypointIndex;
    const movedBivouac = this.draggedBivouacIndex !== null;
    this.isDragging = false;
    this.draggedWaypointIndex = null;
    this.map.dragPan?.enable();
    this.setHoveredWaypointIndex(null);
    if (movedWaypoint && this.waypoints.length >= 2) {
      const startLeg = Math.max(0, movedWaypointIndex - 1);
      const endLeg = Math.min(this.waypoints.length - 2, movedWaypointIndex);
      this.invalidateCachedLegSegments({ startIndex: startLeg, endIndex: endLeg });
      this.getRoute();
    }
    if (movedBivouac) {
      const releaseLngLat = event?.lngLat ?? null;
      this.finishBivouacDrag(releaseLngLat);
    }
    this.draggedBivouacIndex = null;
  }

  async onMapClick(event) {
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

    let targetLngLat = [event.lngLat.lng, event.lngLat.lat];
    if (this.currentMode !== 'manual') {
      const snapped = await this.snapLngLatToNetwork(event.lngLat);
      if (Array.isArray(snapped) && snapped.length >= 2
        && Number.isFinite(snapped[0])
        && Number.isFinite(snapped[1])) {
        targetLngLat = [snapped[0], snapped[1]];
      }
    }
    this.recordWaypointState();
    const waypoint = this.buildWaypointCoordinate(targetLngLat) ?? targetLngLat.slice();
    this.waypoints.push(waypoint);
    this.updateWaypoints();
    if (this.waypoints.length === 1) {
      this.prepareNetwork({ reason: 'first-waypoint' });
    } else if (this.waypoints.length >= 2) {
      this.getRoute();
    }
    this.updateModeAvailability();
  }

  onWaypointDoubleClick(event) {
    if (!this.isPanelVisible()) return;
    const index = Number(event.features?.[0]?.properties.index);
    if (!Number.isFinite(index) || index <= 0 || index >= this.waypoints.length - 1) return;
    this.recordWaypointState();
    const removalIndex = index;
    const startLeg = Math.max(0, removalIndex - 1);
    const endLeg = Math.min(this.waypoints.length - 2, removalIndex);
    this.invalidateCachedLegSegments({ startIndex: startLeg, endIndex: endLeg });
    this.waypoints.splice(removalIndex, 1);
    this.shiftCachedLegSegments(removalIndex + 1, -1);
    this.updateWaypoints();
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

  async addViaWaypoint(lngLat, projectionOverride = null) {
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

    this.recordWaypointState();
    const waypoint = this.buildWaypointCoordinate(snapped) ?? snapped;
    this.waypoints.splice(insertIndex, 0, waypoint);
    this.shiftCachedLegSegments(insertIndex, 1);
    const startLeg = Math.max(0, insertIndex - 1);
    const endLeg = Math.min(this.waypoints.length - 2, insertIndex);
    this.invalidateCachedLegSegments({ startIndex: startLeg, endIndex: endLeg });
    this.updateWaypoints();
    this.resetSegmentHover();
    await this.prepareNetwork({ reason: 'via-inserted' });
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
    const startFallback = '#2f8f3b';
    const endFallback = '#d64545';
    const viaFallback = this.cutSegments?.[0]?.color ?? fallback;
    const preferFallback = () => {
      if (isStart) {
        return startFallback;
      }
      if (isEnd) {
        return endFallback;
      }
      return viaFallback;
    };

    if (!Array.isArray(this.routeSegments) || !this.routeSegments.length) {
      return preferFallback();
    }

    let distanceKm = null;
    if (isStart) {
      distanceKm = 0;
    } else if (isEnd) {
      const totalDistance = Number(this.routeProfile?.totalDistanceKm);
      distanceKm = Number.isFinite(totalDistance) ? totalDistance : null;
    }

    try {
      if (!Number.isFinite(distanceKm)) {
        const lngLat = toLngLat(coords);
        const projection = this.projectOntoRoute(lngLat, ROUTE_CLICK_PIXEL_TOLERANCE);
        if (projection && Number.isFinite(projection.distanceKm)) {
          distanceKm = projection.distanceKm;
        }
      }

      if (Number.isFinite(distanceKm)) {
        const colorValue = this.getColorForDistance(distanceKm);
        const trimmed = typeof colorValue === 'string' ? colorValue.trim() : '';
        if (trimmed) {
          return trimmed;
        }
      }
    } catch (error) {
      console.warn('Failed to resolve waypoint color', error);
    }

    return preferFallback();
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

  canQueryTerrainElevation() {
    if (!this.map || typeof this.map.queryTerrainElevation !== 'function') {
      return false;
    }
    if (typeof this.map.getTerrain === 'function') {
      const terrain = this.map.getTerrain();
      if (!terrain || !terrain.source) {
        return false;
      }
      if (Number.isFinite(terrain.exaggeration) && terrain.exaggeration <= 0) {
        return false;
      }
    }
    return true;
  }

  queryTerrainElevationValue(coord) {
    if (!Array.isArray(coord) || coord.length < 2) {
      return null;
    }
    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return null;
    }
    if (!this.map || typeof this.map.queryTerrainElevation !== 'function') {
      return null;
    }
    if (!this.canQueryTerrainElevation()) {
      return null;
    }
    try {
      const elevation = this.map.queryTerrainElevation([lng, lat]);
      return Number.isFinite(elevation) ? elevation : null;
    } catch (error) {
      if (!this.terrainElevationErrorLogged) {
        console.warn('Failed to query terrain elevation', error);
        this.terrainElevationErrorLogged = true;
      }
      return null;
    }
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
      this.updateElevationHoverReadout(null);
      return;
    }

    const segmentIndex = this.findSegmentIndexByDistance(distanceKm);
    if (!Number.isInteger(segmentIndex)) {
      this.resetSegmentHover(source ?? undefined);
      this.updateElevationHoverReadout(null);
      return;
    }

    const segment = this.routeSegments?.[segmentIndex];
    if (!segment) {
      this.resetSegmentHover(source ?? undefined);
      this.updateElevationHoverReadout(null);
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

    this.updateElevationHoverReadout(distanceKm);
    this.showRouteHoverOnSegment(segmentIndex, { t, distanceKm }, { source });
  }

  buildRouteProfile(coordinates = []) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return null;
    }

    const sanitized = [];
    for (const coord of coordinates) {
      if (!Array.isArray(coord) || coord.length < 2) {
        continue;
      }
      const lng = Number(coord[0]);
      const lat = Number(coord[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        continue;
      }
      const rawElevation = coord.length > 2 ? Number(coord[2]) : null;
      const normalizedElevation = Number.isFinite(rawElevation) ? rawElevation : null;
      sanitized.push([lng, lat, normalizedElevation]);
    }

    if (sanitized.length < 2) {
      return null;
    }

    const canQueryTerrain = this.canQueryTerrainElevation();
    if (canQueryTerrain) {
      this.terrainElevationErrorLogged = false;
    }

    for (let index = 0; index < sanitized.length; index += 1) {
      const coord = sanitized[index];
      let elevation = Number.isFinite(coord[2]) ? coord[2] : null;
      if (canQueryTerrain) {
        const terrainElevation = this.queryTerrainElevationValue(coord);
        if (Number.isFinite(terrainElevation)) {
          elevation = terrainElevation;
        }
      }
      coord[2] = Number.isFinite(elevation) ? elevation : null;
    }

    const cumulativeDistances = new Array(sanitized.length).fill(0);
    let totalDistance = 0;

    for (let index = 1; index < sanitized.length; index += 1) {
      const segmentDistance = this.computeDistanceKm(sanitized[index - 1], sanitized[index]);
      totalDistance += Number.isFinite(segmentDistance) ? segmentDistance : 0;
      cumulativeDistances[index] = totalDistance;
    }

    const elevations = sanitized.map((coord) => {
      const elevation = coord?.[2];
      return Number.isFinite(elevation) ? elevation : null;
    });

    return {
      coordinates: sanitized,
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

  buildElevationAreaPaths(samples, yAxis, domain) {
    const distances = Array.isArray(this.routeProfile?.cumulativeDistances)
      ? this.routeProfile.cumulativeDistances
      : [];
    const elevations = Array.isArray(this.routeProfile?.elevations)
      ? this.routeProfile.elevations
      : [];
    const range = Math.max(Number.EPSILON, yAxis.max - yAxis.min);
    const points = [];

    const domainMin = Number.isFinite(domain?.min) ? domain.min : 0;
    const domainMax = Number.isFinite(domain?.max) ? domain.max : domainMin;
    const domainSpan = domainMax - domainMin;
    const safeSpan = domainSpan === 0 ? 1 : domainSpan;

    const pushPoint = (distance, elevation) => {
      if (!Number.isFinite(elevation)) {
        return;
      }
      let ratio = 0;
      if (domainSpan !== 0 && Number.isFinite(distance)) {
        ratio = (distance - domainMin) / safeSpan;
      }
      const clampedRatio = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
      const clampedElevation = Math.min(yAxis.max, Math.max(yAxis.min, elevation));
      const normalized = range > 0 ? (clampedElevation - yAxis.min) / range : 0;
      const x = clampedRatio * 100;
      const y = 100 - normalized * 100;
      if (points.length && Math.abs(points[points.length - 1].x - x) < 0.01) {
        points[points.length - 1] = { x, y };
      } else {
        points.push({ x, y });
      }
    };

    if (distances.length && distances.length === elevations.length) {
      const lastIndex = distances.length - 1;
      for (let index = 0; index < distances.length; index += 1) {
        const distanceKm = Number(distances[index]);
        const elevation = Number(elevations[index]);
        if (!Number.isFinite(elevation)) {
          continue;
        }
        if (Number.isFinite(distanceKm)) {
          pushPoint(distanceKm, elevation);
        } else if (lastIndex > 0) {
          const fallbackDistance = domainMin + (domainSpan * index) / lastIndex;
          pushPoint(fallbackDistance, elevation);
        } else {
          pushPoint(domainMin, elevation);
        }
      }
    }

    if (points.length < 2 && Array.isArray(samples) && samples.length) {
      samples.forEach((sample, index) => {
        const elevation = Number(sample.elevation);
        if (!Number.isFinite(elevation)) {
          return;
        }
        const start = Number(sample.startDistanceKm);
        const end = Number(sample.endDistanceKm);
        if (Number.isFinite(start)) {
          pushPoint(start, elevation);
        } else {
          const fallbackStart = domainMin + (domainSpan * index) / Math.max(1, samples.length - 1);
          pushPoint(fallbackStart, elevation);
        }
        if (Number.isFinite(end)) {
          pushPoint(end, elevation);
        } else {
          const fallbackEnd = domainMin + (domainSpan * (index + 1)) / Math.max(1, samples.length);
          pushPoint(fallbackEnd, elevation);
        }
      });
    }

    if (points.length < 2) {
      return { fill: '', stroke: '' };
    }

    points.sort((a, b) => a.x - b.x);

    const normalized = [];
    points.forEach((point) => {
      const last = normalized[normalized.length - 1];
      if (!last || Math.abs(last.x - point.x) > 0.01) {
        normalized.push(point);
      } else {
        normalized[normalized.length - 1] = point;
      }
    });

    if (!normalized.length) {
      return { fill: '', stroke: '' };
    }

    if (normalized[0].x > 0.01) {
      normalized.unshift({ x: 0, y: normalized[0].y });
    }
    const lastPoint = normalized[normalized.length - 1];
    if (lastPoint.x < 99.99) {
      normalized.push({ x: 100, y: lastPoint.y });
    }

    const strokePath = normalized
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`)
      .join(' ');

    const fillParts = ['M 0 100'];
    if (normalized[0].x > 0) {
      fillParts.push(`L ${normalized[0].x.toFixed(3)} 100`);
    }
    normalized.forEach((point) => {
      fillParts.push(`L ${point.x.toFixed(3)} ${point.y.toFixed(3)}`);
    });
    fillParts.push('L 100 100', 'Z');

    return {
      fill: fillParts.join(' '),
      stroke: strokePath
    };
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
    this.updateElevationHoverReadout(distanceKm);
    this.showRouteHoverAtDistance(distanceKm, { source: 'chart' });
  }

  onElevationPointerLeave() {
    this.lastElevationHoverDistance = null;
    this.resetSegmentHover('chart');
    this.updateElevationHoverReadout(null);
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
    this.updateElevationHoverReadout(null);
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

    const metadata = this.getSegmentMetadata(segment);
    const detailItems = [];
    detailItems.push(`<span class="tooltip-altitude">Alt. ${escapeHtml(altitudeLabel)}</span>`);
    detailItems.push(`<span class="tooltip-grade">${escapeHtml(gradeLabel)}</span>`);

    if (metadata) {
      const sacLabel = formatSacScaleLabel(metadata.sacScale);
      if (sacLabel) {
        detailItems.push(`<span class="tooltip-sac">Difficulty: ${escapeHtml(sacLabel)}</span>`);
      }
      const surfaceLabel = formatSurfaceLabel(metadata.surface);
      if (surfaceLabel) {
        detailItems.push(`<span class="tooltip-surface">Surface: ${escapeHtml(surfaceLabel)}</span>`);
      }
      const trailLabel = formatTrailVisibilityLabel(metadata.trailVisibility);
      if (trailLabel) {
        detailItems.push(`<span class="tooltip-trail">Visibility: ${escapeHtml(trailLabel)}</span>`);
      }
    }

    const detailsMarkup = detailItems.join('');

    tooltip.innerHTML = `
      <div class="tooltip-distance">${escapeHtml(distanceLabel)} km</div>
      <div class="tooltip-details">
        ${detailsMarkup}
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
    this.routeGeojson = null;
    this.routeSegments = [];
    this.segmentLegLookup = [];
    this.cachedLegSegments = new Map();
    this.latestMetrics = null;
    this.routeProfile = null;
    this.routeCoordinateMetadata = [];
    this.elevationSamples = [];
    this.elevationDomain = null;
    this.elevationYAxis = null;
    this.setRoutePointsOfInterest([]);
    this.pendingPoiRequest = null;
    this.resetRouteCuts();
    this.detachElevationChartEvents();
    this.elevationChartContainer = null;
    this.elevationHoverReadout = null;
    this.highlightedElevationBar = null;
    this.lastElevationHoverDistance = null;
    this.draggedBivouacIndex = null;
    this.draggedBivouacLngLat = null;

    this.profileSegments = [];
    this.updateRouteLineSource();
    this.map.getSource('distance-markers-source')?.setData(EMPTY_COLLECTION);
    this.map.getSource('route-segments-source')?.setData(EMPTY_COLLECTION);
    this.clearHover();
    this.updateWaypoints();
    this.notifyRouteSegmentsUpdated();
  }

  clearDirections() {
    this.waypoints = [];
    this.draggedBivouacLngLat = null;
    this.updateWaypoints();
    this.clearRoute();
    this.updateStats(null);
    this.updateElevationProfile([]);
    this.routeCoordinateMetadata = [];
    this.profileSegments = [];
    this.updateRouteLineSource();
    this.draggedWaypointIndex = null;
    this.draggedBivouacIndex = null;
    this.setHoveredWaypointIndex(null);
    this.waypointHistory = [];
    this.waypointRedoHistory = [];
    this.updateUndoAvailability();
  }

  normalizeImportedCoordinate(coord) {
    if (!Array.isArray(coord) || coord.length < 2) {
      return null;
    }
    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return null;
    }
    const normalized = [lng, lat];
    if (coord.length > 2) {
      const elevation = Number(coord[2]);
      if (Number.isFinite(elevation)) {
        normalized.push(elevation);
      }
    }
    return normalized;
  }

  normalizeImportedSequence(coords) {
    if (!Array.isArray(coords)) {
      return [];
    }
    const sequence = [];
    coords.forEach((coord) => {
      const normalized = this.normalizeImportedCoordinate(coord);
      if (!normalized) {
        return;
      }
      if (sequence.length && this.coordinatesMatch(sequence[sequence.length - 1], normalized)) {
        return;
      }
      sequence.push(normalized);
    });
    return sequence;
  }

  mergeImportedCoordinateSegments(segments) {
    if (!Array.isArray(segments)) {
      return [];
    }
    const merged = [];
    segments.forEach((segment) => {
      const sequence = this.normalizeImportedSequence(segment);
      if (!sequence.length) {
        return;
      }
      if (!merged.length) {
        sequence.forEach((coord) => merged.push(coord));
        return;
      }
      const last = merged[merged.length - 1];
      const startIndex = this.coordinatesMatch(last, sequence[0]) ? 1 : 0;
      for (let index = startIndex; index < sequence.length; index += 1) {
        const coord = sequence[index];
        if (merged.length && this.coordinatesMatch(merged[merged.length - 1], coord)) {
          continue;
        }
        merged.push(coord);
      }
    });
    return merged;
  }

  estimateSequenceDistanceKm(coords) {
    if (!Array.isArray(coords) || coords.length < 2) {
      return 0;
    }
    let totalMeters = 0;
    for (let index = 0; index < coords.length - 1; index += 1) {
      const distance = this.computeCoordinateDistanceMeters(coords[index], coords[index + 1]);
      if (Number.isFinite(distance)) {
        totalMeters += distance;
      }
    }
    return totalMeters / 1000;
  }

  deriveWaypointsFromImportedSequence(coords, options = {}) {
    const sequence = this.normalizeImportedSequence(coords);
    if (sequence.length < 2) {
      return sequence;
    }

    const totalDistanceKm = this.estimateSequenceDistanceKm(sequence);
    const maxWaypoints = Number.isInteger(options.maxWaypoints) && options.maxWaypoints >= 2
      ? options.maxWaypoints
      : 60;
    const desiredSpacing = maxWaypoints > 1 && totalDistanceKm > 0
      ? (totalDistanceKm * 1000) / (maxWaypoints - 1)
      : 0;
    const minSpacingMeters = Math.max(120, Math.min(800, desiredSpacing || 250));
    const angleThreshold = Number.isFinite(options.angleThresholdDegrees)
      ? options.angleThresholdDegrees
      : 28;

    const waypoints = [];
    const pushWaypoint = (coord) => {
      if (!Array.isArray(coord) || coord.length < 2) {
        return;
      }
      const waypoint = coord.length > 2
        ? [coord[0], coord[1], coord[2]]
        : [coord[0], coord[1]];
      if (waypoints.length && this.coordinatesMatch(waypoints[waypoints.length - 1], waypoint)) {
        return;
      }
      waypoints.push(waypoint);
    };

    pushWaypoint(sequence[0]);
    let lastIndex = 0;
    let accumulatedDistance = 0;

    for (let index = 1; index < sequence.length - 1; index += 1) {
      const current = sequence[index];
      const previous = sequence[lastIndex];
      const next = sequence[index + 1];
      const segmentDistance = this.computeCoordinateDistanceMeters(previous, current)
        || haversineDistanceMeters(previous, current)
        || 0;
      accumulatedDistance += segmentDistance;

      let include = accumulatedDistance >= minSpacingMeters;

      if (!include && previous && next) {
        const bearingPrev = bearingBetween(previous, current);
        const bearingNext = bearingBetween(current, next);
        if (Number.isFinite(bearingPrev) && Number.isFinite(bearingNext)) {
          let delta = Math.abs(bearingNext - bearingPrev);
          if (delta > 180) {
            delta = 360 - delta;
          }
          if (delta >= angleThreshold) {
            include = true;
          }
        }
      }

      if (!include && previous && next) {
        const nextDistance = this.computeCoordinateDistanceMeters(current, next)
          || haversineDistanceMeters(current, next)
          || 0;
        if (nextDistance >= minSpacingMeters * 1.5) {
          include = true;
        }
      }

      if (include) {
        pushWaypoint(current);
        lastIndex = index;
        accumulatedDistance = 0;
      }
    }

    pushWaypoint(sequence[sequence.length - 1]);

    if (waypoints.length > maxWaypoints) {
      const step = (waypoints.length - 1) / (maxWaypoints - 1);
      const reduced = [];
      for (let i = 0; i < maxWaypoints; i += 1) {
        const targetIndex = Math.min(waypoints.length - 1, Math.round(i * step));
        const coord = waypoints[targetIndex];
        if (!reduced.length || !this.coordinatesMatch(reduced[reduced.length - 1], coord)) {
          reduced.push(coord.slice());
        }
      }
      if (!this.coordinatesMatch(reduced[reduced.length - 1], waypoints[waypoints.length - 1])) {
        reduced.push(waypoints[waypoints.length - 1].slice());
      }
      return reduced;
    }

    return waypoints;
  }

  extractRouteFromGeojson(geojson) {
    if (!geojson) {
      return null;
    }

    const candidates = [];
    const pushCandidate = (coordinates, properties = {}) => {
      const sequence = this.normalizeImportedSequence(coordinates);
      if (sequence.length < 2) {
        return;
      }
      const distanceKm = this.estimateSequenceDistanceKm(sequence);
      const source = typeof properties.source === 'string' ? properties.source : null;
      let priority = 1;
      if (source === 'track') {
        priority = 3;
      } else if (source === 'route') {
        priority = 2;
      }
      candidates.push({
        coordinates: sequence.map((coord) => coord.slice()),
        properties: { ...properties },
        distanceKm,
        priority
      });
    };

    const handleGeometry = (geometry, properties = {}) => {
      if (!geometry || typeof geometry !== 'object') {
        return;
      }
      if (geometry.type === 'LineString') {
        pushCandidate(geometry.coordinates, properties);
        return;
      }
      if (geometry.type === 'MultiLineString') {
        const merged = this.mergeImportedCoordinateSegments(geometry.coordinates);
        if (merged.length >= 2) {
          pushCandidate(merged, properties);
        }
        return;
      }
      if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
        geometry.geometries.forEach((child) => handleGeometry(child, properties));
      }
    };

    if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
      geojson.features.forEach((feature) => {
        if (!feature || !feature.geometry) {
          return;
        }
        handleGeometry(feature.geometry, feature.properties || {});
      });
    } else if (geojson.type === 'Feature') {
      handleGeometry(geojson.geometry, geojson.properties || {});
    } else if (geojson.type === 'LineString' || geojson.type === 'MultiLineString' || geojson.type === 'GeometryCollection') {
      handleGeometry(geojson, {});
    }

    if (!candidates.length) {
      return null;
    }

    candidates.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      if (Number.isFinite(b.distanceKm) && Number.isFinite(a.distanceKm) && b.distanceKm !== a.distanceKm) {
        return b.distanceKm - a.distanceKm;
      }
      return (b.coordinates.length || 0) - (a.coordinates.length || 0);
    });

    const best = candidates[0];
    const properties = { ...(best.properties || {}) };
    return {
      coordinates: best.coordinates,
      properties,
      distanceKm: best.distanceKm
    };
  }

  importRouteFromGeojson(geojson, options = {}) {
    const candidate = this.extractRouteFromGeojson(geojson);
    if (!candidate || !Array.isArray(candidate.coordinates) || candidate.coordinates.length < 2) {
      console.warn('No route geometry found in imported data');
      return false;
    }

    const waypoints = this.deriveWaypointsFromImportedSequence(candidate.coordinates, options);
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      console.warn('Imported route did not contain enough distinct coordinates');
      return false;
    }

    this.clearDirections();
    this.ensurePanelVisible();
    this.waypoints = waypoints.map((coord) => coord.slice());

    const routeFeature = {
      type: 'Feature',
      properties: {
        ...(candidate.properties || {}),
        source: candidate.properties?.source || 'imported-route',
        name: candidate.properties?.name || options.name || null
      },
      geometry: {
        type: 'LineString',
        coordinates: candidate.coordinates.map((coord) => coord.slice())
      }
    };

    this.applyRoute(routeFeature);
    this.updateWaypoints();
    this.updateModeAvailability();
    this.prepareNetwork({ reason: 'imported-route' }).catch(() => {});
    return true;
  }

  setTransportMode(mode) {
    if (!this.modeColors[mode]) return;
    if (this.router && typeof this.router.supportsMode === 'function' && !this.router.supportsMode(mode)) {
      return;
    }
    const previousMode = this.currentMode;
    this.currentMode = mode;
    this.transportModes.forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === mode);
    });
    if (this.map.getLayer('route-line')) {
      this.map.setPaintProperty(
        'route-line',
        'line-color',
        ['coalesce', ['get', 'color'], this.modeColors[this.currentMode]]
      );
      this.setRouteLineGradient();
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
    if (this.waypoints.length >= 2) {
      const preserveExistingRoute = mode === 'manual' && previousMode !== 'manual';
      if (!preserveExistingRoute) {
        const lastLegIndex = Math.max(0, this.waypoints.length - 2);
        this.invalidateCachedLegSegments({ startIndex: lastLegIndex });
        this.getRoute();
      }
    }
  }

  cacheRouteLegSegments() {
    const routeCoordinates = this.routeGeojson?.geometry?.coordinates;
    if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
      this.cachedLegSegments = new Map();
      return;
    }
    if (!Array.isArray(this.waypoints) || this.waypoints.length < 2) {
      this.cachedLegSegments = new Map();
      return;
    }

    const coords = routeCoordinates;
    const normalizedWaypoints = this.waypoints.map((coord) => {
      if (!Array.isArray(coord) || coord.length < 2) {
        return null;
      }
      const lng = Number(coord[0]);
      const lat = Number(coord[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return null;
      }
      const elevation = coord.length > 2 && Number.isFinite(coord[2]) ? coord[2] : 0;
      return [lng, lat, elevation];
    });

    const findWaypointIndex = (target, startIndex) => {
      if (!Array.isArray(target) || target.length < 2) {
        return -1;
      }
      for (let index = Math.max(0, startIndex); index < coords.length; index += 1) {
        if (this.coordinatesMatch(coords[index], target)) {
          return index;
        }
      }
      return -1;
    };

    const segments = new Map();
    let searchStart = 0;
    const segmentMetrics = Array.isArray(this.routeGeojson?.properties?.segments)
      ? this.routeGeojson.properties.segments
      : [];
    const segmentMetadataSource = Array.isArray(this.routeGeojson?.properties?.segment_metadata)
      ? this.routeGeojson.properties.segment_metadata
      : [];

    for (let waypointIndex = 0; waypointIndex < normalizedWaypoints.length - 1; waypointIndex += 1) {
      const startWaypoint = normalizedWaypoints[waypointIndex];
      const endWaypoint = normalizedWaypoints[waypointIndex + 1];
      if (!startWaypoint || !endWaypoint) {
        continue;
      }

      const startIndex = findWaypointIndex(startWaypoint, searchStart);
      if (startIndex === -1) {
        continue;
      }
      const endIndex = findWaypointIndex(endWaypoint, Math.max(startIndex, searchStart));
      if (endIndex === -1 || endIndex <= startIndex) {
        continue;
      }

      const rawSegment = coords
        .slice(startIndex, endIndex + 1)
        .map((coord) => {
          if (!Array.isArray(coord) || coord.length < 2) {
            return null;
          }
          const lng = Number(coord[0]);
          const lat = Number(coord[1]);
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            return null;
          }
          const elevation = coord.length > 2 && Number.isFinite(coord[2]) ? coord[2] : 0;
          return [lng, lat, elevation];
        })
        .filter(Boolean);

      if (!rawSegment.length) {
        continue;
      }

      if (!this.coordinatesMatch(rawSegment[0], startWaypoint)) {
        rawSegment.unshift([...startWaypoint]);
      }
      if (!this.coordinatesMatch(rawSegment[rawSegment.length - 1], endWaypoint)) {
        rawSegment.push([...endWaypoint]);
      }

      const segmentCoordinates = rawSegment;

      if (segmentCoordinates.length < 2) {
        continue;
      }

      segmentCoordinates[0] = [...startWaypoint];
      segmentCoordinates[segmentCoordinates.length - 1] = [...endWaypoint];

      const metrics = segmentMetrics[waypointIndex] || {};
      const distance = Number.isFinite(metrics?.distance) ? Number(metrics.distance) : null;
      const duration = Number.isFinite(metrics?.duration) ? Number(metrics.duration) : null;
      const ascent = Number.isFinite(metrics?.ascent) ? Number(metrics.ascent) : null;
      const descent = Number.isFinite(metrics?.descent) ? Number(metrics.descent) : null;

      const metadataEntries = Array.isArray(segmentMetadataSource[waypointIndex])
        ? segmentMetadataSource[waypointIndex]
            .map((entry) => (entry && typeof entry === 'object' ? { ...entry } : null))
            .filter((entry) => entry && !isConnectorMetadataSource(entry.source))
        : [];

      segments.set(waypointIndex, {
        startIndex: waypointIndex,
        endIndex: waypointIndex + 1,
        coordinates: segmentCoordinates,
        distance,
        duration,
        ascent,
        descent,
        metadata: metadataEntries
      });

      searchStart = endIndex;
    }

    this.cachedLegSegments = segments;
  }

  invalidateCachedLegSegments(options = null) {
    if (!(this.cachedLegSegments instanceof Map)) {
      this.cachedLegSegments = new Map();
      return;
    }

    if (!options) {
      this.cachedLegSegments.clear();
      return;
    }

    const { startIndex, endIndex } = options;
    if (!Number.isInteger(startIndex) && !Number.isInteger(endIndex)) {
      this.cachedLegSegments.clear();
      return;
    }

    const start = Number.isInteger(startIndex) ? startIndex : Number.isInteger(endIndex) ? endIndex : 0;
    const finish = Number.isInteger(endIndex) ? endIndex : start;
    for (let index = start; index <= finish; index += 1) {
      this.cachedLegSegments.delete(index);
    }
  }

  shiftCachedLegSegments(startIndex, delta) {
    if (!(this.cachedLegSegments instanceof Map)) {
      this.cachedLegSegments = new Map();
      return;
    }
    if (!Number.isInteger(startIndex) || !Number.isInteger(delta) || delta === 0) {
      return;
    }

    const updated = new Map();
    for (const [index, segment] of this.cachedLegSegments.entries()) {
      if (index < startIndex) {
        updated.set(index, segment);
        continue;
      }

      const newIndex = index + delta;
      if (newIndex < 0) {
        continue;
      }

      const adjusted = {
        ...segment,
        startIndex: newIndex,
        endIndex: newIndex + 1
      };
      updated.set(newIndex, adjusted);
    }

    this.cachedLegSegments = updated;
  }

  buildPreservedSegments() {
    if (!(this.cachedLegSegments instanceof Map) || !this.cachedLegSegments.size) {
      return [];
    }
    if (!Array.isArray(this.waypoints) || this.waypoints.length < 2) {
      return [];
    }

    const preserved = [];
    for (const segment of this.cachedLegSegments.values()) {
      if (!segment) {
        continue;
      }
      const startIndex = Number(segment.startIndex);
      const endIndex = Number(segment.endIndex);
      if (!Number.isInteger(startIndex) || endIndex !== startIndex + 1) {
        continue;
      }
      if (startIndex < 0 || endIndex >= this.waypoints.length) {
        continue;
      }
      const coordinates = Array.isArray(segment.coordinates)
        ? segment.coordinates
            .map((coord) => {
              if (!Array.isArray(coord) || coord.length < 2) {
                return null;
              }
              const lng = Number(coord[0]);
              const lat = Number(coord[1]);
              if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
                return null;
              }
              const elevation = coord.length > 2 && Number.isFinite(coord[2]) ? coord[2] : 0;
              return [lng, lat, elevation];
            })
            .filter(Boolean)
        : null;
      if (!coordinates || coordinates.length < 2) {
        continue;
      }
      const startWaypoint = this.waypoints[startIndex];
      const endWaypoint = this.waypoints[endIndex];
      if (!this.coordinatesMatch(coordinates[0], startWaypoint)
        || !this.coordinatesMatch(coordinates[coordinates.length - 1], endWaypoint)) {
        continue;
      }
      const distance = Number.isFinite(segment.distance) ? Number(segment.distance) : null;
      const duration = Number.isFinite(segment.duration) ? Number(segment.duration) : null;
      const ascent = Number.isFinite(segment.ascent) ? Number(segment.ascent) : null;
      const descent = Number.isFinite(segment.descent) ? Number(segment.descent) : null;
      const metadata = Array.isArray(segment.metadata)
        ? segment.metadata
            .map((entry) => (entry && typeof entry === 'object' ? { ...entry } : null))
            .filter((entry) => entry && !isConnectorMetadataSource(entry.source))
        : [];

      preserved.push({
        startIndex,
        endIndex,
        coordinates,
        distance,
        duration,
        ascent,
        descent,
        metadata
      });
    }

    return preserved;
  }

  rebuildSegmentData() {
    const coords = this.routeGeojson?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      this.routeSegments = [];
      this.segmentLegLookup = [];
      this.map.getSource('route-segments-source')?.setData(EMPTY_COLLECTION);
      this.resetSegmentHover();
      this.routeCoordinateMetadata = [];
      this.profileSegments = [];
      this.updateRouteLineSource();
      return;
    }

    const profile = this.routeProfile;
    const cumulative = profile?.cumulativeDistances ?? [];
    const elevations = profile?.elevations ?? [];
    const coordinateMetadata = Array.isArray(this.routeCoordinateMetadata)
      ? this.routeCoordinateMetadata.map((entry) => (entry && typeof entry === 'object' ? entry : null))
      : [];

    const metadataDistanceEntries = coordinateMetadata
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const startKm = Number(entry.startDistanceKm ?? entry.cumulativeStartKm);
        const endKm = Number(entry.endDistanceKm ?? entry.cumulativeEndKm ?? startKm);
        if (!Number.isFinite(startKm) || !Number.isFinite(endKm)) {
          return null;
        }
        return { entry, startKm, endKm };
      })
      .filter(Boolean)
      .sort((a, b) => a.startKm - b.startKm);

    const METADATA_DISTANCE_EPSILON = 1e-5;

    const deriveMetadataCategory = (metadataEntry) => {
      if (!metadataEntry || typeof metadataEntry !== 'object') {
        return null;
      }

      const hikingData = metadataEntry.hiking && typeof metadataEntry.hiking === 'object'
        ? metadataEntry.hiking
        : null;

      const sacScale = resolveSacScale(
        metadataEntry.sacScale,
        hikingData?.sacScale,
        metadataEntry.category,
        hikingData?.category,
        metadataEntry.difficulty,
        hikingData?.difficulty
      );

      const category = typeof metadataEntry.category === 'string' && metadataEntry.category
        ? metadataEntry.category
        : (typeof hikingData?.category === 'string' && hikingData.category ? hikingData.category : sacScale);

      if (typeof category === 'string' && category) {
        return normalizeSacScale(category) ?? category;
      }

      return null;
    };

    const findNeighborCategory = (metadataEntry) => {
      if (!metadataEntry) {
        return null;
      }

      const index = metadataDistanceEntries.findIndex((candidate) => candidate?.entry === metadataEntry);
      if (index === -1) {
        return null;
      }

      for (let previous = index - 1; previous >= 0; previous -= 1) {
        const candidate = metadataDistanceEntries[previous]?.entry;
        const category = deriveMetadataCategory(candidate);
        if (category) {
          return category;
        }
      }

      for (let next = index + 1; next < metadataDistanceEntries.length; next += 1) {
        const candidate = metadataDistanceEntries[next]?.entry;
        const category = deriveMetadataCategory(candidate);
        if (category) {
          return category;
        }
      }

      return null;
    };

    const resolveMetadataEntry = (segment, metadataIndex) => {
      if (!segment) {
        return null;
      }

      if (Number.isInteger(metadataIndex)
        && metadataIndex >= 0
        && metadataIndex < coordinateMetadata.length) {
        const direct = coordinateMetadata[metadataIndex];
        if (direct) {
          return direct;
        }
      }

      const segmentStartKm = Number(segment.startDistanceKm);
      const segmentEndKm = Number(segment.endDistanceKm);
      if (Number.isFinite(segmentStartKm) && Number.isFinite(segmentEndKm) && metadataDistanceEntries.length) {
        for (let index = 0; index < metadataDistanceEntries.length; index += 1) {
          const candidate = metadataDistanceEntries[index];
          if (!candidate) {
            continue;
          }
          if (segmentEndKm < candidate.startKm - METADATA_DISTANCE_EPSILON) {
            break;
          }
          if (segmentStartKm > candidate.endKm + METADATA_DISTANCE_EPSILON) {
            continue;
          }
          if (segmentStartKm >= candidate.startKm - METADATA_DISTANCE_EPSILON
            && segmentEndKm <= candidate.endKm + METADATA_DISTANCE_EPSILON) {
            return candidate.entry;
          }
        }
      }

      if (coordinateMetadata.length) {
        for (let index = 0; index < coordinateMetadata.length; index += 1) {
          const entry = coordinateMetadata[index];
          if (!entry) {
            continue;
          }
          const startMatch = this.coordinatesMatch(entry.start, segment.start);
          const endMatch = this.coordinatesMatch(entry.end, segment.end);
          if (startMatch && endMatch) {
            return entry;
          }
        }
      }

      return null;
    };

    this.routeSegments = coords.slice(0, -1).map((coord, index) => {
      const startDistanceKm = cumulative[index] ?? 0;
      const endDistanceKm = cumulative[index + 1] ?? startDistanceKm;
      const distanceKm = Math.max(0, endDistanceKm - startDistanceKm);

      const baseSegment = {
        start: coord,
        end: coords[index + 1],
        index,
        startDistanceKm,
        endDistanceKm,
        distanceKm,
        startElevation: elevations[index],
        endElevation: elevations[index + 1],
        metadata: null
      };

      const metadataEntry = resolveMetadataEntry(baseSegment, index);
      if (metadataEntry && typeof metadataEntry === 'object') {
        const distance = Number(metadataEntry.distanceKm);
        const startKm = Number(metadataEntry.startDistanceKm ?? metadataEntry.cumulativeStartKm);
        const endKm = Number(metadataEntry.endDistanceKm ?? metadataEntry.cumulativeEndKm);
        const ascent = Number(metadataEntry.ascent);
        const descent = Number(metadataEntry.descent);
        const costMultiplier = Number(metadataEntry.costMultiplier);
        const hiking = metadataEntry.hiking && typeof metadataEntry.hiking === 'object'
          ? { ...metadataEntry.hiking }
          : null;
        let sacScaleValue = resolveSacScale(
          metadataEntry.sacScale,
          hiking?.sacScale,
          metadataEntry.category,
          hiking?.category,
          metadataEntry.difficulty,
          hiking?.difficulty
        );
        const surfaceValue = typeof metadataEntry.surface === 'string'
          ? metadataEntry.surface
          : hiking?.surface;
        const trailValue = typeof metadataEntry.trailVisibility === 'string'
          ? metadataEntry.trailVisibility
          : hiking?.trailVisibility;
        const smoothnessValue = typeof metadataEntry.smoothness === 'string'
          ? metadataEntry.smoothness
          : hiking?.smoothness;
        const trackTypeValue = typeof metadataEntry.trackType === 'string'
          ? metadataEntry.trackType
          : hiking?.trackType;

        let categoryValue = typeof metadataEntry.category === 'string'
          ? metadataEntry.category
          : typeof hiking?.category === 'string'
            ? hiking.category
            : sacScaleValue;

        if ((!categoryValue || typeof categoryValue !== 'string')
          && isConnectorMetadataSource(metadataEntry.source)) {
          const neighborCategory = findNeighborCategory(metadataEntry);
          if (neighborCategory) {
            categoryValue = neighborCategory;
            if (!sacScaleValue) {
              sacScaleValue = neighborCategory;
            }
          }
        }

        const segmentMetadata = {
          distanceKm: Number.isFinite(distance) ? distance : distanceKm,
          startDistanceKm: Number.isFinite(startKm) ? startKm : startDistanceKm,
          endDistanceKm: Number.isFinite(endKm) ? endKm : endDistanceKm,
          ascent: Number.isFinite(ascent) ? ascent : 0,
          descent: Number.isFinite(descent) ? descent : 0,
          costMultiplier: Number.isFinite(costMultiplier) && costMultiplier > 0 ? costMultiplier : 1,
          source: metadataEntry.source ?? 'network'
        };
        if (hiking) {
          segmentMetadata.hiking = hiking;
        }
        if (typeof sacScaleValue === 'string' && sacScaleValue) {
          segmentMetadata.sacScale = sacScaleValue;
        }
        if (typeof categoryValue === 'string' && categoryValue) {
          segmentMetadata.category = normalizeSacScale(categoryValue) ?? categoryValue;
        }
        if (typeof surfaceValue === 'string' && surfaceValue) {
          segmentMetadata.surface = surfaceValue;
        }
        if (typeof trailValue === 'string' && trailValue) {
          segmentMetadata.trailVisibility = trailValue;
        }
        if (typeof smoothnessValue === 'string' && smoothnessValue) {
          segmentMetadata.smoothness = smoothnessValue;
        }
        if (typeof trackTypeValue === 'string' && trackTypeValue) {
          segmentMetadata.trackType = trackTypeValue;
        }

        baseSegment.metadata = segmentMetadata;
      }

      return baseSegment;
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
    this.updateProfileSegments();
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

  computeCoordinateDistanceMeters(source, target) {
    if (!Array.isArray(source) || !Array.isArray(target)) {
      return null;
    }

    if (turfApi) {
      try {
        const distance = turfApi.distance(turfApi.point(source), turfApi.point(target), { units: 'meters' });
        if (Number.isFinite(distance)) {
          return distance;
        }
      } catch (error) {
        console.warn('Failed to compute waypoint snap distance', error);
      }
    }

    const fallback = haversineDistanceMeters(source, target);
    return Number.isFinite(fallback) ? fallback : null;
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

  computeAxisTicks(minValue, maxValue, maxTicks = 6) {
    let min = Number.isFinite(minValue) ? minValue : 0;
    let max = Number.isFinite(maxValue) ? maxValue : min;

    if (max < min) {
      [min, max] = [max, min];
    }

    if (max === min) {
      const value = Number(min.toFixed(6));
      return { ticks: [value], min: value, max: value, step: 0 };
    }

    const tickTarget = Math.max(2, Math.round(maxTicks));
    const span = max - min;
    const step = span / (tickTarget - 1);
    const ticks = [];
    for (let index = 0; index < tickTarget; index += 1) {
      const value = min + step * index;
      ticks.push(Number(value.toFixed(6)));
    }
    if (ticks.length) {
      ticks[0] = Number(min.toFixed(6));
      ticks[ticks.length - 1] = Number(max.toFixed(6));
    }
    return { ticks, min, max, step };
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

  async refreshRoutePointsOfInterest() {
    const profile = this.routeProfile;
    const coordinates = Array.isArray(profile?.coordinates) ? profile.coordinates : [];
    if (!this.map || coordinates.length < 2 || !turfApi || typeof turfApi.lineString !== 'function'
      || typeof turfApi.nearestPointOnLine !== 'function') {
      this.setRoutePointsOfInterest([]);
      return;
    }

    if (this.pendingPoiAbortController && typeof this.pendingPoiAbortController.abort === 'function') {
      try {
        this.pendingPoiAbortController.abort();
      } catch (error) {
        console.warn('Failed to abort pending POI fallback request', error);
      }
    }
    this.pendingPoiAbortController = null;

    const requestToken = Symbol('poi-request');
    this.pendingPoiRequest = requestToken;
    const line = turfApi.lineString(coordinates.map((coord) => [coord[0], coord[1]]));
    const totalDistanceKm = Number(profile?.totalDistanceKm);

    const sourceCollection = this.offlinePoiCollection;
    let sourceFeatures = Array.isArray(sourceCollection?.features) ? sourceCollection.features : [];
    const shouldRetry = false;

    if ((!Array.isArray(sourceFeatures) || !sourceFeatures.length) && !shouldRetry) {
      let abortController = null;
      if (typeof AbortController === 'function') {
        abortController = new AbortController();
        this.pendingPoiAbortController = abortController;
      }
      try {
        const fallbackFeatures = await fetchOverpassRoutePois(line, {
          bufferMeters: POI_MAX_SEARCH_RADIUS_METERS,
          signal: abortController?.signal
        });
        if (this.pendingPoiRequest !== requestToken) {
          return;
        }
        sourceFeatures = fallbackFeatures;
      } catch (error) {
        if (!(abortController?.signal?.aborted)) {
          console.warn('Failed to fetch POIs from Overpass fallback', error);
        }
      } finally {
        if (this.pendingPoiAbortController === abortController) {
          this.pendingPoiAbortController = null;
        }
      }
    }

    if (!Array.isArray(sourceFeatures) || !sourceFeatures.length) {
      this.setRoutePointsOfInterest([]);
      if (Array.isArray(this.routeGeojson?.geometry?.coordinates)
        && this.routeGeojson.geometry.coordinates.length >= 2) {
        this.updateElevationProfile(this.routeGeojson.geometry.coordinates);
      }
      this.pendingPoiRequest = null;
      return;
    }

    const seen = new Set();
    const collected = [];

    sourceFeatures.forEach((feature) => {
      if (!feature || typeof feature !== 'object') {
        return;
      }
      const geometry = feature.geometry;
      if (!geometry || geometry.type !== 'Point' || !Array.isArray(geometry.coordinates)) {
        return;
      }
      const [lng, lat] = geometry.coordinates;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return;
      }
      const definition = resolvePoiDefinition(feature.properties || {});
      if (!definition) {
        return;
      }
      let nearest = null;
      try {
        nearest = turfApi.nearestPointOnLine(line, turfApi.point([lng, lat]), { units: 'kilometers' });
      } catch (error) {
        return;
      }
      const distanceKm = Number(nearest?.properties?.location);
      const distanceToLineKm = Number(nearest?.properties?.dist ?? nearest?.properties?.distance);
      if (!Number.isFinite(distanceKm) || !Number.isFinite(distanceToLineKm)) {
        return;
      }
      const categoryKey = typeof definition?.key === 'string' ? definition.key : '';
      const maxDistanceMeters = Number.isFinite(POI_CATEGORY_DISTANCE_OVERRIDES[categoryKey])
        ? Math.max(0, POI_CATEGORY_DISTANCE_OVERRIDES[categoryKey])
        : POI_SEARCH_RADIUS_METERS;
      const distanceMeters = distanceToLineKm * 1000;
      if (!Number.isFinite(distanceMeters) || distanceMeters > maxDistanceMeters) {
        return;
      }
      const rawId = feature?.properties?.id
        ?? feature?.properties?.osm_id
        ?? feature?.properties?.['@id']
        ?? feature?.id
        ?? feature?.properties?.ref;
      const identifier = buildPoiIdentifier(definition.key, [lng, lat], rawId);
      if (seen.has(identifier)) {
        return;
      }
      seen.add(identifier);

      const name = resolvePoiName(feature.properties || {});
      if (!name && definition.key === 'peak') {
        return;
      }
      const categoryLabel = definition.definition.label ?? DEFAULT_POI_TITLE;
      const tooltip = name
        ? (categoryLabel && categoryLabel !== name ? `${name} · ${categoryLabel}` : name)
        : categoryLabel || DEFAULT_POI_TITLE;
      const clampedDistanceKm = Number.isFinite(totalDistanceKm)
        ? Math.max(0, Math.min(totalDistanceKm, distanceKm))
        : Math.max(0, distanceKm);

      const coordsArray = Array.isArray(feature.geometry?.coordinates)
        ? feature.geometry.coordinates
        : [];
      const coordinateElevation = coordsArray.length >= 3 ? Number(coordsArray[2]) : null;
      let elevation = parsePoiElevation(feature.properties || {});
      if (!Number.isFinite(elevation) && Number.isFinite(coordinateElevation)) {
        elevation = coordinateElevation;
      }
      const peakImportance = computePeakImportanceScore(feature.properties || {}, elevation);
      const peakImportanceScore = Number.isFinite(peakImportance?.score) ? peakImportance.score : 0;

      collected.push({
        id: identifier,
        name,
        title: tooltip,
        categoryLabel,
        categoryKey: definition.key,
        iconName: definition.definition.icon ?? definition.key,
        color: definition.definition.color ?? DEFAULT_POI_COLOR,
        distanceKm: clampedDistanceKm,
        coordinates: [lng, lat],
        elevation,
        peakImportanceScore
      });
    });

    collected.sort((a, b) => a.distanceKm - b.distanceKm);

    const clustered = clusterRoutePointsOfInterest(collected, totalDistanceKm);

    const resolved = [];
    for (const entry of clustered) {
      if (!entry) {
        continue;
      }
      let icon = null;
      const iconName = typeof entry.iconName === 'string' ? entry.iconName.trim() : '';
      if (iconName) {
        try {
          icon = await getOpenFreeMapIcon(iconName);
        } catch (error) {
          console.warn('Failed to load OpenFreeMap icon', iconName, error);
        }
        if (this.pendingPoiRequest !== requestToken) {
          return;
        }
      }
      const decorated = { ...entry, icon };
      decorated.showLabel = shouldShowPoiLabel(decorated);
      resolved.push(decorated);
      if (this.pendingPoiRequest !== requestToken) {
        return;
      }
    }

    if (this.pendingPoiRequest !== requestToken) {
      return;
    }

    markElevationProfileLabelLeaders(resolved, totalDistanceKm);

    this.setRoutePointsOfInterest(resolved);

    if (Array.isArray(this.routeGeojson?.geometry?.coordinates)
      && this.routeGeojson.geometry.coordinates.length >= 2) {
      this.updateElevationProfile(this.routeGeojson.geometry.coordinates);
    } else if (coordinates.length >= 2) {
      this.updateElevationProfile(coordinates);
    }
    this.pendingPoiRequest = null;
    this.pendingPoiAbortController = null;
  }

  updateElevationProfile(coordinates) {
    if (!this.elevationChart) {
      this.updateProfileLegend(false);
      return;
    }
    this.detachElevationChartEvents();
    this.lastElevationHoverDistance = null;
    if (this.elevationResizeObserver) {
      this.elevationResizeObserver.disconnect();
      this.elevationResizeObserver = null;
    }
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      this.elevationChart.innerHTML = '';
      this.elevationSamples = [];
      this.elevationDomain = null;
      this.elevationYAxis = null;
      this.elevationChartContainer = null;
      this.elevationHoverReadout = null;
      this.highlightedElevationBar = null;
      this.updateProfileLegend(false);
      return;
    }

    const samples = this.generateElevationSamples(coordinates);

    if (!samples.length) {
      this.elevationChart.innerHTML = '';
      this.elevationSamples = [];
      this.elevationDomain = null;
      this.elevationYAxis = null;
      this.elevationChartContainer = null;
      this.elevationHoverReadout = null;
      this.highlightedElevationBar = null;
      this.lastElevationHoverDistance = null;
      this.updateProfileLegend(false);
      return;
    }

    const metrics = this.latestMetrics ?? this.calculateRouteMetrics({ geometry: { coordinates } });
    const totalDistance = Number(metrics.distanceKm) || 0;

    this.elevationSamples = samples;

    const elevations = samples.map((sample) => sample.elevation);
    const maxElevation = Math.max(...elevations);
    const minElevation = Math.min(...elevations);
    const elevationSpan = maxElevation - minElevation;
    const computedMargin = Math.min(
      10,
      Math.max(5, Number.isFinite(elevationSpan) ? elevationSpan * 0.05 : 0)
    );
    const margin = Number.isFinite(computedMargin) ? computedMargin : 5;
    const yMin = minElevation - margin;
    const yMax = maxElevation + margin;
    const yAxis = this.computeAxisTicks(yMin, yMax, ELEVATION_TICK_TARGET);
    const range = Math.max(Number.EPSILON, yAxis.max - yAxis.min);
    this.elevationYAxis = { min: yAxis.min, max: yAxis.max };

    const distanceSeries = Array.isArray(this.routeProfile?.cumulativeDistances)
      ? this.routeProfile.cumulativeDistances.filter((value) => Number.isFinite(value))
      : [];
    let domainStart = distanceSeries.length ? Number(distanceSeries[0]) : Number(samples[0]?.startDistanceKm);
    let domainEnd = distanceSeries.length
      ? Number(distanceSeries[distanceSeries.length - 1])
      : Number(samples[samples.length - 1]?.endDistanceKm);
    if (!Number.isFinite(domainStart)) {
      domainStart = 0;
    }
    if (!Number.isFinite(domainEnd)) {
      domainEnd = domainStart;
    }
    if (domainEnd < domainStart) {
      [domainStart, domainEnd] = [domainEnd, domainStart];
    }
    const xAxis = this.computeAxisTicks(domainStart, domainEnd, DISTANCE_TICK_TARGET);
    const xMin = xAxis.min;
    const xMax = xAxis.max;
    const rawXSpan = xMax - xMin;
    const safeXSpan = rawXSpan === 0 ? 1 : rawXSpan;
    const xBoundaryTolerance = Math.max(1e-6, Math.abs(rawXSpan) * 1e-4);
    this.elevationDomain = { min: xMin, max: xMax, span: rawXSpan };

    const fallbackColor = this.modeColors[this.currentMode];
    const gradientEnabled = isProfileGradientMode(this.profileMode);
    const gradientStops = [];
    const addGradientStop = (distanceKm, color) => {
      if (!Number.isFinite(distanceKm) || typeof color !== 'string') {
        return;
      }
      if (!(rawXSpan > 0)) {
        return;
      }
      const trimmed = color.trim();
      if (!trimmed) {
        return;
      }
      const clampedDistance = Math.min(xMax, Math.max(xMin, distanceKm));
      const ratio = Math.max(0, Math.min(1, (clampedDistance - xMin) / safeXSpan));
      gradientStops.push({ offset: ratio, color: trimmed });
    };

    if (gradientEnabled) {
      const gradientSegments = (() => {
        if (Array.isArray(this.profileSegments) && this.profileSegments.length) {
          return this.profileSegments;
        }
        if (Array.isArray(this.cutSegments) && this.cutSegments.length) {
          return this.cutSegments;
        }
        return [];
      })();

      gradientSegments.forEach((segment) => {
        if (!segment) {
          return;
        }
        const segmentColor = typeof segment.color === 'string' ? segment.color.trim() : '';
        if (!segmentColor) {
          return;
        }
        let startKm = Number(segment.startKm);
        if (!Number.isFinite(startKm)) {
          startKm = Number(segment.startDistanceKm);
        }
        if (!Number.isFinite(startKm)) {
          startKm = 0;
        }
        let endKm = Number(segment.endKm);
        if (!Number.isFinite(endKm)) {
          endKm = Number(segment.endDistanceKm);
        }
        if (!Number.isFinite(endKm)) {
          endKm = startKm;
        }
        addGradientStop(startKm, segmentColor);
        addGradientStop(endKm, segmentColor);
      });
    }

    const hitTargetsHtml = samples
      .map((sample) => {
        const midDistance = (sample.startDistanceKm + sample.endDistanceKm) / 2;
        const profileSegment = this.profileMode !== 'none'
          ? this.getProfileSegmentForDistance(midDistance)
          : null;
        const cutSegment = this.getCutSegmentForDistance(midDistance);
        const baseSegment = profileSegment ?? cutSegment;
        const baseColor = typeof baseSegment?.color === 'string' && baseSegment.color.trim()
          ? baseSegment.color.trim()
          : fallbackColor;
        const resolveSegmentColor = (distanceKm) => {
          const color = this.getColorForDistance(distanceKm);
          if (typeof color === 'string') {
            const trimmed = color.trim();
            if (trimmed) {
              return trimmed;
            }
          }
          return fallbackColor;
        };
        const startColor = resolveSegmentColor(sample.startDistanceKm);
        const endColor = resolveSegmentColor(sample.endDistanceKm);
        addGradientStop(sample.startDistanceKm, startColor);
        addGradientStop(sample.endDistanceKm, endColor);
        const segment = baseSegment;
        const accentColor = adjustHexColor(baseColor, 0.18);
        const spanKm = Math.max(0, sample.endDistanceKm - sample.startDistanceKm);
        const fallbackSpan = samples.length
          ? Math.max(totalDistance / (samples.length * 2), 0.0005)
          : 0.0005;
        const flexGrow = spanKm > 0 ? spanKm : fallbackSpan;
        const titleParts = [];
        if (Number.isFinite(sample.elevation)) {
          titleParts.push(`${Math.round(sample.elevation)} m`);
        }
        if (profileSegment?.name) {
          titleParts.push(profileSegment.name);
        } else if (cutSegment?.name) {
          titleParts.push(cutSegment.name);
        }
        const title = titleParts.join(' · ');
        const style = [
          `--bar-flex-grow:${flexGrow.toFixed(6)}`,
          `--bar-highlight:${accentColor}`
        ].join(';');
        return `
          <div
            class="elevation-bar"
            data-start-km="${sample.startDistanceKm.toFixed(6)}"
            data-end-km="${sample.endDistanceKm.toFixed(6)}"
            data-mid-km="${((sample.startDistanceKm + sample.endDistanceKm) / 2).toFixed(6)}"
            data-segment-index="${segment ? segment.index : -1}"
            style="${style}"
            title="${title}"
          ></div>
        `;
      })
      .join('');

    const xTickValues = Array.isArray(xAxis.ticks)
      ? xAxis.ticks.filter((value) => Number.isFinite(value))
      : [];
    const ensureTick = (value) => {
      if (!Number.isFinite(value)) {
        return;
      }
      const exists = xTickValues.some((tick) => Math.abs(tick - value) < 1e-6);
      if (!exists) {
        xTickValues.push(value);
      }
    };
    ensureTick(xMin);
    ensureTick(xMax);
    xTickValues.sort((a, b) => a - b);
    const xAxisLabels = xTickValues
      .map((value) => {
        const clampedValue = Math.min(xMax, Math.max(xMin, value));
        const ratio = rawXSpan === 0
          ? 0
          : Math.max(0, Math.min(1, (clampedValue - xMin) / safeXSpan));
        const position = (ratio * 100).toFixed(3);
        let transform = 'translateX(-50%)';
        if (ratio <= 0.001) {
          transform = 'translateX(0)';
        } else if (ratio >= 0.999) {
          transform = 'translateX(-100%)';
        }
        const style = `left:${position}%;transform:${transform}`;
        return `<span style="${style}">${this.formatDistanceTick(clampedValue)}</span>`;
      })
      .join('');

    const gradientId = 'elevation-area-gradient';
    const gradientMarkup = (() => {
      if (!gradientStops.length) {
        return '';
      }
      const sorted = gradientStops
        .map((stop) => ({
          offset: Math.max(0, Math.min(1, stop.offset ?? 0)),
          color: stop.color
        }))
        .sort((a, b) => a.offset - b.offset);
      const deduped = [];
      sorted.forEach((stop) => {
        const last = deduped[deduped.length - 1];
        if (!last || Math.abs(stop.offset - last.offset) > 1e-4 || last.color !== stop.color) {
          deduped.push(stop);
        } else {
          deduped[deduped.length - 1] = stop;
        }
      });
      if (deduped.length < 2) {
        return '';
      }
      const stopsMarkup = deduped
        .map((stop) => `<stop offset="${(stop.offset * 100).toFixed(3)}%" stop-color="${stop.color}" />`)
        .join('');
      return `<defs><linearGradient id="${gradientId}" gradientUnits="objectBoundingBox">${stopsMarkup}</linearGradient></defs>`;
    })();

    const areaPaths = this.buildElevationAreaPaths(samples, yAxis, { min: xMin, max: xMax });
    const areaFillColor = adjustHexColor(fallbackColor, 0.08);
    const areaSvg = areaPaths.fill
      ? `
        <svg class="elevation-area" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          ${gradientMarkup}
          <path class="elevation-area-fill" d="${areaPaths.fill}" fill="${gradientMarkup ? `url(#${gradientId})` : areaFillColor}"/>
        </svg>
      `
      : '';

    const markerOverlay = (() => {
      if (!(rawXSpan > 0)) {
        return '';
      }
      const markerElements = [];
      const markers = this.computeSegmentMarkers();
      if (Array.isArray(markers) && markers.length) {
        const bivouacElements = markers
          .filter((marker) => marker?.type === 'bivouac')
          .map((marker) => {
            const distanceKm = this.getMarkerDistance(marker);
            if (
              !Number.isFinite(distanceKm)
              || distanceKm < xMin - xBoundaryTolerance
              || distanceKm > xMax + xBoundaryTolerance
            ) {
              return null;
            }
            const rawTitle = marker?.name ?? marker?.title ?? 'Bivouac';
            const safeTitle = escapeHtml(rawTitle);
            const colorValue = typeof marker?.labelColor === 'string' ? marker.labelColor.trim() : '';
            const styleParts = [
              '--elevation-marker-icon-width:26px',
              '--elevation-marker-icon-height:26px',
              'bottom:0'
            ];
            if (colorValue) {
              styleParts.push(`--bivouac-marker-color:${colorValue}`);
            }
            const styleAttribute = styleParts.length ? ` style="${styleParts.join(';')}"` : '';
            return `
              <div
                class="elevation-marker bivouac"
                data-distance-km="${distanceKm.toFixed(6)}"
                data-bottom-offset="0"${styleAttribute}
                title="${safeTitle}"
                aria-label="${safeTitle}"
              >
                <span class="elevation-marker__label">${safeTitle}</span>
                ${BIVOUAC_ELEVATION_ICON}
              </div>
            `;
          })
          .filter(Boolean);
        markerElements.push(...bivouacElements);
      }

      const poiMarkers = Array.isArray(this.routePointsOfInterest) ? this.routePointsOfInterest : [];
      if (this.profileMode === 'poi' && poiMarkers.length) {
        const poiElements = poiMarkers
          .map((poi) => {
            const distanceKm = Number(poi?.distanceKm);
            if (!Number.isFinite(distanceKm)
              || distanceKm < xMin - xBoundaryTolerance
              || distanceKm > xMax + xBoundaryTolerance) {
              return null;
            }
            const title = poi?.title ?? poi?.name ?? poi?.categoryLabel ?? DEFAULT_POI_TITLE;
            const safeTitle = escapeHtml(title);
            const rawLabel = (() => {
              const nameValue = typeof poi?.name === 'string' ? poi.name.trim() : '';
              if (nameValue) {
                return nameValue;
              }
              const categoryValue = typeof poi?.categoryLabel === 'string'
                ? poi.categoryLabel.trim()
                : '';
              if (categoryValue) {
                return categoryValue;
              }
              return DEFAULT_POI_TITLE;
            })();
            const safeLabel = escapeHtml(rawLabel);
            const colorValue = typeof poi?.color === 'string' && poi.color.trim()
              ? poi.color.trim()
              : DEFAULT_POI_COLOR;
            const icon = poi?.icon ?? null;
            const iconWidth = Number(icon?.width);
            const iconHeight = Number(icon?.height);
            const styleParts = [`bottom:${ELEVATION_PROFILE_POI_MARKER_OFFSET_PX}px`];
            styleParts.push(`color:${colorValue}`);
            styleParts.push(`--poi-marker-color:${colorValue}`);
            if (Number.isFinite(iconWidth) && iconWidth > 0) {
              styleParts.push(`--elevation-marker-icon-width:${iconWidth.toFixed(2)}px`);
            }
            if (Number.isFinite(iconHeight) && iconHeight > 0) {
              styleParts.push(`--elevation-marker-icon-height:${iconHeight.toFixed(2)}px`);
            }
            const shouldShowLabel = Boolean(
              (poi?.showElevationProfileLabel ?? poi?.showLabel)
                && safeLabel
            );
            const labelMarkup = shouldShowLabel
              ? `<span class="elevation-marker__label">${safeLabel}</span>`
              : '';
            const hasIconImage = icon && typeof icon.url === 'string' && icon.url;
            const iconMarkup = hasIconImage
              ? `
                <img
                  class="elevation-marker__icon"
                  src="${icon.url}"
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                />
              `
              : '<span class="elevation-marker__icon elevation-marker__icon--fallback" aria-hidden="true"></span>';
            const datasetAttributes = [
              `data-distance-km="${distanceKm.toFixed(6)}"`,
              `data-bottom-offset="${ELEVATION_PROFILE_POI_MARKER_OFFSET_PX}"`
            ];
            const poiElevation = Number(poi?.elevation);
            if (Number.isFinite(poiElevation)) {
              datasetAttributes.push(`data-elevation="${poiElevation.toFixed(2)}"`);
            }
            return `
              <div
                class="elevation-marker poi"
                ${datasetAttributes.join(' ')}
                style="${styleParts.join(';')}"
                title="${safeTitle}"
                aria-label="${safeTitle}"
              >
                ${labelMarkup}
                ${iconMarkup}
              </div>
            `;
          })
          .filter(Boolean);
        markerElements.push(...poiElements);
      }

      if (!markerElements.length) {
        return '';
      }
      return `<div class="elevation-marker-layer" aria-hidden="true">${markerElements.join('')}</div>`;
    })();

    this.elevationChart.innerHTML = `
      <div class="elevation-plot">
        <div class="elevation-plot-area">
          <div class="elevation-chart-container" role="presentation">
            ${areaSvg}
            <div class="elevation-hit-targets">${hitTargetsHtml}</div>
            ${markerOverlay}
          </div>
          <div class="elevation-hover-readout" aria-live="polite" aria-hidden="true"></div>
          <div class="elevation-x-axis">${xAxisLabels}</div>
        </div>
      </div>
    `;

    this.updateProfileLegend(true);

    this.elevationChartContainer = this.elevationChart.querySelector('.elevation-chart-container');
    this.elevationHoverReadout = this.elevationChart.querySelector('.elevation-hover-readout');
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
    this.updateElevationHoverReadout(null);
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

    let domainMin = Number(this.elevationDomain?.min);
    let domainMax = Number(this.elevationDomain?.max);
    if (!Number.isFinite(domainMin) || !Number.isFinite(domainMax)) {
      const totalDistance = Number(this.routeProfile?.totalDistanceKm);
      if (Number.isFinite(totalDistance) && totalDistance > 0) {
        domainMin = 0;
        domainMax = totalDistance;
      }
    }
    if (!Number.isFinite(domainMin) || !Number.isFinite(domainMax)) {
      return;
    }
    const domainLow = Math.min(domainMin, domainMax);
    const domainHigh = Math.max(domainMin, domainMax);
    const span = domainHigh - domainLow;
    if (!(span > 0)) {
      return;
    }

    const yMin = Number(this.elevationYAxis?.min);
    const yMax = Number(this.elevationYAxis?.max);
    const ySpan = yMax - yMin;
    const canPositionVertically = Number.isFinite(yMin)
      && Number.isFinite(yMax)
      && Math.abs(ySpan) > Number.EPSILON;

    const containerWidth = Number(this.elevationChartContainer?.clientWidth) || 0;
    const markerEntries = markers
      .map((marker) => {
        const distanceKm = Number(marker.dataset.distanceKm);
        if (!Number.isFinite(distanceKm)) {
          return null;
        }
        const isPoiMarker = marker.classList.contains('poi');
        const isBivouacMarker = marker.classList.contains('bivouac');
        const ratio = span > 0 ? (distanceKm - domainLow) / span : 0;
        const clampedRatio = Math.max(0, Math.min(1, ratio));
        const percent = clampedRatio * 100;
        return {
          marker,
          isPoiMarker,
          isBivouacMarker,
          clampedRatio,
          percent,
          hasLabel: Boolean(marker.querySelector('.elevation-marker__label'))
        };
      })
      .filter(Boolean);

    const clusterShiftMap = new Map();
    if (containerWidth > 0) {
      const labelledEntries = markerEntries
        .filter((entry) => entry.hasLabel && (entry.isPoiMarker || entry.isBivouacMarker))
        .sort((a, b) => a.percent - b.percent);

      const placedLabels = [];
      labelledEntries.forEach((entry) => {
        const labelElement = entry.marker.querySelector('.elevation-marker__label');
        if (!labelElement) {
          return;
        }

        const labelRect = typeof labelElement.getBoundingClientRect === 'function'
          ? labelElement.getBoundingClientRect()
          : null;
        const labelWidth = Number(labelElement.offsetWidth)
          || Number(labelRect?.width)
          || 0;
        const labelHeight = Number(labelElement.offsetHeight)
          || Number(labelRect?.height)
          || 0;

        if (labelWidth <= 0 || labelHeight <= 0) {
          clusterShiftMap.set(entry.marker, 0);
          return;
        }

        const centerPx = (entry.percent / 100) * containerWidth;
        const halfWidth = labelWidth / 2;
        const horizontalPadding = ELEVATION_MARKER_LABEL_HORIZONTAL_PADDING_PX;
        const left = centerPx - halfWidth - horizontalPadding;
        const right = centerPx + halfWidth + horizontalPadding;

        let requiredShift = 0;
        for (const placed of placedLabels) {
          if (right <= placed.left || left >= placed.right) {
            continue;
          }
          const candidateShift = placed.shift + placed.height + ELEVATION_MARKER_LABEL_VERTICAL_GAP_PX;
          if (candidateShift > requiredShift) {
            requiredShift = candidateShift;
          }
        }

        clusterShiftMap.set(entry.marker, requiredShift);
        placedLabels.push({ left, right, shift: requiredShift, height: labelHeight });
      });
    }

    markerEntries.forEach((entry) => {
      const { marker, isPoiMarker, isBivouacMarker, clampedRatio, percent, hasLabel } = entry;
      marker.style.left = `${percent.toFixed(6)}%`;

      const offsetValue = Number(marker.dataset.bottomOffset);
      const offsetPx = Number.isFinite(offsetValue) ? offsetValue : 0;

      if ((isPoiMarker || isBivouacMarker) && canPositionVertically) {
        const clampedDistanceKm = domainLow + clampedRatio * span;
        const elevation = this.getElevationAtDistance(clampedDistanceKm);
        if (Number.isFinite(elevation)) {
          const normalized = (elevation - yMin) / ySpan;
          const clampedElevation = Math.max(0, Math.min(1, normalized));
          const elevationPercent = (clampedElevation * 100).toFixed(6);
          const offsetSuffix = offsetPx !== 0 ? ` + ${offsetPx}px` : '';
          if (offsetSuffix) {
            marker.style.bottom = `calc(${elevationPercent}%${offsetSuffix})`;
          } else {
            marker.style.bottom = `${elevationPercent}%`;
          }
        } else {
          marker.style.bottom = `${offsetPx}px`;
        }
      } else if (isPoiMarker || isBivouacMarker) {
        marker.style.bottom = `${offsetPx}px`;
      }

      const clusterShift = clusterShiftMap.get(marker);
      if (Number.isFinite(clusterShift) && clusterShift > 0 && hasLabel) {
        marker.style.setProperty('--elevation-marker-label-shift', `${clusterShift.toFixed(2)}px`);
      } else {
        marker.style.removeProperty('--elevation-marker-label-shift');
      }
    });
  }

  updateElevationHoverReadout(distanceKm) {
    if (!this.elevationHoverReadout) {
      return;
    }

    if (!Number.isFinite(distanceKm)) {
      this.elevationHoverReadout.textContent = '';
      this.elevationHoverReadout.setAttribute('aria-hidden', 'true');
      return;
    }

    const distanceLabel = this.formatDistance(distanceKm);
    const elevation = this.getElevationAtDistance(distanceKm);
    const altitudeLabel = Number.isFinite(elevation) ? `${Math.round(elevation)} m` : 'N/A';

    const gradeValue = this.computeGradeAtDistance(distanceKm);
    const gradeLabel = escapeHtml(this.formatGrade(gradeValue));

    const profileSegment = this.getProfileSegmentForDistance(distanceKm);
    let detailMarkup = '';
    if (profileSegment?.name) {
      const definition = this.getProfileModeDefinition(this.profileMode);
      const modeLabel = escapeHtml(definition?.label ?? 'Difficulty');
      const segmentLabel = escapeHtml(profileSegment.name);
      detailMarkup = `<span class="profile">${modeLabel}: ${segmentLabel}</span>`;
    }

    this.elevationHoverReadout.innerHTML = `
      <span class="distance">${distanceLabel} km</span>
      <span class="altitude">${altitudeLabel}</span>
      <span class="grade">Slope ${gradeLabel}</span>
      ${detailMarkup}
    `;
    this.elevationHoverReadout.setAttribute('aria-hidden', 'false');
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

  applyRoute(route) {
    this.hideRouteHover();
    const previousCuts = this.cloneRouteCuts();
    if (previousCuts.length && this.routeProfile && Array.isArray(this.routeProfile.coordinates)) {
      previousCuts.forEach((entry) => {
        if (!entry || Number.isFinite(entry.lng) && Number.isFinite(entry.lat)) {
          return;
        }
        const coord = this.getCoordinateAtDistance(entry.distanceKm);
        if (Array.isArray(coord) && coord.length >= 2) {
          const [lng, lat] = coord;
          entry.lng = Number.isFinite(lng) ? lng : null;
          entry.lat = Number.isFinite(lat) ? lat : null;
        }
      });
    }
    const coordinates = route?.geometry?.coordinates ?? [];
    this.routeProfile = this.buildRouteProfile(coordinates);
    this.setRoutePointsOfInterest([]);
    this.pendingPoiRequest = null;
    const profileCoordinates = Array.isArray(this.routeProfile?.coordinates)
      ? this.routeProfile.coordinates
      : [];
    const routeCoordinates = profileCoordinates.map((coord) => (Array.isArray(coord) ? coord.slice() : coord));
    let resolvedRoute = route;
    if (routeCoordinates.length) {
      resolvedRoute = {
        ...route,
        geometry: {
          ...(route.geometry ?? { type: 'LineString' }),
          coordinates: routeCoordinates
        }
      };
    }
    this.routeGeojson = resolvedRoute;
    const coordinateMetadata = Array.isArray(resolvedRoute?.properties?.coordinate_metadata)
      ? resolvedRoute.properties.coordinate_metadata
          .map((entry) => (entry && typeof entry === 'object' ? { ...entry } : null))
          .filter(Boolean)
      : [];
    this.routeCoordinateMetadata = coordinateMetadata;
    this.latestMetrics = this.calculateRouteMetrics(resolvedRoute);
    this.rebuildSegmentData();
    const snapped = this.snapWaypointsToRoute();
    if (snapped) {
      this.rebuildSegmentData();
    }
    this.cacheRouteLegSegments();
    const newTotalDistance = Number(this.routeProfile?.totalDistanceKm) || 0;
    let restoredCuts = [];
    if (previousCuts.length && newTotalDistance > ROUTE_CUT_EPSILON_KM) {
      restoredCuts = previousCuts
        .map((entry) => {
          if (!entry || !Number.isFinite(entry.distanceKm)) {
            return null;
          }

          const hasStoredCoords = Number.isFinite(entry.lng) && Number.isFinite(entry.lat);
          let projectedDistance = null;
          let projectedCoords = hasStoredCoords ? [entry.lng, entry.lat] : null;

          if (hasStoredCoords) {
            try {
              const projection = this.projectOntoRoute(toLngLat([entry.lng, entry.lat]), Number.MAX_SAFE_INTEGER);
              if (projection && Number.isFinite(projection.distanceKm)) {
                projectedDistance = projection.distanceKm;
                if (Array.isArray(projection.projection?.coordinates)) {
                  projectedCoords = projection.projection.coordinates;
                }
              }
            } catch (error) {
              console.warn('Failed to project bivouac onto updated route', error);
            }
          }

          if (!Number.isFinite(projectedDistance)) {
            projectedDistance = entry.distanceKm;
            if (!projectedCoords) {
              projectedCoords = this.getCoordinateAtDistance(projectedDistance);
            }
          }

          if (!Number.isFinite(projectedDistance)) {
            return null;
          }

          const clampedDistance = Math.max(0, Math.min(newTotalDistance, projectedDistance));
          if (clampedDistance <= ROUTE_CUT_EPSILON_KM || newTotalDistance - clampedDistance <= ROUTE_CUT_EPSILON_KM) {
            return null;
          }

          const resolvedCoords = Array.isArray(projectedCoords) && projectedCoords.length >= 2
            ? projectedCoords
            : this.getCoordinateAtDistance(clampedDistance);
          const lng = Number(resolvedCoords?.[0]);
          const lat = Number(resolvedCoords?.[1]);

          return {
            distanceKm: clampedDistance,
            lng: Number.isFinite(lng) ? lng : null,
            lat: Number.isFinite(lat) ? lat : null
          };
        })
        .filter((entry) => entry && Number.isFinite(entry.distanceKm))
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }

    this.resetRouteCuts();
    if (restoredCuts.length) {
      const uniqueCuts = [];
      restoredCuts.forEach((entry) => {
        if (!entry) {
          return;
        }
        const existingIndex = uniqueCuts.findIndex((candidate) => Math.abs(candidate.distanceKm - entry.distanceKm) <= ROUTE_CUT_EPSILON_KM / 2);
        if (existingIndex === -1) {
          uniqueCuts.push(entry);
        } else {
          uniqueCuts[existingIndex] = entry;
        }
      });
      this.setRouteCutDistances(uniqueCuts);
    }
    this.updateCutDisplays();
    this.updateDistanceMarkers(resolvedRoute);
    this.updateStats(resolvedRoute);
    this.refreshRoutePointsOfInterest().catch((error) => {
      console.warn('Failed to refresh route points of interest', error);
    });
  }

  async getRoute() {
    if (this.waypoints.length < 2) return;

    try {
      if (!this.router || typeof this.router.getRoute !== 'function') {
        throw new Error('No routing engine is configured');
      }
      await this.prepareNetwork({ reason: 'route-request' });
      const preservedSegments = this.buildPreservedSegments();
      const route = await this.router.getRoute(this.waypoints, {
        mode: this.currentMode,
        preservedSegments
      });
      if (!route || !route.geometry) {
        throw new Error('No route returned from the offline router');
      }
      this.applyRoute(route);
    } catch (error) {
      console.error('Failed to compute route', error);
    }
  }
}
