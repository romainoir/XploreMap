import { GeoJsonPathFinder, haversineDistanceKm } from './geojson-pathfinder.js';

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
    this.pathFinderOptions = { tolerance: 1e-3, ...(pathFinderOptions || {}) };

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
    if (!data || typeof data !== 'object') {
      throw new Error('Offline network payload is not valid GeoJSON data');
    }
    this.setNetworkGeoJSON(data);
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
    this.pathFinder = new GeoJsonPathFinder(this.networkGeoJSON, this.pathFinderOptions);
    this.readyPromise = Promise.resolve();
    return !isSameObject;
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
        preservedMap.set(startIndex, { endIndex, coordinates: coords });
      });
    }

    const coordinates = [];
    const segments = [];
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
            segments.push({
              distance: metrics.distanceKm * 1000,
              duration: this.estimateDurationSeconds(metrics.distanceKm, travelMode),
              ascent: metrics.ascent,
              descent: metrics.descent,
              start_index: index,
              end_index: index + 1
            });
            logPreservedSegmentDebug({
              segmentIndex: index,
              mode: travelMode,
              startWaypoint: start,
              endWaypoint: end,
              metrics,
              coordinateCount: preservedCoords.length
            });
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

    logRouteSummaryDebug({
      segmentCount: segments.length,
      totalDistanceKm,
      totalAscent,
      totalDescent,
      coordinateCount: coordinates.length,
      mode: travelMode
    });

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
      logSegmentDebug({ ...debugInfo, result });
      return result.segment;
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
      const direct = buildDirectSegment(startCoord, endCoord);
      if (direct) {
        return returnWithDebug({
          type: 'direct',
          segment: direct,
          reason: 'snap-distance'
        });
      }
      logSegmentDebug({
        ...debugInfo,
        result: {
          type: 'failed',
          segment: null,
          reason: 'snap-distance'
        }
      });
      throw new Error('Selected points are too far from the offline routing network');
    }

    const startPoint = Array.isArray(startSnap.point) ? startSnap.point.slice(0, 3) : null;
    const endPoint = Array.isArray(endSnap.point) ? endSnap.point.slice(0, 3) : null;

    const startConnector = startPoint ? computeSegmentMetrics(startCoord, startPoint) : null;
    const endConnector = endPoint ? computeSegmentMetrics(endPoint, endCoord) : null;

    const startOptions = [];
    if (startPoint) {
      const pushStartOption = (node) => {
        if (!node) {
          return;
        }
        const metrics = computeSegmentMetrics(startPoint, node.coord);
        startOptions.push({
          key: node.key,
          node,
          segment: buildSegmentResult(metrics, startPoint, node.coord)
        });
      };
      if (startSnap.type === 'node' && startSnap.node) {
        pushStartOption(startSnap.node);
      } else if (startSnap.type === 'edge') {
        pushStartOption(startSnap.edgeStart);
        if (startSnap.edgeEnd && (!startSnap.edgeStart || startSnap.edgeEnd.key !== startSnap.edgeStart.key)) {
          pushStartOption(startSnap.edgeEnd);
        }
      }
    }

    debugInfo.startOptionsCount = startOptions.length;

    const endOptions = [];
    if (endPoint) {
      const pushEndOption = (node) => {
        if (!node) {
          return;
        }
        const metrics = computeSegmentMetrics(node.coord, endPoint);
        endOptions.push({
          key: node.key,
          node,
          segment: buildSegmentResult(metrics, node.coord, endPoint)
        });
      };
      if (endSnap.type === 'node' && endSnap.node) {
        pushEndOption(endSnap.node);
      } else if (endSnap.type === 'edge') {
        pushEndOption(endSnap.edgeStart);
        if (endSnap.edgeEnd && (!endSnap.edgeStart || endSnap.edgeEnd.key !== endSnap.edgeStart.key)) {
          pushEndOption(endSnap.edgeEnd);
        }
      }
    }

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
      const direct = buildDirectSegment(startCoord, endCoord);
      if (direct) {
        return returnWithDebug({
          type: 'direct',
          segment: direct,
          reason: 'no-path'
        });
      }
      return returnWithDebug({
        type: 'failed',
        segment: null,
        reason: 'no-path'
      });
    }

    const coordinates = [];

    debugInfo.plan = {
      startNodeKey: bestPlan.startOption?.key,
      endNodeKey: bestPlan.endOption?.key,
      baseDistanceKm: bestPlan.baseDistanceKm,
      startConnector: bestPlan.startConnector,
      endConnector: bestPlan.endConnector,
      startApproach: bestPlan.startApproach,
      endApproach: bestPlan.endApproach
    };

    if (startConnector) {
      appendCoordinateSequence(coordinates, [startConnector.start, startConnector.end]);
    } else if (Array.isArray(startCoord) && startCoord.length >= 2) {
      const fallbackStart = startPoint || endPoint || startCoord;
      appendCoordinateSequence(coordinates, [mergeCoordinates(startCoord, fallbackStart)]);
    }

    appendCoordinateSequence(coordinates, bestPlan.startOption.segment.coordinates);

    const pathCoordinates = bestPlan.path.coordinates
      .map((coord) => (Array.isArray(coord) ? coord.slice(0, 3) : null))
      .filter((coord) => Array.isArray(coord) && coord.length >= 2);
    appendCoordinateSequence(coordinates, pathCoordinates);

    appendCoordinateSequence(coordinates, bestPlan.endOption.segment.coordinates);

    if (endConnector) {
      appendCoordinateSequence(coordinates, [endConnector.start, endConnector.end]);
    } else if (Array.isArray(endCoord) && endCoord.length >= 2) {
      const fallbackEnd = endPoint || coordinates[coordinates.length - 1] || endCoord;
      appendCoordinateSequence(coordinates, [mergeCoordinates(endCoord, fallbackEnd)]);
    }

    const uniqueCoordinates = coordinates.filter((coord, index) => {
      if (!Array.isArray(coord) || coord.length < 2) {
        return false;
      }
      if (index === 0) {
        return true;
      }
      return !coordinatesAlmostEqual(
        coord,
        coordinates[index - 1],
        COORDINATE_DUPLICATE_TOLERANCE_METERS
      );
    });

    if (uniqueCoordinates.length < 2) {
      const direct = buildDirectSegment(startCoord, endCoord);
      if (direct) {
        return returnWithDebug({
          type: 'direct',
          segment: direct,
          reason: 'insufficient-coordinates'
        });
      }
      return returnWithDebug({
        type: 'failed',
        segment: null,
        reason: 'insufficient-coordinates'
      });
    }

    const result = {
      coordinates: uniqueCoordinates,
      distanceKm: bestPlan.totalDistanceKm,
      ascent: bestPlan.totalAscent,
      descent: bestPlan.totalDescent
    };

    return returnWithDebug({
      type: 'network',
      segment: result
    });
  }
}
