import { GeoJsonPathFinder, haversineDistanceKm } from './geojson-pathfinder.js';
import { createRouteSnapperPathFinder, ROUTE_SNAPPER_DEFAULTS } from './route-snapper-loader.js';

export const DEFAULT_NODE_CONNECTION_TOLERANCE_METERS = 2;
export const MAX_NODE_CONNECTION_TOLERANCE_METERS = 100;

const DEFAULT_SPEEDS = Object.freeze({
  'foot-hiking': 4.5,
  'cycling-regular': 15,
  'driving-car': 40
});
const DEFAULT_SNAP_TOLERANCE_METERS = 500;
const MIN_BRIDGE_DISTANCE_METERS = 1500;
const COORDINATE_EQUALITY_TOLERANCE_METERS = 1.5;
// Use a much tighter tolerance when we deduplicate consecutive coordinates so we only
// drop points that are effectively identical and preserve the path length when the
// source geometry contains very short segments.
const COORDINATE_DUPLICATE_TOLERANCE_METERS = 0.05;

const OFFLINE_ROUTER_DEBUG_PREFIX = '[OfflineRouter]';

function formatDistanceKm(distanceKm) {
  const km = Number(distanceKm);
  if (!Number.isFinite(km)) {
    return 'n/a';
  }
  if (Math.abs(km) >= 1) {
    return `${km.toFixed(2)} km`;
  }
  return `${(km * 1000).toFixed(0)} m`;
}

function formatElevationMeters(value) {
  const meters = Number(value);
  if (!Number.isFinite(meters)) {
    return '0 m';
  }
  return `${meters.toFixed(0)} m`;
}

function formatCoordinateForDebug(coord) {
  if (!Array.isArray(coord) || coord.length < 2) {
    return 'n/a';
  }
  const lng = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return 'n/a';
  }
  const base = `${lng.toFixed(5)}, ${lat.toFixed(5)}`;
  const elevation = coord.length > 2 ? Number(coord[2]) : null;
  if (Number.isFinite(elevation)) {
    return `${base} (${elevation.toFixed(0)}m)`;
  }
  return base;
}

function formatSnapForDebug(snap) {
  if (!snap) {
    return 'none';
  }
  const distanceLabel = formatDistanceKm(snap.distanceKm ?? (snap.distanceMeters ? snap.distanceMeters / 1000 : NaN));
  const pointLabel = Array.isArray(snap.point) ? formatCoordinateForDebug(snap.point) : null;
  if (snap.type === 'node') {
    const key = snap.node?.key ?? 'unknown';
    const pointSuffix = pointLabel ? ` (point ${pointLabel})` : '';
    return `node ${key} @ ${distanceLabel}${pointSuffix}`;
  }
  if (snap.type === 'edge') {
    const startKey = snap.edgeStart?.key ?? 'unknown';
    const endKey = snap.edgeEnd?.key ?? 'unknown';
    const fraction = Number(snap.fraction);
    const fractionLabel = Number.isFinite(fraction) ? `${(fraction * 100).toFixed(1)}%` : 'n/a';
    const pointSuffix = pointLabel ? `, point ${pointLabel}` : '';
    return `edge ${startKey}→${endKey} @ ${distanceLabel} (fraction ${fractionLabel}${pointSuffix})`;
  }
  return `${snap.type ?? 'unknown'} @ ${distanceLabel}`;
}

function formatMetricsForDebug(metrics) {
  if (!metrics) {
    return 'none';
  }
  return `${formatDistanceKm(metrics.distanceKm)} (↑${formatElevationMeters(metrics.ascent)} ↓${formatElevationMeters(metrics.descent)})`;
}

function formatPlanConnectors(plan) {
  if (!plan) {
    return null;
  }
  const segments = [];
  if (plan.startConnector) {
    segments.push(`start-waypoint: ${formatMetricsForDebug(plan.startConnector)}`);
  }
  if (plan.startApproach) {
    segments.push(`start-approach: ${formatMetricsForDebug(plan.startApproach)}`);
  }
  segments.push(`network: ${formatDistanceKm(plan.baseDistanceKm)}`);
  if (plan.endApproach) {
    segments.push(`end-approach: ${formatMetricsForDebug(plan.endApproach)}`);
  }
  if (plan.endConnector) {
    segments.push(`end-waypoint: ${formatMetricsForDebug(plan.endConnector)}`);
  }
  return segments.join(' | ');
}

function connectorReferenceCoordinate(connector, position) {
  if (!connector) {
    return null;
  }
  if (position === 'start') {
    return Array.isArray(connector.end) ? connector.end : null;
  }
  return Array.isArray(connector.start) ? connector.start : null;
}

function computeWaypointShiftKm({ waypoint, connector, segmentCoordinates, position }) {
  if (!Array.isArray(waypoint) || waypoint.length < 2) {
    return null;
  }
  const connectorDistanceKm = connector && Number.isFinite(connector.distanceKm)
    ? connector.distanceKm
    : null;
  if (connectorDistanceKm != null) {
    return connectorDistanceKm;
  }
  let reference = connectorReferenceCoordinate(connector, position);
  if (!reference && Array.isArray(segmentCoordinates) && segmentCoordinates.length) {
    const index = position === 'start' ? 0 : segmentCoordinates.length - 1;
    reference = segmentCoordinates[index];
  }
  if (!Array.isArray(reference) || reference.length < 2) {
    return null;
  }
  return haversineDistanceKm(waypoint, reference);
}

