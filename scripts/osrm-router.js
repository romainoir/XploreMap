import { haversineDistanceKm } from './geojson-pathfinder.js';

const DEFAULT_SERVICE_URL = 'https://router.project-osrm.org';
const COORDINATE_EQUALITY_TOLERANCE_METERS = 1.5;
const COORDINATE_DUPLICATE_TOLERANCE_METERS = 0.05;

const DEFAULT_MODE_SPEEDS_KMH = Object.freeze({
  'foot-hiking': 4.5,
  'cycling-regular': 18,
  'driving-car': 65
});

const MODE_PROFILES = Object.freeze({
  'foot-hiking': 'foot',
  'cycling-regular': 'cycling',
  'driving-car': 'driving'
});

const sanitizeCoordinate = (coord) => {
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
};

const sanitizeWaypointSequence = (waypoints) => {
  if (!Array.isArray(waypoints)) {
    return [];
  }
  return waypoints
    .map((coord) => sanitizeCoordinate(coord))
    .filter((coord) => Array.isArray(coord));
};

const coordinatesAlmostEqual = (a, b, toleranceMeters = COORDINATE_EQUALITY_TOLERANCE_METERS) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) {
    return false;
  }
  return haversineDistanceKm(a, b) * 1000 <= toleranceMeters;
};

const mergeCoordinates = (preferred, fallback) => {
  const target = Array.isArray(preferred) ? preferred.slice(0, 3) : [];
  if (target.length < 2 && Array.isArray(fallback)) {
    return fallback.slice(0, 3);
  }
  if (target.length < 2) {
    return [];
  }
  if (target.length === 2) {
    const elevation = Array.isArray(fallback) && Number.isFinite(fallback[2]) ? Number(fallback[2]) : 0;
    target.push(elevation);
  } else if (!Number.isFinite(target[2])) {
    target[2] = Array.isArray(fallback) && Number.isFinite(fallback[2]) ? Number(fallback[2]) : 0;
  }
  return target;
};

const sanitizeCoordinateSequence = (coords) => {
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
};

const computeSegmentMetrics = (start, end) => {
  if (!Array.isArray(start) || start.length < 2 || !Array.isArray(end) || end.length < 2) {
    return null;
  }
  const normalizedStart = mergeCoordinates(start, end);
  const normalizedEnd = mergeCoordinates(end, start);
  if (normalizedStart.length < 2 || normalizedEnd.length < 2) {
    return null;
  }
  const distanceKm = haversineDistanceKm(normalizedStart, normalizedEnd);
  const elevationDelta = (normalizedEnd[2] ?? 0) - (normalizedStart[2] ?? 0);
  return {
    distanceKm,
    ascent: elevationDelta > 0 ? elevationDelta : 0,
    descent: elevationDelta < 0 ? Math.abs(elevationDelta) : 0
  };
};

const accumulateSequenceMetrics = (coords) => {
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
};

const appendCoordinateSequence = (target, sequence) => {
  if (!Array.isArray(target) || !Array.isArray(sequence)) {
    return;
  }
  sequence.forEach((coord, index) => {
    const normalized = sanitizeCoordinate(coord);
    if (!normalized) {
      return;
    }
    if (!target.length) {
      target.push(normalized);
      return;
    }
    const last = target[target.length - 1];
    if (coordinatesAlmostEqual(last, normalized)) {
      target[target.length - 1] = mergeCoordinates(normalized, last);
      return;
    }
    if (index > 0 || !coordinatesAlmostEqual(target[target.length - 1], normalized)) {
      target.push(normalized);
    }
  });
};

const sanitizeSegmentMetrics = (segment) => {
  if (!segment || typeof segment !== 'object') {
    return null;
  }
  const distance = Number(segment.distance);
  const duration = Number(segment.duration);
  const ascent = Number(segment.ascent);
  const descent = Number(segment.descent);
  const hasDistance = Number.isFinite(distance) && distance >= 0;
  const hasDuration = Number.isFinite(duration) && duration >= 0;
  const hasAscent = Number.isFinite(ascent);
  const hasDescent = Number.isFinite(descent);
  if (!hasDistance && !hasDuration && !hasAscent && !hasDescent) {
    return null;
  }
  return {
    distance: hasDistance ? distance : null,
    duration: hasDuration ? duration : null,
    ascent: hasAscent ? ascent : null,
    descent: hasDescent ? descent : null
  };
};

export class OsrmRouter {
  constructor(options = {}) {
    const {
      serviceUrl = DEFAULT_SERVICE_URL,
      supportedModes = Object.keys(MODE_PROFILES)
    } = options || {};

    const normalizedUrl = typeof serviceUrl === 'string' && serviceUrl.length
      ? serviceUrl.trim().replace(/\/?$/, '')
      : DEFAULT_SERVICE_URL;

    this.serviceUrl = normalizedUrl;

    const modes = Array.isArray(supportedModes) ? supportedModes : Object.keys(MODE_PROFILES);
    this.supportedModes = new Set(
      modes.filter((mode) => typeof MODE_PROFILES[mode] === 'string')
    );

    const defaultMode = modes.find((mode) => this.supportedModes.has(mode));
    this.defaultMode = defaultMode || 'foot-hiking';
  }

