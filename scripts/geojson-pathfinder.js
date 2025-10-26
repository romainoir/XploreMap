const EARTH_RADIUS_KM = 6371;
const EARTH_RADIUS_METERS = EARTH_RADIUS_KM * 1000;
const DEG_TO_RAD = Math.PI / 180;
const NODE_CONNECTION_TOLERANCE_METERS = 8;
const NODE_CONNECTION_TOLERANCE_KM = NODE_CONNECTION_TOLERANCE_METERS / 1000;

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
  return Math.abs(a[0] - b[0]) <= 1e-7 && Math.abs(a[1] - b[1]) <= 1e-7;
}

function interpolateElevation(start, end, fraction) {
  if (!Number.isFinite(fraction)) {
    return 0;
  }
  const startElevation = Number.isFinite(start?.[2]) ? start[2] : 0;
  const endElevation = Number.isFinite(end?.[2]) ? end[2] : 0;
  return startElevation + (endElevation - startElevation) * fraction;
}

function toProjectedMeters(coord, referenceLat) {
  if (!Array.isArray(coord) || coord.length < 2) {
    return null;
  }
  const latRad = coord[1] * DEG_TO_RAD;
  const lngRad = coord[0] * DEG_TO_RAD;
  const refRad = referenceLat * DEG_TO_RAD;
  const x = EARTH_RADIUS_METERS * lngRad * Math.cos(refRad);
  const y = EARTH_RADIUS_METERS * latRad;
  return { x, y };
}

function projectPointOnSegment(point, start, end) {
  if (!Array.isArray(point) || !Array.isArray(start) || !Array.isArray(end)) {
    return null;
  }
  if (start.length < 2 || end.length < 2) {
    return null;
  }
  const referenceLat = (start[1] + end[1]) / 2;
  const projectedPoint = toProjectedMeters(point, referenceLat);
  const projectedStart = toProjectedMeters(start, referenceLat);
  const projectedEnd = toProjectedMeters(end, referenceLat);
  if (!projectedPoint || !projectedStart || !projectedEnd) {
    return null;
  }

  const segment = {
    x: projectedEnd.x - projectedStart.x,
    y: projectedEnd.y - projectedStart.y
  };
  const lengthSq = segment.x * segment.x + segment.y * segment.y;
  if (lengthSq === 0) {
    return null;
  }

  const fromStart = {
    x: projectedPoint.x - projectedStart.x,
    y: projectedPoint.y - projectedStart.y
  };
  let fraction = (fromStart.x * segment.x + fromStart.y * segment.y) / lengthSq;
  if (!Number.isFinite(fraction)) {
    return null;
  }
  fraction = Math.max(0, Math.min(1, fraction));

  const closest = {
    x: projectedStart.x + segment.x * fraction,
    y: projectedStart.y + segment.y * fraction
  };

  const cosRef = Math.cos(referenceLat * DEG_TO_RAD);
  const lng = cosRef !== 0
    ? (closest.x / (EARTH_RADIUS_METERS * cosRef)) / DEG_TO_RAD
    : point[0];
  const lat = (closest.y / EARTH_RADIUS_METERS) / DEG_TO_RAD;
  const elevation = interpolateElevation(start, end, fraction);
  const snapPoint = [lng, lat, elevation];

  const totalDistanceKm = haversineDistanceKm(start, end);
  const distanceToStartKm = totalDistanceKm * fraction;
  const distanceToEndKm = totalDistanceKm * (1 - fraction);
  const distanceKm = haversineDistanceKm(point, snapPoint);

  return {
    point: snapPoint,
    distanceKm,
    distanceMeters: distanceKm * 1000,
    fraction,
    distanceToStartKm,
    distanceToEndKm
  };
}