function formatWaypointShiftForDebug(info) {
  if (!info || !info.result || !info.result.segment) {
    return null;
  }
  const coordinates = Array.isArray(info.result.segment.coordinates)
    ? info.result.segment.coordinates
    : null;
  const plan = info.plan || {};
  const startShiftKm = computeWaypointShiftKm({
    waypoint: info.startWaypoint,
    connector: plan.startConnector,
    segmentCoordinates: coordinates,
    position: 'start'
  });
  const endShiftKm = computeWaypointShiftKm({
    waypoint: info.endWaypoint,
    connector: plan.endConnector,
    segmentCoordinates: coordinates,
    position: 'end'
  });
  if (startShiftKm == null && endShiftKm == null) {
    return null;
  }
  const parts = [];
  if (startShiftKm != null) {
    parts.push(`start=${formatDistanceKm(startShiftKm)}`);
  }
  if (endShiftKm != null) {
    parts.push(`end=${formatDistanceKm(endShiftKm)}`);
  }
  return parts.join(', ');
}

function logSegmentDebug(info) {
  if (typeof console !== 'object' || typeof console.info !== 'function') {
    return;
  }

  const lines = [];
  const indexLabel = Number.isInteger(info.segmentIndex)
    ? `Segment ${info.segmentIndex}`
    : 'Segment';
  const modeLabel = info.mode ? ` [${info.mode}]` : '';
  const resultLabel = info.result?.type ? ` – ${info.result.type}` : '';
  lines.push(`${indexLabel}${modeLabel}${resultLabel}`);
  lines.push(`  Waypoints: ${formatCoordinateForDebug(info.startWaypoint)} → ${formatCoordinateForDebug(info.endWaypoint)}`);
  lines.push(`  Snap start: ${formatSnapForDebug(info.startSnap)}${info.startTooFar ? ' (too far)' : ''}`);
  lines.push(`  Snap end: ${formatSnapForDebug(info.endSnap)}${info.endTooFar ? ' (too far)' : ''}`);
  lines.push(`  Options: start=${info.startOptionsCount ?? 0}, end=${info.endOptionsCount ?? 0}`);

  if (info.result?.type === 'network' && info.plan) {
    const startKey = info.plan.startNodeKey ?? 'unknown';
    const endKey = info.plan.endNodeKey ?? 'unknown';
    lines.push(`  Network nodes: ${startKey} → ${endKey}`);
    lines.push(`  Distance breakdown: ${formatPlanConnectors(info.plan)}`);
    lines.push(`  Total: ${formatDistanceKm(info.result.segment?.distanceKm)} (↑${formatElevationMeters(info.result.segment?.ascent)} ↓${formatElevationMeters(info.result.segment?.descent)})`);
    lines.push(`  Coordinates: ${Array.isArray(info.result.segment?.coordinates) ? info.result.segment.coordinates.length : 0}`);
  } else if (info.result?.type === 'direct') {
    lines.push(`  Direct distance: ${formatDistanceKm(info.result.segment?.distanceKm)}`);
  } else if (info.result?.type === 'failed') {
    const reason = info.result.reason ? ` (${info.result.reason})` : '';
    lines.push(`  Failed${reason}`);
  }

  const waypointShift = formatWaypointShiftForDebug(info);
  if (waypointShift) {
    lines.push(`  Waypoint shift: ${waypointShift}`);
  }

  if (info.result?.note) {
    lines.push(`  Note: ${info.result.note}`);
  }

  console.info(`${OFFLINE_ROUTER_DEBUG_PREFIX} ${lines.join('\n')}`);
}

function logPreservedSegmentDebug(info) {
  if (typeof console !== 'object' || typeof console.info !== 'function') {
    return;
  }
  const { segmentIndex, mode, startWaypoint, endWaypoint, metrics, coordinateCount } = info;
  const indexLabel = Number.isInteger(segmentIndex)
    ? `Segment ${segmentIndex}`
    : 'Segment';
  const modeLabel = mode ? ` [${mode}]` : '';
  const lines = [];
  lines.push(`${indexLabel}${modeLabel} – preserved`);
  lines.push(`  Waypoints: ${formatCoordinateForDebug(startWaypoint)} → ${formatCoordinateForDebug(endWaypoint)}`);
  lines.push(`  Distance: ${formatDistanceKm(metrics?.distanceKm)} (↑${formatElevationMeters(metrics?.ascent)} ↓${formatElevationMeters(metrics?.descent)})`);
  lines.push(`  Coordinates: ${coordinateCount ?? 0}`);
  console.info(`${OFFLINE_ROUTER_DEBUG_PREFIX} ${lines.join('\n')}`);
}

function logRouteSummaryDebug(info) {
  if (typeof console !== 'object' || typeof console.info !== 'function') {
    return;
  }
  const { segmentCount, totalDistanceKm, totalAscent, totalDescent, coordinateCount, mode } = info;
  const lines = [];
  const modeLabel = mode ? ` [${mode}]` : '';
  lines.push(`Route summary${modeLabel}`);
  lines.push(`  Segments: ${segmentCount}`);
  lines.push(`  Distance: ${formatDistanceKm(totalDistanceKm)} (↑${formatElevationMeters(totalAscent)} ↓${formatElevationMeters(totalDescent)})`);
  lines.push(`  Coordinates: ${coordinateCount}`);
  console.info(`${OFFLINE_ROUTER_DEBUG_PREFIX} ${lines.join('\n')}`);
}

