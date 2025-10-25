const EARTH_RADIUS_KM = 6371;
const DEFAULT_SPEEDS = Object.freeze({
  'foot-hiking': 4.5,
  'cycling-regular': 15,
  'driving-car': 40
});
const DEFAULT_SNAP_TOLERANCE_METERS = 500;

function haversineDistanceKm(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) {
    return 0;
  }
  const toRad = (value) => (value * Math.PI) / 180;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = lat2 - lat1;
  const dLng = toRad(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return EARTH_RADIUS_KM * c;
}

function normalizeModes(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    return new Set(value.filter((mode) => typeof mode === 'string'));
  }
  if (typeof value === 'string') {
    return new Set(value.split(',').map((mode) => mode.trim()).filter(Boolean));
  }
  return null;
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
      maxSnapDistanceMeters
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

    this.nodes = new Map();
    this.nodeList = [];
    this.networkGeoJSON = null;
    this.readyPromise = null;
  }

  supportsMode(mode) {
    return this.supportedModes.has(mode);
  }

  getNetworkGeoJSON() {
    return this.networkGeoJSON;
  }

  async ensureReady() {
    if (this.nodes.size) {
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
    this.buildGraph(this.networkGeoJSON);
  }

  buildGraph(geojson) {
    this.nodes.clear();
    this.nodeList = [];

    if (!geojson || !Array.isArray(geojson.features)) {
      return;
    }

    const addNode = (coord) => {
      if (!Array.isArray(coord) || coord.length < 2) return null;
      const roundedLng = Number(coord[0].toFixed(6));
      const roundedLat = Number(coord[1].toFixed(6));
      const roundedEle = Number.isFinite(coord[2]) ? Number(coord[2].toFixed(2)) : 0;
      const key = `${roundedLng},${roundedLat},${roundedEle}`;
      if (!this.nodes.has(key)) {
        const node = {
          key,
          coord: [roundedLng, roundedLat, roundedEle],
          edges: new Map()
        };
        this.nodes.set(key, node);
        this.nodeList.push(node);
      }
      return this.nodes.get(key);
    };

    geojson.features.forEach((feature) => {
      const geometry = feature?.geometry;
      if (!geometry) return;
      const coords = geometry.type === 'LineString'
        ? geometry.coordinates
        : geometry.type === 'MultiLineString'
          ? geometry.coordinates.flat()
          : null;
      if (!Array.isArray(coords) || coords.length < 2) return;
      const modes = normalizeModes(feature?.properties?.modes);
      const multiplier = Number(feature?.properties?.costMultiplier);
      const costMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;

      for (let index = 0; index < coords.length - 1; index += 1) {
        const start = addNode(coords[index]);
        const end = addNode(coords[index + 1]);
        if (!start || !end) continue;

        const distanceKm = haversineDistanceKm(start.coord, end.coord);
        const ascent = Math.max(0, (end.coord[2] ?? 0) - (start.coord[2] ?? 0));
        const descent = Math.max(0, (start.coord[2] ?? 0) - (end.coord[2] ?? 0));
        const weight = distanceKm * costMultiplier;

        const edge = {
          key: end.key,
          weight,
          distanceKm,
          ascent,
          descent,
          modes
        };
        const reverse = {
          key: start.key,
          weight,
          distanceKm,
          ascent: descent,
          descent: ascent,
          modes
        };
        start.edges.set(end.key, edge);
        end.edges.set(start.key, reverse);
      }
    });
  }

  findNearestNode(coord) {
    if (!Array.isArray(coord) || coord.length < 2 || !this.nodeList.length) {
      return null;
    }
    let best = null;
    let bestDistance = Infinity;
    this.nodeList.forEach((node) => {
      const distanceKm = haversineDistanceKm(node.coord, coord);
      if (distanceKm < bestDistance) {
        bestDistance = distanceKm;
        best = node;
      }
    });
    if (!best) {
      return null;
    }
    return {
      node: best,
      distanceMeters: bestDistance * 1000
    };
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
    const startSnap = this.findNearestNode(startCoord);
    const endSnap = this.findNearestNode(endCoord);
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

    const startKey = startSnap.node.key;
    const endKey = endSnap.node.key;
    const distances = new Map();
    const previous = new Map();
    const queue = new Set();

    this.nodeList.forEach((node) => {
      distances.set(node.key, Infinity);
    });
    distances.set(startKey, 0);
    queue.add(startKey);

    while (queue.size) {
      let currentKey = null;
      let currentDistance = Infinity;
      queue.forEach((key) => {
        const value = distances.get(key);
        if (value < currentDistance) {
          currentDistance = value;
          currentKey = key;
        }
      });
      if (currentKey === null) {
        break;
      }
      queue.delete(currentKey);
      if (currentKey === endKey) {
        break;
      }
      const node = this.nodes.get(currentKey);
      if (!node) continue;
      node.edges.forEach((edge) => {
        if (edge.modes && !edge.modes.has(mode)) {
          return;
        }
        const alt = currentDistance + edge.weight;
        if (alt < distances.get(edge.key)) {
          distances.set(edge.key, alt);
          previous.set(edge.key, currentKey);
          queue.add(edge.key);
        }
      });
    }

    if (!previous.has(endKey) && startKey !== endKey) {
      return null;
    }

    const pathKeys = [];
    let cursor = endKey;
    pathKeys.push(cursor);
    while (previous.has(cursor)) {
      cursor = previous.get(cursor);
      pathKeys.push(cursor);
    }
    pathKeys.reverse();

    const coordinates = [];
    let totalDistanceKm = 0;
    let totalAscent = 0;
    let totalDescent = 0;

    for (let index = 0; index < pathKeys.length; index += 1) {
      const key = pathKeys[index];
      const node = this.nodes.get(key);
      if (!node) continue;
      const source = index === 0
        ? mergeCoordinates(startCoord, node.coord)
        : node.coord.slice();
      if (!coordinates.length || !this.coordinatesEqual(coordinates[coordinates.length - 1], source)) {
        coordinates.push(source);
      }
      if (index < pathKeys.length - 1) {
        const nextKey = pathKeys[index + 1];
        const edge = node.edges.get(nextKey);
        if (edge) {
          totalDistanceKm += edge.distanceKm;
          totalAscent += edge.ascent;
          totalDescent += edge.descent;
        }
      }
    }

    if (coordinates.length) {
      const last = coordinates[coordinates.length - 1];
      const merged = mergeCoordinates(endCoord, last);
      coordinates[coordinates.length - 1] = merged;
    }

    return {
      coordinates,
      distanceKm: totalDistanceKm,
      ascent: totalAscent,
      descent: totalDescent
    };
  }

  coordinatesEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    return Math.abs(a[0] - b[0]) <= 1e-6 && Math.abs(a[1] - b[1]) <= 1e-6;
  }
}