  ensureReady() {
    return Promise.resolve();
  }

  getProfileForMode(mode) {
    if (typeof MODE_PROFILES[mode] === 'string') {
      return MODE_PROFILES[mode];
    }
    return MODE_PROFILES[this.defaultMode] || MODE_PROFILES['foot-hiking'];
  }

  supportsMode(mode) {
    return this.supportedModes.has(mode);
  }

  getAverageSpeedKmh(mode) {
    if (this.supportedModes.has(mode) && Number.isFinite(DEFAULT_MODE_SPEEDS_KMH[mode])) {
      return DEFAULT_MODE_SPEEDS_KMH[mode];
    }
    const fallback = DEFAULT_MODE_SPEEDS_KMH[this.defaultMode];
    return Number.isFinite(fallback) ? fallback : 5;
  }

  estimateDurationSeconds(distanceKm, mode) {
    const speed = this.getAverageSpeedKmh(mode);
    if (!Number.isFinite(speed) || speed <= 0) {
      return 0;
    }
    return (distanceKm / speed) * 3600;
  }

  buildRouteUrl(coords, mode) {
    const profile = this.getProfileForMode(mode);
    const coordinateString = coords.map((coord) => `${coord[0]},${coord[1]}`).join(';');
    const params = new URLSearchParams({
      overview: 'full',
      geometries: 'geojson',
      steps: 'false',
      annotations: 'false'
    });
    return `${this.serviceUrl}/route/v1/${profile}/${coordinateString}?${params.toString()}`;
  }