function coordinatesAlmostEqual(a, b, toleranceMeters = COORDINATE_EQUALITY_TOLERANCE_METERS) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) {
    return false;
  }
  const distanceKm = haversineDistanceKm(a, b);
  return distanceKm * 1000 <= toleranceMeters;
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

function buildSegmentResult(metrics, fallbackStart, fallbackEnd) {
  if (metrics) {
    return {
      distanceKm: metrics.distanceKm,
      ascent: metrics.ascent,
      descent: metrics.descent,
      coordinates: [metrics.start, metrics.end]
    };
  }
  const start = mergeCoordinates(fallbackStart, fallbackEnd);
  const end = mergeCoordinates(fallbackEnd, fallbackStart);
  return {
    distanceKm: 0,
    ascent: 0,
    descent: 0,
    coordinates: [start, end]
  };
}

function createNodeOption({ node, fromCoord, toCoord }) {
  if (!node || !Array.isArray(fromCoord) || !Array.isArray(toCoord)) {
    return null;
  }
  if (!Array.isArray(node.coord)) {
    return null;
  }
  const metrics = computeSegmentMetrics(fromCoord, toCoord);
  return {
    key: node.key,
    node,
    segment: buildSegmentResult(metrics, fromCoord, toCoord)
  };
}

function collectSnapOptions(snap, optionFactory) {
  if (!snap || typeof optionFactory !== 'function') {
    return [];
  }
  const options = [];
  const seenKeys = new Set();
  const pushOption = (node) => {
    if (!node) {
      return;
    }
    const option = optionFactory(node);
    if (!option) {
      return;
    }
    const key = option.key;
    if (key && seenKeys.has(key)) {
      return;
    }
    if (key) {
      seenKeys.add(key);
    }
    options.push(option);
  };
  if (snap.type === 'node') {
    pushOption(snap.node);
  } else if (snap.type === 'edge') {
    pushOption(snap.edgeStart);
    if (snap.edgeEnd && (!snap.edgeStart || snap.edgeEnd.key !== snap.edgeStart.key)) {
      pushOption(snap.edgeEnd);
    }
  }
  return options;
}

function snapsShareEdge(a, b) {
  if (!a || !b || a.type !== 'edge' || b.type !== 'edge') {
    return false;
  }
  const aStart = a.edgeStart?.key;
  const aEnd = a.edgeEnd?.key;
  const bStart = b.edgeStart?.key;
  const bEnd = b.edgeEnd?.key;
  if (!aStart || !aEnd || !bStart || !bEnd) {
    return false;
  }
  return (aStart === bStart && aEnd === bEnd) || (aStart === bEnd && aEnd === bStart);
}

function appendCoordinateSequence(target, sequence) {
  if (!Array.isArray(target) || !Array.isArray(sequence)) {
    return;
  }
  sequence.forEach((coord) => {
    if (!Array.isArray(coord) || coord.length < 2) {
      return;
    }
    if (!target.length
      || !coordinatesAlmostEqual(target[target.length - 1], coord, COORDINATE_DUPLICATE_TOLERANCE_METERS)) {
      target.push(coord);
    }
  });
}

function buildSegmentFromPortions(portions = []) {
  const coordinates = [];
  const metadata = [];
  let cumulativeDistanceKm = 0;

  const appendPortion = (coords, attributes) => {
    if (!Array.isArray(coords)) {
      return;
    }
    coords.forEach((coord) => {
      const normalized = sanitizeCoordinate(coord);
      if (!normalized) {
        return;
      }
      if (!coordinates.length) {
        coordinates.push(normalized);
        return;
      }
      const last = coordinates[coordinates.length - 1];
      if (coordinatesAlmostEqual(last, normalized, COORDINATE_DUPLICATE_TOLERANCE_METERS)) {
        return;
      }
      const metrics = computeSegmentMetrics(last, normalized);
      if (!metrics || !Number.isFinite(metrics.distanceKm) || metrics.distanceKm <= 0) {
        coordinates[coordinates.length - 1] = metrics?.start ?? last;
        coordinates.push(metrics?.end ?? normalized);
        return;
      }
      const startCoord = metrics.start ?? last;
      const endCoord = metrics.end ?? normalized;
      coordinates[coordinates.length - 1] = startCoord;
      coordinates.push(endCoord);
      const costMultiplier = Number.isFinite(attributes?.costMultiplier) && attributes.costMultiplier > 0
        ? attributes.costMultiplier
        : 1;
      metadata.push({
        start: startCoord,
        end: endCoord,
        distanceKm: metrics.distanceKm,
        ascent: metrics.ascent,
        descent: metrics.descent,
        costMultiplier,
        source: attributes?.source ?? 'network',
        cumulativeStartKm: cumulativeDistanceKm,
        cumulativeEndKm: cumulativeDistanceKm + metrics.distanceKm
      });
      cumulativeDistanceKm += metrics.distanceKm;
    });
  };

  portions.forEach((portion) => {
    if (!portion || !Array.isArray(portion.coordinates) || portion.coordinates.length < 2) {
      return;
    }
    appendPortion(portion.coordinates, portion);
  });

  if (coordinates.length < 2) {
    return null;
  }

  const distanceKm = metadata.reduce((sum, entry) => sum + (entry.distanceKm ?? 0), 0);
  const ascent = metadata.reduce((sum, entry) => sum + (entry.ascent ?? 0), 0);
  const descent = metadata.reduce((sum, entry) => sum + (entry.descent ?? 0), 0);

  return {
    coordinates,
    distanceKm,
    ascent,
    descent,
    metadata
  };
}

