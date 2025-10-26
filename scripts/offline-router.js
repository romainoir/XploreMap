import { GeoJsonPathFinder, haversineDistanceKm } from './geojson-pathfinder.js';

const DEFAULT_SPEEDS = Object.freeze({
  'foot-hiking': 4.5,
  'cycling-regular': 15,
  'driving-car': 40
});
const DEFAULT_SNAP_TOLERANCE_METERS = 500;
const MIN_BRIDGE_DISTANCE_METERS = 1500;

function coordinatesAlmostEqual(a, b, epsilon = 1e-6) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) {
    return false;
  }
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

function mergeCoordinates(preferred, fallback) {
  const target = Array.isArray(preferred) ? preferred.slice(0, 3) : [];
  if (target.length < 2 && Array.isArray(fallback)) {
    return fallback.slice();
  }
  if (target.length < 2) {
    return [];
  }
  if (target.length === 2) {
    const elevation = Array.isArray(fallback) && Number.isFinite(fallback[2]) ? fallback[2] : 0;
    target.push(elevation);
  } else if (!Number.isFinite(target[2])) {
    target[2] = Array.isArray(fallback) && Number.isFinite(fallback[2]) ? fallback[2] : 0;
  }
  return target;
}

function computeSegmentMetrics(source, target) {
  if (!Array.isArray(source) || source.length < 2 || !Array.isArray(target) || target.length < 2) {
    return null;
  }

  const start = mergeCoordinates(source, target);
  const end = mergeCoordinates(target, source);
  if (start.length < 2 || end.length < 2) {
    return null;
  }

  const distanceKm = haversineDistanceKm(start, end);
  const elevationDelta = (end[2] ?? 0) - (start[2] ?? 0);

  return {
    start,
    end,
    distanceKm,
    ascent: elevationDelta > 0 ? elevationDelta : 0,
    descent: elevationDelta < 0 ? Math.abs(elevationDelta) : 0
  };
}

function buildDirectSegment(startCoord, endCoord) {
  const metrics = computeSegmentMetrics(startCoord, endCoord);
  if (!metrics) {
    return null;
  }

  return {
    coordinates: [metrics.start, metrics.end],
    distanceKm: metrics.distanceKm,
    ascent: metrics.ascent,
    descent: metrics.descent
  };
}

export class OfflineRouter {
  constructor(options = {}) {
    const {
      networkUrl,
      supportedModes,
      averageSpeeds,
      maxSnapDistanceMeters,
      pathFinderOptions
    } = options;

    this.networkUrl = networkUrl || './data/offline-network.geojson';
    const modes = Array.isArray(supportedModes) && supportedModes.length
      ? supportedModes
      : Object.keys(DEFAULT_SPEEDS);
    this.supportedModes = new Set(modes);
    this.averageSpeeds = { ...DEFAULT_SPEEDS, ...(averageSpeeds || {}) };
    this.maxSnapDistanceMeters = Number.isFinite(maxSnapDistanceMeters)
      ? maxSnapDistanceMeters
      : DEFAULT_SNAP_TOLERANCE_METERS;
    this.pathFinderOptions = { ...(pathFinderOptions || {}) };

    this.networkGeoJSON = null;
    this.pathFinder = null;
    this.readyPromise = null;
  }

  supportsMode(mode) {
    return this.supportedModes.has(mode);
  }

  getNetworkGeoJSON() {
    return this.networkGeoJSON;
  }

  async ensureReady() {
    if (this.pathFinder) {
      return;
    }
    if (!this.readyPromise) {
      this.readyPromise = this.loadNetwork();
    }
    await this.readyPromise;
  }