  async requestRoute(coords, mode) {
    if (!Array.isArray(coords) || coords.length < 2) {
      return null;
    }

    const url = this.buildRouteUrl(coords, mode);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OSRM request failed (${response.status})`);
    }

    const payload = await response.json();
    if (!payload || payload.code !== 'Ok') {
      const message = payload?.message || 'Unknown OSRM error';
      throw new Error(`OSRM response error: ${message}`);
    }

    const route = Array.isArray(payload.routes) ? payload.routes[0] : null;
    if (!route || !route.geometry || !route.geometry.coordinates) {
      throw new Error('OSRM response did not include a valid route geometry');
    }

    return route;
  }

  async getRoute(waypoints, { mode, preservedSegments } = {}) {
    const coords = sanitizeWaypointSequence(waypoints);
    if (coords.length < 2) {
      return null;
    }

    const travelMode = this.supportsMode(mode) ? mode : this.defaultMode;

    const preservedMap = new Map();
    if (Array.isArray(preservedSegments)) {
      preservedSegments.forEach((segment) => {
        if (!segment) {
          return;
        }
        const startIndex = Number(segment.startIndex);
        const endIndex = Number(segment.endIndex);
        if (!Number.isInteger(startIndex) || endIndex !== startIndex + 1) {
          return;
        }
        const sequence = sanitizeCoordinateSequence(segment.coordinates);
        if (!sequence) {
          return;
        }
        preservedMap.set(startIndex, {
          endIndex,
          coordinates: sequence,
          metrics: sanitizeSegmentMetrics(segment)
        });
      });
    }

    if (!preservedMap.size) {
      const requestCoords = coords.map((coord) => [coord[0], coord[1]]);
      const route = await this.requestRoute(requestCoords, travelMode);
      const legs = Array.isArray(route.legs) ? route.legs : [];
      const segments = legs.map((leg, index) => ({
        distance: Number(leg?.distance) || 0,
        duration: Number(leg?.duration) || 0,
        ascent: 0,
        descent: 0,
        start_index: index,
        end_index: index + 1
      }));

      const summary = {
        distance: Number(route.distance) || 0,
        duration: Number(route.duration) || 0,
        ascent: 0,
        descent: 0
      };

      return {
        type: 'Feature',
        properties: {
          profile: travelMode,
          summary,
          segments
        },
        geometry: route.geometry
      };
    }

    const tasks = [];
    let index = 0;
    const lastWaypointIndex = coords.length - 1;
    while (index < lastWaypointIndex) {
      const preserved = preservedMap.get(index);
      if (preserved && preserved.endIndex === index + 1 && Array.isArray(preserved.coordinates) && preserved.coordinates.length >= 2) {
        tasks.push({
          type: 'preserved',
          startIndex: index,
          endIndex: index + 1,
          data: preserved
        });
        index += 1;
        continue;
      }

      let endIndex = index + 1;
      while (endIndex < lastWaypointIndex && !preservedMap.has(endIndex)) {
        endIndex += 1;
      }
      tasks.push({
        type: 'osrm',
        startIndex: index,
        endIndex
      });
      index = endIndex;
    }

    const geometryCoords = [];
    const segments = [];
    let totalDistance = 0;
    let totalDuration = 0;
    let totalAscent = 0;
    let totalDescent = 0;

    const appendMetrics = ({ distance, duration, ascent, descent, startIndex }) => {
      totalDistance += distance;
      totalDuration += duration;
      totalAscent += ascent;
      totalDescent += descent;
      segments.push({
        distance,
        duration,
        ascent,
        descent,
        start_index: startIndex,
        end_index: startIndex + 1
      });
    };

    for (const task of tasks) {
      if (task.type === 'preserved') {
        const preserved = task.data;
        const sequence = preserved.coordinates.map((coord) => coord.slice(0, 3));
        const startWaypoint = coords[task.startIndex];
        const endWaypoint = coords[task.endIndex];
        if (!sequence.length || !startWaypoint || !endWaypoint) {
          continue;
        }
        const first = sequence[0];
        const last = sequence[sequence.length - 1];
        if (!coordinatesAlmostEqual(first, startWaypoint) || !coordinatesAlmostEqual(last, endWaypoint)) {
          sequence[0] = mergeCoordinates(startWaypoint, first);
          sequence[sequence.length - 1] = mergeCoordinates(endWaypoint, last);
        } else {
          sequence[0] = mergeCoordinates(sequence[0], startWaypoint);
          sequence[sequence.length - 1] = mergeCoordinates(sequence[sequence.length - 1], endWaypoint);
        }

        appendCoordinateSequence(geometryCoords, sequence);

        const metrics = accumulateSequenceMetrics(sequence);
        const stored = preserved.metrics || {};
        const distanceMeters = Number.isFinite(stored.distance) && stored.distance > 0
          ? stored.distance
          : metrics.distanceKm * 1000;
        const durationSeconds = Number.isFinite(stored.duration) && stored.duration >= 0
          ? stored.duration
          : this.estimateDurationSeconds(metrics.distanceKm, travelMode);
        const ascent = Number.isFinite(stored.ascent) ? stored.ascent : metrics.ascent;
        const descent = Number.isFinite(stored.descent) ? stored.descent : metrics.descent;

        appendMetrics({
          distance: distanceMeters,
          duration: durationSeconds,
          ascent,
          descent,
          startIndex: task.startIndex
        });
        continue;
      }

      const sliceEnd = Math.min(task.endIndex + 1, coords.length);
      const blockWaypoints = coords.slice(task.startIndex, sliceEnd).map((coord) => [coord[0], coord[1]]);
      if (blockWaypoints.length < 2) {
        continue;
      }

      const route = await this.requestRoute(blockWaypoints, travelMode);
      const blockCoordinates = Array.isArray(route.geometry?.coordinates)
        ? route.geometry.coordinates.map((coord) => sanitizeCoordinate(coord))
        : [];
      if (blockCoordinates.length) {
        const startWaypoint = coords[task.startIndex];
        const endWaypoint = coords[Math.min(task.endIndex, coords.length - 1)];
        if (startWaypoint) {
          const firstCoord = blockCoordinates[0];
          blockCoordinates[0] = coordinatesAlmostEqual(firstCoord, startWaypoint)
            ? mergeCoordinates(firstCoord, startWaypoint)
            : mergeCoordinates(startWaypoint, firstCoord);
        }
        if (endWaypoint) {
          const lastIndex = blockCoordinates.length - 1;
          const lastCoord = blockCoordinates[lastIndex];
          blockCoordinates[lastIndex] = coordinatesAlmostEqual(lastCoord, endWaypoint)
            ? mergeCoordinates(lastCoord, endWaypoint)
            : mergeCoordinates(endWaypoint, lastCoord);
        }
        appendCoordinateSequence(geometryCoords, blockCoordinates);
      }

      const legs = Array.isArray(route.legs) ? route.legs : [];
      legs.forEach((leg, legOffset) => {
        const startIndex = task.startIndex + legOffset;
        const distance = Number(leg?.distance) || 0;
        const duration = Number(leg?.duration) || 0;
        appendMetrics({
          distance,
          duration,
          ascent: 0,
          descent: 0,
          startIndex
        });
      });
    }

    if (geometryCoords.length < 2) {
      const requestCoords = coords.map((coord) => [coord[0], coord[1]]);
      const fallbackRoute = await this.requestRoute(requestCoords, travelMode);
      return {
        type: 'Feature',
        properties: {
          profile: travelMode,
          summary: {
            distance: Number(fallbackRoute.distance) || 0,
            duration: Number(fallbackRoute.duration) || 0,
            ascent: 0,
            descent: 0
          },
          segments: (Array.isArray(fallbackRoute.legs) ? fallbackRoute.legs : []).map((leg, index) => ({
            distance: Number(leg?.distance) || 0,
            duration: Number(leg?.duration) || 0,
            ascent: 0,
            descent: 0,
            start_index: index,
            end_index: index + 1
          }))
        },
        geometry: fallbackRoute.geometry
      };
    }

    const summary = {
      distance: totalDistance,
      duration: totalDuration,
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
        coordinates: geometryCoords
      }
    };
  }
}

export default OsrmRouter;