function buildDirectSegment(startCoord, endCoord) {
  const metrics = computeSegmentMetrics(startCoord, endCoord);
  if (!metrics) {
    return null;
  }

  const segment = buildSegmentFromPortions([
    {
      coordinates: [metrics.start, metrics.end],
      costMultiplier: 1,
      source: 'direct'
    }
  ]);

  if (segment) {
    return segment;
  }

  return {
    coordinates: [metrics.start, metrics.end],
    distanceKm: metrics.distanceKm,
    ascent: metrics.ascent,
    descent: metrics.descent,
    metadata: [
      {
        start: metrics.start,
        end: metrics.end,
        distanceKm: metrics.distanceKm,
        ascent: metrics.ascent,
        descent: metrics.descent,
        costMultiplier: 1,
        source: 'direct',
        cumulativeStartKm: 0,
        cumulativeEndKm: metrics.distanceKm
      }
    ]
  };
}

function sanitizeCoordinate(coord) {
  if (!Array.isArray(coord) || coord.length < 2) {
    return null;
  }
  const lng = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }
  const elevation = coord.length > 2 && Number.isFinite(coord[2]) ? Number(coord[2]) : 0;
  return [lng, lat, elevation];
}

function sanitizeCoordinateSequence(coords) {
  if (!Array.isArray(coords)) {
    return null;
  }
  const sequence = [];
  for (let index = 0; index < coords.length; index += 1) {
    const normalized = sanitizeCoordinate(coords[index]);
    if (!normalized) {
      continue;
    }
    const isLast = index === coords.length - 1;
    if (sequence.length) {
      const previous = sequence[sequence.length - 1];
      if (coordinatesAlmostEqual(previous, normalized, COORDINATE_DUPLICATE_TOLERANCE_METERS)) {
        if (isLast && sequence.length === 1) {
          sequence.push(normalized);
        }
        continue;
      }
    }
    sequence.push(normalized);
  }
  return sequence.length >= 2 ? sequence : null;
}

function accumulateSequenceMetrics(coords) {
  if (!Array.isArray(coords) || coords.length < 2) {
    return { distanceKm: 0, ascent: 0, descent: 0 };
  }
  let distanceKm = 0;
  let ascent = 0;
  let descent = 0;
  for (let index = 0; index < coords.length - 1; index += 1) {
    const metrics = computeSegmentMetrics(coords[index], coords[index + 1]);
    if (!metrics) {
      continue;
    }
    distanceKm += metrics.distanceKm;
    ascent += metrics.ascent;
    descent += metrics.descent;
  }
  return { distanceKm, ascent, descent };
}

export class OfflineRouter {
  constructor(options = {}) {
    const {
      networkUrl,
      supportedModes,
      averageSpeeds,
      maxSnapDistanceMeters,
      pathFinderOptions,
      debugLogging,
      preferRouteSnapper,
      routeSnapperOptions
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
    this.pathFinderOptions = {
      tolerance: 1e-3,
      nodeConnectionToleranceMeters: DEFAULT_NODE_CONNECTION_TOLERANCE_METERS,
      nodeBucketSizeDegrees: 0.002,
      ...(pathFinderOptions || {})
    };

    this.preferRouteSnapper = preferRouteSnapper !== false;
    this.routeSnapperOptions = {
      ...ROUTE_SNAPPER_DEFAULTS,
      ...(routeSnapperOptions || {})
    };

    this.debugLoggingEnabled = !!debugLogging;

    this.networkGeoJSON = null;
    this.pathFinder = null;
    this.pathFinderSource = null;
    this.readyPromise = null;
  }

  disposePathFinder() {
    if (this.pathFinder && typeof this.pathFinder.dispose === 'function') {
      try {
        this.pathFinder.dispose();
      } catch (error) {
        console.warn(`${OFFLINE_ROUTER_DEBUG_PREFIX} Failed to dispose current pathfinder`, error);
      }
    }
    this.pathFinder = null;
    this.pathFinderSource = null;
  }

  setDebugLoggingEnabled(enabled) {
    this.debugLoggingEnabled = !!enabled;
  }

  supportsMode(mode) {
    return this.supportedModes.has(mode);
  }

  isUsingRouteSnapper() {
    return this.pathFinderSource === 'route-snapper';
  }

  getPathFinderSource() {
    return this.pathFinderSource || 'unknown';
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
    if (!data || typeof data !== 'object') {
      throw new Error('Offline network payload is not valid GeoJSON data');
    }
    await this.setNetworkGeoJSON(data);
  }

  setNetworkGeoJSON(geojson) {
    if (!geojson || typeof geojson !== 'object') {
      throw new Error('OfflineRouter requires a valid GeoJSON FeatureCollection');
    }

    if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
      throw new Error('OfflineRouter network data must be a GeoJSON FeatureCollection');
    }

    const isSameObject = this.networkGeoJSON === geojson;
    this.networkGeoJSON = geojson;
    this.readyPromise = this.initializePathFinder(this.networkGeoJSON);
    return this.readyPromise.then(() => !isSameObject);
  }

