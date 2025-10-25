const NETWORK_GEOJSON_URL = './data/offline-network.geojson';
const MAX_NETWORK_RADIUS_METERS = 40000;
const EARTH_RADIUS_METERS = 6371000;
const DEFAULT_ELEVATION = 0;

const networkState = {
  loadPromise: null,
  graph: null
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

function getNodeKey(lng, lat) {
  return `${roundCoordinate(lng)},${roundCoordinate(lat)}`;
}

function ensureNode(graph, lng, lat) {
  const key = getNodeKey(lng, lat);
  if (!graph.nodes.has(key)) {
    graph.nodes.set(key, {
      id: key,
      lng: roundCoordinate(lng),
      lat: roundCoordinate(lat),
      neighbors: new Map()
    });
  }
  return graph.nodes.get(key);
}

function connectNodes(graph, fromNode, toNode) {
  const distance = haversineDistanceMeters([fromNode.lng, fromNode.lat], [toNode.lng, toNode.lat]);
  if (!Number.isFinite(distance) || distance <= 0) {
    return;
  }
  const existingForward = fromNode.neighbors.get(toNode.id);
  const existingBackward = toNode.neighbors.get(fromNode.id);
  const weight = Number.isFinite(existingForward) ? Math.min(existingForward, distance) : distance;
  fromNode.neighbors.set(toNode.id, weight);
  toNode.neighbors.set(fromNode.id, Number.isFinite(existingBackward) ? Math.min(existingBackward, distance) : distance);
  graph.edges += 1;
}

function buildGraphFromGeoJSON(data) {
  const graph = { nodes: new Map(), edges: 0 };
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    return graph;
  }

  data.features.forEach((feature) => {
    if (!feature || feature.type !== 'Feature') return;
    const geometry = feature.geometry;
    if (!geometry) return;
    if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
      const coords = geometry.coordinates;
      for (let index = 1; index < coords.length; index += 1) {
        const start = coords[index - 1];
        const end = coords[index];
        if (!Array.isArray(start) || !Array.isArray(end)) continue;
        const startNode = ensureNode(graph, start[0], start[1]);
        const endNode = ensureNode(graph, end[0], end[1]);
        connectNodes(graph, startNode, endNode);
      }
    } else if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
      geometry.coordinates.forEach((line) => {
        if (!Array.isArray(line)) return;
        for (let index = 1; index < line.length; index += 1) {
          const start = line[index - 1];
          const end = line[index];
          if (!Array.isArray(start) || !Array.isArray(end)) continue;
          const startNode = ensureNode(graph, start[0], start[1]);
          const endNode = ensureNode(graph, end[0], end[1]);
          connectNodes(graph, startNode, endNode);
        }
      });
    }
  });

  return graph;
}