  async loadNetwork() {
    if (!this.networkUrl) {
      throw new Error('OfflineRouter requires a networkUrl');
    }
    const response = await fetch(this.networkUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load offline network (${response.status})`);
    }
    const data = await response.json();
    this.networkGeoJSON = data && typeof data === 'object' ? data : null;
    this.pathFinder = new GeoJsonPathFinder(this.networkGeoJSON, this.pathFinderOptions);
  }

  findNearestNode(coord) {
    if (!this.pathFinder) {
      return null;
    }
    return this.pathFinder.findNearestNode(coord);
  }

  async getRoute(waypoints, { mode } = {}) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      return null;
    }
    const travelMode = typeof mode === 'string' && this.supportsMode(mode)
      ? mode
      : Array.from(this.supportedModes)[0];

    await this.ensureReady();

    const coordinates = [];
    const segments = [];
    let totalDistanceKm = 0;
    let totalAscent = 0;
    let totalDescent = 0;

    for (let index = 0; index < waypoints.length - 1; index += 1) {
      const start = waypoints[index];
      const end = waypoints[index + 1];
      const segment = this.findPathBetween(start, end, travelMode);
      if (!segment || !Array.isArray(segment.coordinates) || segment.coordinates.length < 2) {
        throw new Error('No offline route found between the selected points');
      }
      if (!coordinates.length) {
        coordinates.push(...segment.coordinates);
      } else {
        coordinates.push(...segment.coordinates.slice(1));
      }
      totalDistanceKm += segment.distanceKm;
      totalAscent += segment.ascent;
      totalDescent += segment.descent;
      segments.push({
        distance: segment.distanceKm * 1000,
        duration: this.estimateDurationSeconds(segment.distanceKm, travelMode),
        ascent: segment.ascent,
        descent: segment.descent,
        start_index: index,
        end_index: index + 1
      });
    }

    const summary = {
      distance: totalDistanceKm * 1000,
      duration: this.estimateDurationSeconds(totalDistanceKm, travelMode),
      ascent: totalAscent,
      descent: totalDescent
    };

    return {
      type: 'Feature',
      properties: {
        profile: travelMode,
        summary,
        segments
      },
      geometry: {
        type: 'LineString',
        coordinates
      }
    };
  }

  estimateDurationSeconds(distanceKm, mode) {
    const speed = Number(this.averageSpeeds[mode]);
    if (!Number.isFinite(speed) || speed <= 0) {
      return 0;
    }
    const hours = distanceKm / speed;
    return Math.max(0, hours * 3600);
  }

  findPathBetween(startCoord, endCoord, mode) {
    if (!this.pathFinder) {
      throw new Error('Offline network is unavailable for routing');
    }
    const startSnap = this.pathFinder.findNearestNode(startCoord);
    const endSnap = this.pathFinder.findNearestNode(endCoord);
    if (!startSnap || !endSnap) {
      throw new Error('Offline network is unavailable for routing');
    }

    const startTooFar = startSnap.distanceMeters > this.maxSnapDistanceMeters;
    const endTooFar = endSnap.distanceMeters > this.maxSnapDistanceMeters;

    const path = this.pathFinder.buildPath(startSnap.node.key, endSnap.node.key, mode);
    if (!path || !Array.isArray(path.coordinates) || !path.coordinates.length) {
      return null;
    }

    const maxBridgeDistanceMeters = Math.max(this.maxSnapDistanceMeters, MIN_BRIDGE_DISTANCE_METERS);
    if ((startTooFar && startSnap.distanceMeters > maxBridgeDistanceMeters)
      || (endTooFar && endSnap.distanceMeters > maxBridgeDistanceMeters)) {
      const direct = buildDirectSegment(startCoord, endCoord);
      if (direct) {
        return direct;
      }
      throw new Error('Selected points are too far from the offline routing network');
    }

    const pathCoordinates = path.coordinates
      .map((coord) => (Array.isArray(coord) ? coord.slice(0, 3) : null))
      .filter((coord) => Array.isArray(coord) && coord.length >= 2);

    if (!pathCoordinates.length) {
      const direct = buildDirectSegment(startCoord, endCoord);
      if (direct) {
        return direct;
      }
      return null;
    }

    const firstPathCoord = pathCoordinates[0];
    const lastPathCoord = pathCoordinates[pathCoordinates.length - 1];

    const startMetrics = computeSegmentMetrics(startCoord, firstPathCoord);
    const endMetrics = computeSegmentMetrics(lastPathCoord, endCoord);

    let distanceKm = Number(path.distanceKm) || 0;
    let ascent = Number(path.ascent) || 0;
    let descent = Number(path.descent) || 0;

    if (startMetrics) {
      distanceKm += startMetrics.distanceKm;
      ascent += startMetrics.ascent;
      descent += startMetrics.descent;
      pathCoordinates[0] = startMetrics.end;
    }

    if (endMetrics) {
      distanceKm += endMetrics.distanceKm;
      ascent += endMetrics.ascent;
      descent += endMetrics.descent;
      pathCoordinates[pathCoordinates.length - 1] = endMetrics.start;
    }

    const coordinates = [];

    if (startMetrics) {
      coordinates.push(startMetrics.start);
    } else if (Array.isArray(startCoord) && startCoord.length >= 2) {
      coordinates.push(mergeCoordinates(startCoord, firstPathCoord));
    }

    pathCoordinates.forEach((coord) => {
      if (!Array.isArray(coord) || coord.length < 2) {
        return;
      }
      if (!coordinates.length || !coordinatesAlmostEqual(coordinates[coordinates.length - 1], coord)) {
        coordinates.push(coord);
      }
    });

    if (endMetrics) {
      if (!coordinates.length || !coordinatesAlmostEqual(coordinates[coordinates.length - 1], endMetrics.start)) {
        coordinates.push(endMetrics.start);
      }
      if (!coordinatesAlmostEqual(coordinates[coordinates.length - 1], endMetrics.end)) {
        coordinates.push(endMetrics.end);
      }
    } else if (Array.isArray(endCoord) && endCoord.length >= 2) {
      const mergedEnd = mergeCoordinates(endCoord, lastPathCoord);
      if (!coordinatesAlmostEqual(coordinates[coordinates.length - 1], mergedEnd)) {
        coordinates.push(mergedEnd);
      }
    }

    if (coordinates.length < 2) {
      const direct = buildDirectSegment(startCoord, endCoord);
      if (direct) {
        return direct;
      }
      return null;
    }

    return {
      coordinates,
      distanceKm,
      ascent,
      descent
    };
  }
}
