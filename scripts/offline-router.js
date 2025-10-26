import { GeoJsonPathFinder, haversineDistanceKm } from './geojson-pathfinder.js';

const DEFAULT_SPEEDS = Object.freeze({
  'foot-hiking': 4.5,
  'cycling-regular': 15,
  'driving-car': 40
});
const DEFAULT_SNAP_TOLERANCE_METERS = 500;

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

function buildDirectSegment(startCoord, endCoord) {
  if (!Array.isArray(startCoord) || startCoord.length < 2 || !Array.isArray(endCoord) || endCoord.length < 2) {
    return null;
  }

  const start = mergeCoordinates(startCoord, startCoord);
  const end = mergeCoordinates(endCoord, endCoord);

  const distanceKm = haversineDistanceKm(start, end);
  const ascent = Math.max(0, (end[2] ?? 0) - (start[2] ?? 0));
  const descent = Math.max(0, (start[2] ?? 0) - (end[2] ?? 0));

  return {
    coordinates: [start, end],
    distanceKm,
    ascent,
    descent
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

    if (startTooFar || endTooFar) {
      const direct = buildDirectSegment(startCoord, endCoord);
      if (direct) {
        return direct;
      }
      throw new Error('Selected points are too far from the offline routing network');
    }

    const path = this.pathFinder.buildPath(startSnap.node.key, endSnap.node.key, mode);
    if (!path || !Array.isArray(path.coordinates) || !path.coordinates.length) {
      return null;
    }

    const coordinates = path.coordinates.map((coord, index, array) => {
      if (index === 0) {
        return mergeCoordinates(startCoord, coord);
      }
      if (index === array.length - 1) {
        return mergeCoordinates(endCoord, coord);
      }
      return coord.slice();
    });

    if (coordinates.length === 1) {
      const startMerged = mergeCoordinates(startCoord, coordinates[0]);
      const endMerged = mergeCoordinates(endCoord, coordinates[0]);
      if (startMerged.length && endMerged.length) {
        coordinates.splice(0, 1, startMerged, endMerged);
      }
    }

    return {
      coordinates,
      distanceKm: path.distanceKm,
      ascent: path.ascent,
      descent: path.descent
    };
  }
}