  async initializePathFinder(geojson) {
    this.disposePathFinder();

    if (this.preferRouteSnapper) {
      try {
        const pathFinder = await createRouteSnapperPathFinder(geojson, {
          ...this.routeSnapperOptions,
          fallbackPathFinderOptions: this.pathFinderOptions
        });
        if (pathFinder) {
          this.pathFinder = pathFinder;
          this.pathFinderSource = 'route-snapper';
          console.info(`${OFFLINE_ROUTER_DEBUG_PREFIX} Using RouteSnapper pathfinder`);
          return;
        }
      } catch (error) {
        console.warn(`${OFFLINE_ROUTER_DEBUG_PREFIX} RouteSnapper initialization failed`, error);
      }
    }

    this.pathFinder = new GeoJsonPathFinder(geojson, this.pathFinderOptions);
    this.pathFinderSource = 'geojson';
    if (this.preferRouteSnapper) {
      console.info(`${OFFLINE_ROUTER_DEBUG_PREFIX} Falling back to GeoJsonPathFinder`);
    }
  }

  getNodeConnectionToleranceMeters() {
    const tolerance = Number(this.pathFinderOptions?.nodeConnectionToleranceMeters);
    return Number.isFinite(tolerance) && tolerance >= 0
      ? Math.min(tolerance, MAX_NODE_CONNECTION_TOLERANCE_METERS)
      : DEFAULT_NODE_CONNECTION_TOLERANCE_METERS;
  }

  setNodeConnectionToleranceMeters(toleranceMeters) {
    const meters = Number(toleranceMeters);
    if (!Number.isFinite(meters) || meters < 0) {
      return false;
    }

    const clampedMeters = Math.min(meters, MAX_NODE_CONNECTION_TOLERANCE_METERS);

    const current = Number(this.pathFinderOptions?.nodeConnectionToleranceMeters);
    if (Number.isFinite(current) && Math.abs(current - clampedMeters) < 1e-9) {
      return false;
    }

    this.pathFinderOptions = {
      ...this.pathFinderOptions,
      nodeConnectionToleranceMeters: clampedMeters
    };

    if (this.networkGeoJSON) {
      this.readyPromise = this.initializePathFinder(this.networkGeoJSON);
    }

    return true;
  }

  findNearestNode(coord) {
    if (!this.pathFinder) {
      return null;
    }
    return this.pathFinder.findNearestNode(coord);
  }

  findNearestPoint(coord) {
    if (!this.pathFinder || typeof this.pathFinder.findNearestPoint !== 'function') {
      return null;
    }
    return this.pathFinder.findNearestPoint(coord);
  }