async function loadNetworkGraph() {
  if (!networkState.loadPromise) {
    networkState.loadPromise = fetch(NETWORK_GEOJSON_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load offline network (${response.status})`);
        }
        return response.json();
      })
      .then((data) => {
        networkState.graph = buildGraphFromGeoJSON(data);
        return networkState.graph;
      })
      .catch((error) => {
        networkState.graph = { nodes: new Map(), edges: 0 };
        console.error('Failed to load offline network', error);
        throw error;
      });
  }
  return networkState.loadPromise;
}

function getGraph() {
  if (networkState.graph && networkState.graph.nodes.size) {
    return networkState.graph;
  }
  return null;
}

function findNearestNode(graph, coordinate, radiusMeters = MAX_NETWORK_RADIUS_METERS) {
  if (!graph || !Array.isArray(coordinate) || coordinate.length < 2) {
    return null;
  }
  let bestNode = null;
  let bestDistance = Infinity;
  graph.nodes.forEach((node) => {
    const distance = haversineDistanceMeters([node.lng, node.lat], coordinate);
    if (distance < bestDistance && distance <= radiusMeters) {
      bestDistance = distance;
      bestNode = node;
    }
  });
  return bestNode ? { node: bestNode, distance: bestDistance } : null;
}

function dijkstra(graph, startId, endId, allowedNodes) {
  if (!startId || !endId || startId === endId) {
    return startId === endId ? [startId] : null;
  }
  const visited = new Set();
  const distances = new Map();
  const previous = new Map();
  const queue = [];

  const pushQueue = (id, distance) => {
    queue.push({ id, distance });
    queue.sort((a, b) => a.distance - b.distance);
  };

  pushQueue(startId, 0);
  distances.set(startId, 0);

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    if (current.id === endId) {
      break;
    }

    const node = graph.nodes.get(current.id);
    if (!node) continue;

    node.neighbors.forEach((weight, neighborId) => {
      if (!graph.nodes.has(neighborId)) return;
      if (allowedNodes && !allowedNodes.has(neighborId)) return;
      if (allowedNodes && !allowedNodes.has(current.id)) return;
      const nextDistance = current.distance + weight;
      if (!distances.has(neighborId) || nextDistance < distances.get(neighborId)) {
        distances.set(neighborId, nextDistance);
        previous.set(neighborId, current.id);
        pushQueue(neighborId, nextDistance);
      }
    });
  }

  if (!previous.has(endId) && startId !== endId) {
    return null;
  }

  const path = [];
  let currentId = endId;
  path.unshift(currentId);
  while (previous.has(currentId)) {
    currentId = previous.get(currentId);
    path.unshift(currentId);
  }

  if (!path.length || path[0] !== startId) {
    return null;
  }

  return path;
}

function buildAllowedNodeSet(graph, centerCoordinate, radiusMeters = MAX_NETWORK_RADIUS_METERS) {
  if (!Array.isArray(centerCoordinate) || centerCoordinate.length < 2) {
    return null;
  }
  const allowed = new Set();
  graph.nodes.forEach((node, nodeId) => {
    const distance = haversineDistanceMeters([node.lng, node.lat], centerCoordinate);
    if (distance <= radiusMeters) {
      allowed.add(nodeId);
    }
  });
  return allowed.size ? allowed : null;
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

function buildPathCoordinates(graph, path, startCoordinate, endCoordinate) {
  const coordinates = [];
  const first = path[0];
  const last = path[path.length - 1];
  if (startCoordinate && startCoordinate.length >= 2) {
    coordinates.push([startCoordinate[0], startCoordinate[1], startCoordinate[2] ?? DEFAULT_ELEVATION]);
  } else if (first && graph.nodes.has(first)) {
    const node = graph.nodes.get(first);
    coordinates.push([node.lng, node.lat, DEFAULT_ELEVATION]);
  }

  for (let index = 0; index < path.length; index += 1) {
    const nodeId = path[index];
    const node = graph.nodes.get(nodeId);
    if (!node) continue;
    const lastCoord = coordinates[coordinates.length - 1];
    const candidate = [node.lng, node.lat, lastCoord?.[2] ?? DEFAULT_ELEVATION];
    if (!lastCoord || lastCoord[0] !== candidate[0] || lastCoord[1] !== candidate[1]) {
      coordinates.push(candidate);
    }
  }

  if (endCoordinate && endCoordinate.length >= 2) {
    const lastCoord = coordinates[coordinates.length - 1];
    const normalized = [endCoordinate[0], endCoordinate[1], endCoordinate[2] ?? DEFAULT_ELEVATION];
    if (!lastCoord || lastCoord[0] !== normalized[0] || lastCoord[1] !== normalized[1]) {
      coordinates.push(normalized);
    }
  }

  return coordinates;
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

async function ensureGraphLoaded() {
  if (getGraph()) {
    return networkState.graph;
  }
  return loadNetworkGraph();
}

export async function computeOfflineRouteSegment(rawWaypoints, options = {}) {
  const { radiusMeters = MAX_NETWORK_RADIUS_METERS } = options;
  const sanitized = sanitizeCoordinates(rawWaypoints);
  if (sanitized.length < 2) {
    throw new Error('Not enough coordinates to compute an offline segment');
  }

  const graph = await ensureGraphLoaded();
  if (!graph || !graph.nodes.size) {
    throw new Error('Offline network is not available');
  }

  const center = sanitized[0];
  const allowedNodes = buildAllowedNodeSet(graph, center, radiusMeters);

  const combined = [];
  const segments = [];

  for (let index = 1; index < sanitized.length; index += 1) {
    const start = sanitized[index - 1];
    const end = sanitized[index];
    const startNode = findNearestNode(graph, start, radiusMeters);
    const endNode = findNearestNode(graph, end, radiusMeters);
    if (!startNode || !endNode) {
      throw new Error('Unable to match waypoints to offline network');
    }

    const path = dijkstra(graph, startNode.node.id, endNode.node.id, allowedNodes);
    if (!path || !path.length) {
      throw new Error('No offline path found between waypoints');
    }

    const pathCoordinates = buildPathCoordinates(graph, path, start, end);
    if (pathCoordinates.length < 2) {
      throw new Error('Offline path contains too few coordinates');
    }

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
  networkState.graph = null;
}