function createEdgeMetrics(startCoord, endCoord, multiplier, modes) {
  if (!Array.isArray(startCoord) || !Array.isArray(endCoord)) {
    return null;
  }
  const distanceKm = haversineDistanceKm(startCoord, endCoord);
  if (distanceKm <= 0) {
    return null;
  }
  const startElevation = Number.isFinite(startCoord[2]) ? startCoord[2] : 0;
  const endElevation = Number.isFinite(endCoord[2]) ? endCoord[2] : 0;
  const ascent = Math.max(0, endElevation - startElevation);
  const descent = Math.max(0, startElevation - endElevation);
  const costMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  return {
    weight: distanceKm * costMultiplier,
    distanceKm,
    ascent,
    descent,
    modes
  };
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

    this.precision = Number.isFinite(precision) && precision > 0 ? precision : 1e7;
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
    this._ensureIntersectionNodes();
  }

  getAllNodes() {
    return this.nodeList.map((node) => ({
      key: node.key,
      coord: node.coord.slice(),
      degree: node.edges.size
    }));
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
    if (this.nodes.has(key)) {
      return this.nodes.get(key);
    }

    let nearestNode = null;
    let nearestDistanceKm = Infinity;

    for (let index = 0; index < this.nodeList.length; index += 1) {
      const candidate = this.nodeList[index];
      const distanceKm = haversineDistanceKm(candidate.coord, rounded);
      if (distanceKm < NODE_CONNECTION_TOLERANCE_KM && distanceKm < nearestDistanceKm) {
        nearestNode = candidate;
        nearestDistanceKm = distanceKm;
      }
    }

    if (nearestNode) {
      return nearestNode;
    }

    const node = {
      key,
      coord: rounded,
      edges: new Map()
    };
    this.nodes.set(key, node);
    this.nodeList.push(node);
    this._connectNodeToExistingEdges(node);
    return node;
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

  _computeEdgeMultiplier(edge) {
    if (!edge || !Number.isFinite(edge.distanceKm) || edge.distanceKm <= 0) {
      return 1;
    }
    const ratio = edge.weight / edge.distanceKm;
    if (!Number.isFinite(ratio) || ratio < 0) {
      return 1;
    }
    return ratio;
  }

  _splitEdgeBetween(sourceKey, targetKey, splitNode) {
    const source = this.nodes.get(sourceKey);
    const target = this.nodes.get(targetKey);
    if (!source || !target || !splitNode) {
      return false;
    }
    if (source === splitNode || target === splitNode) {
      return false;
    }

    const forward = source.edges.get(target.key);
    const backward = target.edges.get(source.key);
    if (!forward || !backward) {
      return false;
    }

    const projection = projectPointOnSegment(splitNode.coord, source.coord, target.coord);
    if (!projection
      || projection.distanceMeters > NODE_CONNECTION_TOLERANCE_METERS
      || projection.fraction <= 1e-6
      || projection.fraction >= 1 - 1e-6) {
      return false;
    }

    const forwardMultiplier = this._computeEdgeMultiplier(forward);
    const backwardMultiplier = this._computeEdgeMultiplier(backward);

    const sourceToSplit = createEdgeMetrics(source.coord, splitNode.coord, forwardMultiplier, forward.modes);
    const splitToTarget = createEdgeMetrics(splitNode.coord, target.coord, forwardMultiplier, forward.modes);
    const targetToSplit = createEdgeMetrics(target.coord, splitNode.coord, backwardMultiplier, backward.modes);
    const splitToSource = createEdgeMetrics(splitNode.coord, source.coord, backwardMultiplier, backward.modes);

    if (!sourceToSplit || !splitToTarget || !targetToSplit || !splitToSource) {
      return false;
    }

    source.edges.delete(target.key);
    target.edges.delete(source.key);

    this._addDirectedEdge(source, splitNode, sourceToSplit);
    this._addDirectedEdge(splitNode, source, splitToSource);
    this._addDirectedEdge(splitNode, target, splitToTarget);
    this._addDirectedEdge(target, splitNode, targetToSplit);

    return true;
  }

  _connectNodeToExistingEdges(node) {
    if (!node) {
      return false;
    }
    const candidates = [];
    const processedPairs = new Set();
    this.nodes.forEach((source) => {
      if (!source || source === node) {
        return;
      }
      source.edges.forEach((edge) => {
        const target = this.nodes.get(edge.key);
        if (!target || target === node) {
          return;
        }
        const pairKey = source.key <= target.key
          ? `${source.key}|${target.key}`
          : `${target.key}|${source.key}`;
        if (processedPairs.has(pairKey)) {
          return;
        }
        processedPairs.add(pairKey);
        const projection = projectPointOnSegment(node.coord, source.coord, target.coord);
        if (!projection
          || projection.distanceMeters > NODE_CONNECTION_TOLERANCE_METERS
          || projection.fraction <= 1e-6
          || projection.fraction >= 1 - 1e-6) {
          return;
        }
        candidates.push({ sourceKey: source.key, targetKey: target.key });
      });
    });

    let changed = false;
    candidates.forEach((candidate) => {
      if (this._splitEdgeBetween(candidate.sourceKey, candidate.targetKey, node)) {
        changed = true;
      }
    });
    return changed;
  }

  _ensureIntersectionNodes() {
    if (!this.nodeList.length) {
      return;
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (let index = 0; index < this.nodeList.length; index += 1) {
        const node = this.nodeList[index];
        if (!node) {
          continue;
        }
        if (this._connectNodeToExistingEdges(node)) {
          changed = true;
        }
      }
    }
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

  findNearestPoint(coord) {
    if (!Array.isArray(coord) || coord.length < 2 || !this.nodeList.length) {
      return null;
    }

    let bestSnap = null;

    this.nodeList.forEach((node) => {
      const distanceKm = haversineDistanceKm(node.coord, coord);
      if (!bestSnap || distanceKm < bestSnap.distanceKm) {
        bestSnap = {
          type: 'node',
          node,
          point: cloneCoordinate(node.coord),
          distanceKm,
          distanceMeters: distanceKm * 1000
        };
      }
    });

    if (!bestSnap) {
      return null;
    }

    const processedEdges = new Set();

    this.nodes.forEach((node) => {
      node.edges.forEach((edge) => {
        const targetKey = edge.key;
        if (!targetKey) {
          return;
        }
        const pairKey = node.key <= targetKey ? `${node.key}|${targetKey}` : `${targetKey}|${node.key}`;
        if (processedEdges.has(pairKey)) {
          return;
        }
        processedEdges.add(pairKey);
        const target = this.nodes.get(edge.key);
        if (!target) {
          return;
        }
        const projection = projectPointOnSegment(coord, node.coord, target.coord);
        if (!projection) {
          return;
        }
        if (projection.fraction <= 1e-6 || projection.fraction >= 1 - 1e-6) {
          return;
        }
        if (bestSnap && projection.distanceKm >= bestSnap.distanceKm) {
          return;
        }
        bestSnap = {
          type: 'edge',
          edgeStart: node,
          edgeEnd: target,
          point: projection.point,
          distanceKm: projection.distanceKm,
          distanceMeters: projection.distanceMeters,
          fraction: projection.fraction,
          distanceToStartKm: projection.distanceToStartKm,
          distanceToEndKm: projection.distanceToEndKm
        };
      });
    });

    return bestSnap;
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