  async getRoute(waypoints, { mode, preservedSegments } = {}) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      return null;
    }
    const travelMode = typeof mode === 'string' && this.supportsMode(mode)
      ? mode
      : Array.from(this.supportedModes)[0];

    await this.ensureReady();

    const preservedMap = new Map();
    if (Array.isArray(preservedSegments)) {
      preservedSegments.forEach((segment) => {
        if (!segment) {
          return;
        }
        const startIndex = Number(segment.startIndex);
        const endIndex = Number(segment.endIndex);
        const coords = sanitizeCoordinateSequence(segment.coordinates);
        if (!Number.isInteger(startIndex) || endIndex !== startIndex + 1 || !coords) {
          return;
        }
        const metadata = Array.isArray(segment.metadata)
          ? segment.metadata.map((entry) => (entry && typeof entry === 'object' ? { ...entry } : null)).filter(Boolean)
          : [];
        preservedMap.set(startIndex, { endIndex, coordinates: coords, metadata });
      });
    }

    const coordinates = [];
    const segments = [];
    const coordinateMetadata = [];
    let totalDistanceKm = 0;
    let totalAscent = 0;
    let totalDescent = 0;

    for (let index = 0; index < waypoints.length - 1; index += 1) {
      const start = waypoints[index];
      const end = waypoints[index + 1];
      const preserved = preservedMap.get(index);
      const debugContext = {
        segmentIndex: index,
        mode: travelMode,
        startWaypoint: start,
        endWaypoint: end
      };
      if (preserved && preserved.endIndex === index + 1) {
        const preservedCoords = preserved.coordinates.map((coord) => coord.slice());
        if (preservedCoords.length >= 2) {
          const first = preservedCoords[0];
          const last = preservedCoords[preservedCoords.length - 1];
          const normalizedStart = sanitizeCoordinate(start) || first;
          const normalizedEnd = sanitizeCoordinate(end) || last;
          if (coordinatesAlmostEqual(first, normalizedStart) && coordinatesAlmostEqual(last, normalizedEnd)) {
            preservedCoords[0] = mergeCoordinates(start, preservedCoords[0]);
            preservedCoords[preservedCoords.length - 1] = mergeCoordinates(end, preservedCoords[preservedCoords.length - 1]);
            const metrics = accumulateSequenceMetrics(preservedCoords);
            appendCoordinateSequence(coordinates, preservedCoords);
            totalDistanceKm += metrics.distanceKm;
            totalAscent += metrics.ascent;
            totalDescent += metrics.descent;
            const segmentMetadata = Array.isArray(preserved.metadata)
              ? preserved.metadata.map((entry) => ({ ...entry }))
              : [];
            const offsetKm = totalDistanceKm - metrics.distanceKm;
            segmentMetadata.forEach((entry) => {
              if (!entry) {
                return;
              }
              const distanceKm = Number(entry.distanceKm) || 0;
              const startKm = offsetKm + (Number(entry.cumulativeStartKm) || 0);
              const endKm = offsetKm + (Number(entry.cumulativeEndKm) || distanceKm);
              coordinateMetadata.push({
                distanceKm,
                ascent: Number(entry.ascent) || 0,
                descent: Number(entry.descent) || 0,
                costMultiplier: Number.isFinite(entry.costMultiplier) && entry.costMultiplier > 0
                  ? entry.costMultiplier
                  : 1,
                source: entry.source ?? 'preserved',
                start: Array.isArray(entry.start) ? entry.start.slice() : null,
                end: Array.isArray(entry.end) ? entry.end.slice() : null,
                startDistanceKm: startKm,
                endDistanceKm: endKm
              });
            });
            segments.push({
              distance: metrics.distanceKm * 1000,
              duration: this.estimateDurationSeconds(metrics.distanceKm, travelMode),
              ascent: metrics.ascent,
              descent: metrics.descent,
              start_index: index,
              end_index: index + 1,
              metadata: segmentMetadata
            });
            if (this.debugLoggingEnabled) {
              logPreservedSegmentDebug({
                segmentIndex: index,
                mode: travelMode,
                startWaypoint: start,
                endWaypoint: end,
                metrics,
                coordinateCount: preservedCoords.length
              });
            }
            continue;
          }
        }
      }
      const segment = this.findPathBetween(start, end, travelMode, debugContext);
      if (!segment || !Array.isArray(segment.coordinates) || segment.coordinates.length < 2) {
        throw new Error('No offline route found between the selected points');
      }
      appendCoordinateSequence(coordinates, segment.coordinates);
      totalDistanceKm += segment.distanceKm;
      totalAscent += segment.ascent;
      totalDescent += segment.descent;
      const offsetKm = totalDistanceKm - segment.distanceKm;
      const segmentMetadata = Array.isArray(segment.metadata)
        ? segment.metadata.map((entry) => ({ ...entry }))
        : [];
      segmentMetadata.forEach((entry) => {
        if (!entry) {
          return;
        }
        const distanceKm = Number(entry.distanceKm) || 0;
        const startKm = offsetKm + (Number(entry.cumulativeStartKm) || 0);
        const endKm = offsetKm + (Number(entry.cumulativeEndKm) || distanceKm);
        coordinateMetadata.push({
          distanceKm,
          ascent: Number(entry.ascent) || 0,
          descent: Number(entry.descent) || 0,
          costMultiplier: Number.isFinite(entry.costMultiplier) && entry.costMultiplier > 0
            ? entry.costMultiplier
            : 1,
          source: entry.source ?? 'network',
          start: Array.isArray(entry.start) ? entry.start.slice() : null,
          end: Array.isArray(entry.end) ? entry.end.slice() : null,
          startDistanceKm: startKm,
          endDistanceKm: endKm
        });
      });
      segments.push({
        distance: segment.distanceKm * 1000,
        duration: this.estimateDurationSeconds(segment.distanceKm, travelMode),
        ascent: segment.ascent,
        descent: segment.descent,
        start_index: index,
        end_index: index + 1,
        metadata: segmentMetadata
      });
    }

    const summary = {
      distance: totalDistanceKm * 1000,
      duration: this.estimateDurationSeconds(totalDistanceKm, travelMode),
      ascent: totalAscent,
      descent: totalDescent
    };

    if (this.debugLoggingEnabled) {
      logRouteSummaryDebug({
        segmentCount: segments.length,
        totalDistanceKm,
        totalAscent,
        totalDescent,
        coordinateCount: coordinates.length,
        mode: travelMode
      });
    }

    return {
      type: 'Feature',
      properties: {
        profile: travelMode,
        summary,
        segments,
        segment_metadata: segments.map((segment) => Array.isArray(segment.metadata) ? segment.metadata : []),
        coordinate_metadata: coordinateMetadata
      },
      geometry: {
        type: 'LineString',
        coordinates
      }
    };
  }

  getNetworkDebugGeoJSON(options = {}) {
    const base = this.getNetworkGeoJSON();
    if (!base) {
      return null;
    }
    const { intersectionsOnly = true } = options;
    const features = [];
    if (Array.isArray(base.features)) {
      base.features.forEach((feature) => {
        if (feature) {
          features.push(feature);
        }
      });
    }
    if (this.pathFinder && typeof this.pathFinder.getAllNodes === 'function') {
      const nodes = this.pathFinder.getAllNodes();
      nodes.forEach((node) => {
        if (!node || !Array.isArray(node.coord)) {
          return;
        }
        const degree = Number(node.degree) || 0;
        if (intersectionsOnly && degree < 3) {
          return;
        }
        const coordinates = sanitizeCoordinate(node.coord);
        if (!coordinates) {
          return;
        }
        features.push({
          type: 'Feature',
          properties: {
            featureType: 'network-node',
            nodeDegree: degree
          },
          geometry: {
            type: 'Point',
            coordinates
          }
        });
      });
    }
    return { type: 'FeatureCollection', features };
  }

  estimateDurationSeconds(distanceKm, mode) {
    const speed = Number(this.averageSpeeds[mode]);
    if (!Number.isFinite(speed) || speed <= 0) {
      return 0;
    }
    const hours = distanceKm / speed;
    return Math.max(0, hours * 3600);
  }

  findPathBetween(startCoord, endCoord, mode, debugContext = {}) {
    if (!this.pathFinder) {
      throw new Error('Offline network is unavailable for routing');
    }

    const debugInfo = {
      segmentIndex: Number.isInteger(debugContext.segmentIndex) ? debugContext.segmentIndex : null,
      mode,
      startWaypoint: Array.isArray(startCoord) ? startCoord : debugContext.startWaypoint,
      endWaypoint: Array.isArray(endCoord) ? endCoord : debugContext.endWaypoint,
      startOptionsCount: 0,
      endOptionsCount: 0
    };

    const returnWithDebug = (result) => {
      if (this.debugLoggingEnabled) {
        logSegmentDebug({ ...debugInfo, result });
      }
      return result.segment;
    };

    const returnDirectOrFailure = (reason, errorMessage) => {
      const direct = buildDirectSegment(startCoord, endCoord);
      if (direct) {
        return returnWithDebug({
          type: 'direct',
          segment: direct,
          reason
        });
      }
      returnWithDebug({
        type: 'failed',
        segment: null,
        reason
      });
      if (errorMessage) {
        throw new Error(errorMessage);
      }
      return null;
    };

    const startSnap = this.pathFinder.findNearestPoint(startCoord);
    const endSnap = this.pathFinder.findNearestPoint(endCoord);
    if (!startSnap || !endSnap) {
      throw new Error('Offline network is unavailable for routing');
    }

    const startTooFar = startSnap.distanceMeters > this.maxSnapDistanceMeters;
    const endTooFar = endSnap.distanceMeters > this.maxSnapDistanceMeters;

    debugInfo.startSnap = startSnap;
    debugInfo.endSnap = endSnap;
    debugInfo.startTooFar = !!startTooFar;
    debugInfo.endTooFar = !!endTooFar;

    const maxBridgeDistanceMeters = Math.max(this.maxSnapDistanceMeters, MIN_BRIDGE_DISTANCE_METERS);
    if ((startTooFar && startSnap.distanceMeters > maxBridgeDistanceMeters)
      || (endTooFar && endSnap.distanceMeters > maxBridgeDistanceMeters)) {
      return returnDirectOrFailure('snap-distance', 'Selected points are too far from the offline routing network');
    }

    const startPoint = Array.isArray(startSnap.point) ? startSnap.point.slice(0, 3) : null;
    const endPoint = Array.isArray(endSnap.point) ? endSnap.point.slice(0, 3) : null;

    const startConnector = startPoint ? computeSegmentMetrics(startCoord, startPoint) : null;
    const endConnector = endPoint ? computeSegmentMetrics(endPoint, endCoord) : null;

    const shareSameEdge = snapsShareEdge(startSnap, endSnap);
    if (shareSameEdge && startPoint && endPoint) {
      const baseMetrics = computeSegmentMetrics(startPoint, endPoint);
      if (baseMetrics && Number.isFinite(baseMetrics.distanceKm)) {
        debugInfo.plan = {
          baseDistanceKm: baseMetrics.distanceKm,
          startConnector,
          endConnector,
          startApproach: null,
          endApproach: null,
          sharedEdge: true
        };

        let sharedEdgeMultiplier = 1;
        if (startSnap.edgeStart && startSnap.edgeEnd) {
          const edge = startSnap.edgeStart.edges?.get(startSnap.edgeEnd.key);
          if (edge && Number.isFinite(edge.distanceKm) && edge.distanceKm > 0) {
            const derived = edge.weight / edge.distanceKm;
            if (Number.isFinite(derived) && derived > 0) {
              sharedEdgeMultiplier = derived;
            }
          }
        }

        const portions = [];
        if (startConnector && startConnector.distanceKm > 0) {
          portions.push({
            coordinates: [startConnector.start, startConnector.end],
            costMultiplier: 1,
            source: 'connector'
          });
        } else if (Array.isArray(startCoord) && Array.isArray(startPoint)) {
          const mergedStart = mergeCoordinates(startCoord, startPoint);
          portions.push({
            coordinates: [mergedStart, startPoint],
            costMultiplier: 1,
            source: 'connector'
          });
        }

        portions.push({
          coordinates: [baseMetrics.start, baseMetrics.end],
          costMultiplier: sharedEdgeMultiplier,
          source: 'network'
        });

        if (endConnector && endConnector.distanceKm > 0) {
          portions.push({
            coordinates: [endConnector.start, endConnector.end],
            costMultiplier: 1,
            source: 'connector'
          });
        } else if (Array.isArray(endCoord) && Array.isArray(endPoint)) {
          const mergedEnd = mergeCoordinates(endPoint, endCoord);
          portions.push({
            coordinates: [mergedEnd, endCoord],
            costMultiplier: 1,
            source: 'connector'
          });
        }

        const segment = buildSegmentFromPortions(portions);
        if (segment) {
          return returnWithDebug({
            type: 'shared-edge',
            segment
          });
        }
      }
    }

    const startOptions = startPoint
      ? collectSnapOptions(startSnap, (node) => createNodeOption({
        node,
        fromCoord: startPoint,
        toCoord: node.coord
      }))
      : [];

    debugInfo.startOptionsCount = startOptions.length;

    const endOptions = endPoint
      ? collectSnapOptions(endSnap, (node) => createNodeOption({
        node,
        fromCoord: node.coord,
        toCoord: endPoint
      }))
      : [];

    debugInfo.endOptionsCount = endOptions.length;

    if (!startOptions.length || !endOptions.length) {
      const direct = buildDirectSegment(startCoord, endCoord);
      if (direct) {
        return returnWithDebug({
          type: 'direct',
          segment: direct,
          reason: 'no-network-options'
        });
      }
      return returnWithDebug({
        type: 'failed',
        segment: null,
        reason: 'no-network-options'
      });
    }

    let bestPlan = null;

    startOptions.forEach((startOption) => {
      endOptions.forEach((endOption) => {
        const path = this.pathFinder.buildPath(startOption.key, endOption.key, mode);
        if (!path || !Array.isArray(path.coordinates) || !path.coordinates.length) {
          return;
        }
        const baseDistanceKm = Number(path.distanceKm) || 0;
        const baseAscent = Number(path.ascent) || 0;
        const baseDescent = Number(path.descent) || 0;
        const startSegment = startOption.segment;
        const endSegment = endOption.segment;

        const totalDistanceKm = baseDistanceKm
          + (startSegment?.distanceKm || 0)
          + (endSegment?.distanceKm || 0)
          + (startConnector?.distanceKm || 0)
          + (endConnector?.distanceKm || 0);

        if (!bestPlan || totalDistanceKm < bestPlan.totalDistanceKm - 1e-9) {
          const totalAscent = baseAscent
            + (startSegment?.ascent || 0)
            + (endSegment?.ascent || 0)
            + (startConnector?.ascent || 0)
            + (endConnector?.ascent || 0);
          const totalDescent = baseDescent
            + (startSegment?.descent || 0)
            + (endSegment?.descent || 0)
            + (startConnector?.descent || 0)
            + (endConnector?.descent || 0);
          bestPlan = {
            path,
            startOption,
            endOption,
            totalDistanceKm,
            totalAscent,
            totalDescent,
            baseDistanceKm,
            baseAscent,
            baseDescent,
            startConnector,
            endConnector,
            startApproach: startSegment,
            endApproach: endSegment
          };
        }
      });
    });

    if (!bestPlan) {
      const fallback = returnDirectOrFailure('no-path');
      if (fallback) {
        return fallback;
      }
      return null;
    }

    debugInfo.plan = {
      startNodeKey: bestPlan.startOption?.key,
      endNodeKey: bestPlan.endOption?.key,
      baseDistanceKm: bestPlan.baseDistanceKm,
      startConnector: bestPlan.startConnector,
      endConnector: bestPlan.endConnector,
      startApproach: bestPlan.startApproach,
      endApproach: bestPlan.endApproach
    };

    const portions = [];

    if (startConnector && startConnector.distanceKm > 0) {
      portions.push({
        coordinates: [startConnector.start, startConnector.end],
        costMultiplier: 1,
        source: 'connector'
      });
    } else if (Array.isArray(startCoord) && startCoord.length >= 2 && Array.isArray(startPoint)) {
      const mergedStart = mergeCoordinates(startCoord, startPoint);
      portions.push({
        coordinates: [mergedStart, startPoint],
        costMultiplier: 1,
        source: 'connector'
      });
    }

    if (Array.isArray(bestPlan.startApproach?.coordinates)) {
      portions.push({
        coordinates: bestPlan.startApproach.coordinates,
        costMultiplier: 1,
        source: 'approach'
      });
    }

    if (Array.isArray(bestPlan.path?.edges)) {
      bestPlan.path.edges.forEach((edge) => {
        if (!edge) {
          return;
        }
        const coords = [edge.start, edge.end].filter((coord) => Array.isArray(coord));
        if (coords.length < 2) {
          return;
        }
        portions.push({
          coordinates: coords,
          costMultiplier: Number.isFinite(edge.costMultiplier) && edge.costMultiplier > 0
            ? edge.costMultiplier
            : 1,
          source: 'network'
        });
      });
    } else {
      const fallbackPath = bestPlan.path.coordinates
        .map((coord) => (Array.isArray(coord) ? coord.slice(0, 3) : null))
        .filter((coord) => Array.isArray(coord) && coord.length >= 2);
      if (fallbackPath.length >= 2) {
        portions.push({
          coordinates: fallbackPath,
          costMultiplier: 1,
          source: 'network'
        });
      }
    }

    if (Array.isArray(bestPlan.endApproach?.coordinates)) {
      portions.push({
        coordinates: bestPlan.endApproach.coordinates,
        costMultiplier: 1,
        source: 'approach'
      });
    }

    if (endConnector && endConnector.distanceKm > 0) {
      portions.push({
        coordinates: [endConnector.start, endConnector.end],
        costMultiplier: 1,
        source: 'connector'
      });
    } else if (Array.isArray(endCoord) && endCoord.length >= 2 && Array.isArray(endPoint)) {
      const mergedEnd = mergeCoordinates(endPoint, endCoord);
      portions.push({
        coordinates: [mergedEnd, endCoord],
        costMultiplier: 1,
        source: 'connector'
      });
    }

    const result = buildSegmentFromPortions(portions);

    if (!result || !Array.isArray(result.coordinates) || result.coordinates.length < 2) {
      const fallback = returnDirectOrFailure('insufficient-coordinates');
      if (fallback) {
        return fallback;
      }
      return null;
    }

    return returnWithDebug({
      type: 'network',
      segment: result
    });
  }
}
