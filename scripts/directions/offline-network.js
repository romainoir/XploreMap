const NETWORK_GEOJSON_URL = './data/offline-network.geojson';
const PATH_FINDER_MODULE = 'https://cdn.skypack.dev/geojson-path-finder@1.5.3?min';
const EARTH_RADIUS_METERS = 6371000;
const DEFAULT_ELEVATION = 0;

const networkState = {
  loadPromise: null,
  pathFinder: null
};

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) {
    return Infinity;
  }
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const latDelta = toRadians(lat2 - lat1);
  const lngDelta = toRadians(lng2 - lng1);
  const startLat = toRadians(lat1);
  const endLat = toRadians(lat2);
  const sinLat = Math.sin(latDelta / 2);
  const sinLng = Math.sin(lngDelta / 2);
  const aValue = sinLat * sinLat + Math.cos(startLat) * Math.cos(endLat) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(aValue), Math.sqrt(Math.max(0, 1 - aValue)));
  return EARTH_RADIUS_METERS * c;
}

function roundCoordinate(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : value;
}

function ensurePathFinderCtor(module) {
  if (!module) return null;
  if (typeof module === 'function') return module;
  if (typeof module.default === 'function') return module.default;
  if (typeof module.PathFinder === 'function') return module.PathFinder;
  return null;
}

async function loadPathFinder() {
  if (!networkState.loadPromise) {
    networkState.loadPromise = Promise.all([
      fetch(NETWORK_GEOJSON_URL).then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load offline network (${response.status})`);
        }
        return response.json();
      }),
      import(PATH_FINDER_MODULE)
    ])
      .then(([data, module]) => {
        const PathFinderCtor = ensurePathFinderCtor(module);
        if (typeof PathFinderCtor !== 'function') {
          throw new Error('GeoJSON PathFinder module is not available');
        }
        networkState.pathFinder = new PathFinderCtor(data, {
          precision: 1e-5
        });
        return networkState.pathFinder;
      })
      .catch((error) => {
        networkState.pathFinder = null;
        console.error('Failed to initialize offline network', error);
        throw error;
      });
  }
  return networkState.loadPromise;
}

function getPathFinder() {
  return networkState.pathFinder ?? null;
}

function sanitizeCoordinates(coordinates) {
  return coordinates
    .map((coord) => {
      if (!Array.isArray(coord) || coord.length < 2) return null;
      const lng = Number(coord[0]);
      const lat = Number(coord[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      const ele = Number(coord[2]);
      const normalized = [roundCoordinate(lng), roundCoordinate(lat)];
      if (Number.isFinite(ele)) {
        normalized.push(ele);
      }
      return normalized;
    })
    .filter(Boolean);
}

function toCoordinate3D(coord, elevation) {
  const lng = Number(coord?.[0]);
  const lat = Number(coord?.[1]);
  const ele = Number.isFinite(elevation) ? elevation : DEFAULT_ELEVATION;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }
  return [roundCoordinate(lng), roundCoordinate(lat), ele];
}

function computeSegmentMetrics(coordinates) {
  let totalDistance = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    totalDistance += haversineDistanceMeters(previous, current);
  }
  return {
    distance: totalDistance,
    duration: null,
    ascent: 0,
    descent: 0
  };
}

async function ensurePathFinderLoaded() {
  if (getPathFinder()) {
    return networkState.pathFinder;
  }
  return loadPathFinder();
}

export async function computeOfflineRouteSegment(rawWaypoints, options = {}) {
  const sanitized = sanitizeCoordinates(rawWaypoints);
  if (sanitized.length < 2) {
    throw new Error('Not enough coordinates to compute an offline segment');
  }

  await ensurePathFinderLoaded();
  const pathFinder = getPathFinder();
  if (!pathFinder) {
    throw new Error('Offline network is not available');
  }

  const combined = [];
  const segments = [];

  for (let index = 1; index < sanitized.length; index += 1) {
    const start = sanitized[index - 1];
    const end = sanitized[index];
    const result = pathFinder.findPath([start[0], start[1]], [end[0], end[1]]);
    if (!result || !Array.isArray(result.path) || result.path.length < 2) {
      throw new Error('No offline path found between waypoints');
    }

    const pathCoordinates = result.path
      .map((coord, coordIndex) => {
        const baseElevation =
          coordIndex === 0
            ? start[2]
            : coordIndex === result.path.length - 1
              ? end[2]
              : start[2] ?? end[2];
        return toCoordinate3D(coord, baseElevation);
      })
      .filter(Boolean);

    if (pathCoordinates.length < 2) {
      throw new Error('Offline path contains too few coordinates');
    }

    pathCoordinates[0] = toCoordinate3D(start, start[2]);
    pathCoordinates[pathCoordinates.length - 1] = toCoordinate3D(end, end[2]);

    const segmentMetrics = computeSegmentMetrics(pathCoordinates);
    segments.push(segmentMetrics);

    if (!combined.length) {
      combined.push(...pathCoordinates);
    } else {
      const startIndex = combined.length ? 1 : 0;
      for (let coordIndex = startIndex; coordIndex < pathCoordinates.length; coordIndex += 1) {
        const coord = pathCoordinates[coordIndex];
        const lastCoord = combined[combined.length - 1];
        if (!lastCoord || lastCoord[0] !== coord[0] || lastCoord[1] !== coord[1]) {
          combined.push(coord);
        }
      }
    }
  }

  const totalDistance = segments.reduce((sum, segment) => sum + (segment.distance || 0), 0);

  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: combined },
    properties: {
      mode: 'offline-network',
      summary: {
        distance: totalDistance,
        duration: null,
        ascent: 0,
        descent: 0
      },
      segments
    }
  };
}

export function resetOfflineNetworkCache() {
  networkState.loadPromise = null;
  networkState.pathFinder = null;
}
