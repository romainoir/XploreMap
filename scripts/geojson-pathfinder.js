const EARTH_RADIUS_KM = 6371;

export function haversineDistanceKm(a, b) {
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

function normalizeModes(value, separator = ',') {
  if (!value) {
    return null;
  }
  if (value instanceof Set) {
    return value.size ? new Set(value) : null;
  }
  if (Array.isArray(value)) {
    const result = value
      .map((mode) => (typeof mode === 'string' ? mode.trim() : String(mode || '')))
      .filter(Boolean);
    return result.length ? new Set(result) : null;
  }
  if (typeof value === 'string') {
    return normalizeModes(value.split(separator), separator);
  }
  return null;
}

function createNodeKey(lng, lat, ele) {
  return `${lng},${lat},${ele}`;
}

function cloneCoordinate(coord) {
  if (!Array.isArray(coord)) {
    return [];
  }
  return coord.slice(0, 3).map((value, index) => (index < 2 ? value : Number.isFinite(value) ? value : 0));
}

function coordsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return false;
  }
  return Math.abs(a[0] - b[0]) <= 1e-6 && Math.abs(a[1] - b[1]) <= 1e-6;
}

export class GeoJsonPathFinder {
  constructor(geojson, options = {}) {
    const {
      precision,
      elevationPrecision,
      modesProperty,
      costProperty,
      modeSeparator
    } = options;

    this.precision = Number.isFinite(precision) && precision > 0 ? precision : 1e6;
    this.elevationPrecision = Number.isFinite(elevationPrecision) && elevationPrecision >= 0
      ? elevationPrecision
      : 2;
    this.modesProperty = typeof modesProperty === 'string' && modesProperty.length
      ? modesProperty
      : 'modes';
    this.costProperty = typeof costProperty === 'string' && costProperty.length
      ? costProperty
      : 'costMultiplier';
    this.modeSeparator = typeof modeSeparator === 'string' && modeSeparator.length
      ? modeSeparator
      : ',';

    this.nodes = new Map();
    this.nodeList = [];

    if (geojson) {
      this.load(geojson);
    }
  }

  clear() {
    this.nodes.clear();
    this.nodeList = [];
  }

  load(geojson) {
    this.clear();
    if (!geojson || !Array.isArray(geojson.features)) {
      return;
    }
    geojson.features.forEach((feature) => {
      this._processFeature(feature);
    });
  }

  _roundCoord(coord) {
    if (!Array.isArray(coord) || coord.length < 2) {
      return null;
    }
    const factor = this.precision;
    const lng = Math.round(coord[0] * factor) / factor;
    const lat = Math.round(coord[1] * factor) / factor;
    const elevation = Number.isFinite(coord[2])
      ? Number(coord[2].toFixed(this.elevationPrecision))
      : 0;
    return [lng, lat, elevation];
  }

  _getOrCreateNode(coord) {
    const rounded = this._roundCoord(coord);
    if (!rounded) {
      return null;
    }
    const key = createNodeKey(rounded[0], rounded[1], rounded[2]);
    if (!this.nodes.has(key)) {
      const node = {
        key,
        coord: rounded,
        edges: new Map()
      };
      this.nodes.set(key, node);
      this.nodeList.push(node);
    }
    return this.nodes.get(key);
  }

  _addDirectedEdge(source, target, edge) {
    if (!source || !target) {
      return;
    }
    const existing = source.edges.get(target.key);
    if (existing && existing.weight <= edge.weight) {
      return;
    }
    source.edges.set(target.key, {
      key: target.key,
      weight: edge.weight,
      distanceKm: edge.distanceKm,
      ascent: edge.ascent,
      descent: edge.descent,
      modes: edge.modes
    });
  }

  _processFeature(feature) {
    if (!feature || !feature.geometry) {
      return;
    }
    const { geometry, properties } = feature;
    const segments = [];
    if (geometry.type === 'LineString') {
      segments.push(geometry.coordinates);
    } else if (geometry.type === 'MultiLineString') {
      geometry.coordinates.forEach((part) => segments.push(part));
    }
    if (!segments.length) {
      return;
    }
    const modes = normalizeModes(properties?.[this.modesProperty], this.modeSeparator);
    const multiplier = Number(properties?.[this.costProperty]);
    const costMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;

    segments.forEach((coords) => {
      if (!Array.isArray(coords) || coords.length < 2) {
        return;
      }
      for (let index = 0; index < coords.length - 1; index += 1) {
        const start = this._getOrCreateNode(coords[index]);
        const end = this._getOrCreateNode(coords[index + 1]);
        if (!start || !end) {
          continue;
        }
        const distanceKm = haversineDistanceKm(start.coord, end.coord);
        const ascent = Math.max(0, (end.coord[2] ?? 0) - (start.coord[2] ?? 0));
        const descent = Math.max(0, (start.coord[2] ?? 0) - (end.coord[2] ?? 0));
        const weight = distanceKm * costMultiplier;
        const edge = {
          weight,
          distanceKm,
          ascent,
          descent,
          modes
        };
        this._addDirectedEdge(start, end, edge);
        this._addDirectedEdge(end, start, {
          weight,
          distanceKm,
          ascent: descent,
          descent: ascent,
          modes
        });
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
      distanceKm: bestDistance,
      distanceMeters: bestDistance * 1000
    };
  }

  buildPath(startKey, endKey, mode) {
    if (!startKey || !endKey) {
      return null;
    }
    if (!this.nodes.has(startKey) || !this.nodes.has(endKey)) {
      return null;
    }
    const distances = new Map();
    const previous = new Map();
    const queue = new Map();

    this.nodes.forEach((_, key) => {
      distances.set(key, Infinity);
    });
    distances.set(startKey, 0);
    queue.set(startKey, 0);

    while (queue.size) {
      let currentKey = null;
      let currentDistance = Infinity;
      queue.forEach((value, key) => {
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
      if (!node) {
        continue;
      }
      node.edges.forEach((edge) => {
        if (mode && edge.modes && !edge.modes.has(mode)) {
          return;
        }
        const alt = currentDistance + edge.weight;
        if (alt < distances.get(edge.key)) {
          distances.set(edge.key, alt);
          previous.set(edge.key, currentKey);
          queue.set(edge.key, alt);
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
      if (!node) {
        continue;
      }
      if (!coordinates.length || !coordsEqual(coordinates[coordinates.length - 1], node.coord)) {
        coordinates.push(cloneCoordinate(node.coord));
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

    return {
      coordinates,
      distanceKm: totalDistanceKm,
      ascent: totalAscent,
      descent: totalDescent,
      startKey,
      endKey
    };
  }
}
