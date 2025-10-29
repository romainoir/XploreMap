import { haversineDistanceKm } from './geojson-pathfinder.js';

const DEFAULT_SERVICE_URL = 'https://api.openrouteservice.org';
const COORDINATE_EQUALITY_TOLERANCE_METERS = 1.5;
const COORDINATE_DUPLICATE_TOLERANCE_METERS = 0.05;

const DEFAULT_MODE_SPEEDS_KMH = Object.freeze({
  'foot-hiking': 4.5,
  manual: 4.5
});

const MODE_PROFILES = Object.freeze({
  'foot-hiking': 'foot-hiking',
  manual: 'foot-hiking'
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

const sanitizeSummaryMetrics = (summary) => {
  if (!summary || typeof summary !== 'object') {
    return null;
  }
  const distance = Number(summary.distance);
  const duration = Number(summary.duration);
  const ascent = Number(summary.ascent);
  const descent = Number(summary.descent);
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

const metersFromKm = (distanceKm) => {
  if (!Number.isFinite(distanceKm)) {
    return 0;
  }
  return distanceKm * 1000;
};

export class OrsRouter {
  constructor(options = {}) {
    const {
      serviceUrl = DEFAULT_SERVICE_URL,
      apiKey = null,
      supportedModes = Object.keys(MODE_PROFILES),
      requestParameters = null,
      fetchOptions = null,
      fallbackRouter = null
    } = options || {};

    const normalizedUrl = typeof serviceUrl === 'string' && serviceUrl.length
      ? serviceUrl.trim().replace(/\/?$/, '')
      : DEFAULT_SERVICE_URL;

    this.serviceUrl = normalizedUrl;
    this.apiKey = typeof apiKey === 'string' && apiKey.trim().length ? apiKey.trim() : null;

    const modes = Array.isArray(supportedModes) ? supportedModes : Object.keys(MODE_PROFILES);
    this.supportedModes = new Set(
      modes.filter((mode) => typeof MODE_PROFILES[mode] === 'string')
    );

    const defaultMode = modes.find((mode) => this.supportedModes.has(mode));
    this.defaultMode = defaultMode || 'foot-hiking';

    this.requestParameters = requestParameters && typeof requestParameters === 'object'
      ? { ...requestParameters }
      : {};

    this.fetchOptions = fetchOptions && typeof fetchOptions === 'object'
      ? { ...fetchOptions }
      : {};

    this.fallbackRouter = fallbackRouter && typeof fallbackRouter.getRoute === 'function'
      ? fallbackRouter
      : null;
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

  mergeFetchOptions(baseOptions) {
    if (!this.fetchOptions || typeof this.fetchOptions !== 'object') {
      return baseOptions;
    }
    const merged = { ...this.fetchOptions, ...baseOptions };
    const baseHeaders = (this.fetchOptions && typeof this.fetchOptions.headers === 'object')
      ? this.fetchOptions.headers
      : {};
    const routeHeaders = baseOptions && typeof baseOptions.headers === 'object'
      ? baseOptions.headers
      : {};
    merged.headers = { ...baseHeaders, ...routeHeaders };
    return merged;
  }

  buildRouteRequest(coords, mode) {
    const profile = this.getProfileForMode(mode);
    const coordinatePayload = coords.map((coord) => [coord[0], coord[1]]);
    const url = `${this.serviceUrl}/v2/directions/${profile}/geojson`;
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey && !headers.Authorization) {
      headers.Authorization = this.apiKey;
    }
    const payload = {
      instructions: false,
      elevation: true,
      ...this.requestParameters,
      coordinates: coordinatePayload
    };
    const options = this.mergeFetchOptions({
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    return { url, options };
  }

  extractRouteFeature(payload) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    if (payload.type === 'FeatureCollection' && Array.isArray(payload.features)) {
      return payload.features.find((feature) => feature && feature.geometry && feature.geometry.type === 'LineString')
        || payload.features[0]
        || null;
    }
    if (payload.type === 'Feature' && payload.geometry) {
      return payload;
    }
    if (Array.isArray(payload.routes) && payload.routes.length) {
      const route = payload.routes[0];
      if (route && route.geometry && typeof route.geometry === 'object') {
        return {
          type: 'Feature',
          properties: {
            summary: route.summary,
            segments: route.segments
          },
          geometry: route.geometry
        };
      }
    }
    return null;
  }

  async requestRoute(coords, mode) {
    if (!Array.isArray(coords) || coords.length < 2) {
      return null;
    }

    const { url, options } = this.buildRouteRequest(coords, mode);
    let response;
    try {
      response = await fetch(url, options);
    } catch (networkError) {
      const error = new Error('OpenRouteService request failed due to a network error');
      error.cause = networkError;
      throw error;
    }
    if (!response.ok) {
      throw new Error(`OpenRouteService request failed (${response.status})`);
    }

    const payload = await response.json();
    const feature = this.extractRouteFeature(payload);
    if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) {
      throw new Error('OpenRouteService response did not include a valid route geometry');
    }

    return feature;
  }

  buildSummaryFromGeometry(coords, mode) {
    const metrics = accumulateSequenceMetrics(coords);
    return {
      distance: metersFromKm(metrics.distanceKm),
      duration: this.estimateDurationSeconds(metrics.distanceKm, mode),
      ascent: metrics.ascent,
      descent: metrics.descent
    };
  }

  buildManualRoute(coords) {
    if (!Array.isArray(coords) || coords.length < 2) {
      throw new Error('Manual routing requires at least two valid coordinates');
    }

    const geometryCoords = [];
    const segments = [];
    let totalDistanceKm = 0;
    let totalAscent = 0;
    let totalDescent = 0;

    for (let index = 0; index < coords.length - 1; index += 1) {
      const start = coords[index];
      const end = coords[index + 1];
      const metrics = computeSegmentMetrics(start, end);
      if (!metrics) {
        throw new Error('Manual routing requires valid coordinate pairs');
      }
      appendCoordinateSequence(geometryCoords, [start, end]);
      totalDistanceKm += metrics.distanceKm;
      totalAscent += metrics.ascent;
      totalDescent += metrics.descent;
      segments.push({
        distance: metersFromKm(metrics.distanceKm),
        duration: this.estimateDurationSeconds(metrics.distanceKm, 'manual'),
        ascent: metrics.ascent,
        descent: metrics.descent,
        start_index: index,
        end_index: index + 1
      });
    }

    return {
      type: 'Feature',
      properties: {
        profile: 'manual',
        summary: {
          distance: metersFromKm(totalDistanceKm),
          duration: this.estimateDurationSeconds(totalDistanceKm, 'manual'),
          ascent: totalAscent,
          descent: totalDescent
        },
        segments
      },
      geometry: {
        type: 'LineString',
        coordinates: geometryCoords
      }
    };
  }


  async getRoute(waypoints, { mode, preservedSegments } = {}) {
    const coords = sanitizeWaypointSequence(waypoints);
    if (coords.length < 2) {
      return null;
    }

    const travelMode = this.supportsMode(mode) ? mode : this.defaultMode;

    if (travelMode === 'manual') {
      return this.buildManualRoute(coords);
    }

    const preservedMap = new Map();
    const sanitizedPreserved = [];
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
        const metrics = sanitizeSegmentMetrics(segment);
        preservedMap.set(startIndex, {
          endIndex,
          coordinates: sequence,
          metrics
        });
        sanitizedPreserved.push({
          startIndex,
          endIndex,
          coordinates: sequence.map((coord) => coord.slice()),
          ...(metrics || {})
        });
      });
    }

    try {
      if (!preservedMap.size) {
        const requestCoords = coords.map((coord) => [coord[0], coord[1]]);
        const routeFeature = await this.requestRoute(requestCoords, travelMode);
        const rawCoordinates = Array.isArray(routeFeature.geometry?.coordinates)
          ? routeFeature.geometry.coordinates
          : [];
        const geometryCoordinates = sanitizeCoordinateSequence(rawCoordinates)
          || rawCoordinates.map((coord) => sanitizeCoordinate(coord)).filter(Boolean);

        const summaryMetrics = sanitizeSummaryMetrics(routeFeature.properties?.summary);
        const geometrySummary = this.buildSummaryFromGeometry(geometryCoordinates, travelMode);

        const totalDistance = Number.isFinite(summaryMetrics?.distance)
          ? summaryMetrics.distance
          : geometrySummary.distance;
        const totalDuration = Number.isFinite(summaryMetrics?.duration)
          ? summaryMetrics.duration
          : geometrySummary.duration;
        const totalAscent = Number.isFinite(summaryMetrics?.ascent)
          ? summaryMetrics.ascent
          : geometrySummary.ascent;
        const totalDescent = Number.isFinite(summaryMetrics?.descent)
          ? summaryMetrics.descent
          : geometrySummary.descent;

        const segmentData = Array.isArray(routeFeature.properties?.segments)
          ? routeFeature.properties.segments
          : [];

        const segments = segmentData.map((segment, index) => {
          const metrics = sanitizeSegmentMetrics(segment);
          const distance = Number.isFinite(metrics?.distance)
            ? metrics.distance
            : segmentData.length ? totalDistance / segmentData.length : totalDistance;
          const duration = Number.isFinite(metrics?.duration)
            ? metrics.duration
            : this.estimateDurationSeconds(distance / 1000, travelMode);
          const ascent = Number.isFinite(metrics?.ascent) ? metrics.ascent : 0;
          const descent = Number.isFinite(metrics?.descent) ? metrics.descent : 0;
          return {
            distance,
            duration,
            ascent,
            descent,
            start_index: index,
            end_index: index + 1
          };
        });

        return {
          type: 'Feature',
          properties: {
            profile: travelMode,
            summary: {
              distance: totalDistance,
              duration: totalDuration,
              ascent: totalAscent,
              descent: totalDescent
            },
            segments
          },
          geometry: {
            type: 'LineString',
            coordinates: geometryCoordinates
          }
        };
      }

      const geometryCoords = [];
      const segments = [];
      let totalDistance = 0;
      let totalDuration = 0;
      let totalAscent = 0;
      let totalDescent = 0;

      const appendMetrics = (distance, duration, ascent, descent, startIndex) => {
        const segmentDistance = Number.isFinite(distance) ? distance : 0;
        const segmentDuration = Number.isFinite(duration) ? duration : 0;
        const segmentAscent = Number.isFinite(ascent) ? ascent : 0;
        const segmentDescent = Number.isFinite(descent) ? descent : 0;
        totalDistance += segmentDistance;
        totalDuration += segmentDuration;
        totalAscent += segmentAscent;
        totalDescent += segmentDescent;
        segments.push({
          distance: segmentDistance,
          duration: Number.isFinite(duration) ? duration : null,
          ascent: Number.isFinite(ascent) ? ascent : null,
          descent: Number.isFinite(descent) ? descent : null,
          start_index: startIndex,
          end_index: startIndex + 1
        });
      };

      for (let index = 0; index < coords.length - 1; index += 1) {
        const startWaypoint = coords[index];
        const endWaypoint = coords[index + 1];
        const preserved = preservedMap.get(index);
        if (preserved && preserved.endIndex === index + 1) {
          const sequence = preserved.coordinates.map((coord) => coord.slice(0, 3));
          if (sequence.length < 2) {
            continue;
          }
          const first = sequence[0];
          const last = sequence[sequence.length - 1];
          if (!coordinatesAlmostEqual(first, startWaypoint)) {
            sequence[0] = mergeCoordinates(startWaypoint, first);
          }
          if (!coordinatesAlmostEqual(last, endWaypoint)) {
            sequence[sequence.length - 1] = mergeCoordinates(endWaypoint, last);
          }
          appendCoordinateSequence(geometryCoords, sequence);
          const metrics = preserved.metrics || {};
          const accumulated = accumulateSequenceMetrics(sequence);
          const distance = Number.isFinite(metrics.distance)
            ? metrics.distance
            : metersFromKm(accumulated.distanceKm);
          const duration = Number.isFinite(metrics.duration)
            ? metrics.duration
            : this.estimateDurationSeconds(accumulated.distanceKm, travelMode);
          const ascent = Number.isFinite(metrics.ascent) ? metrics.ascent : accumulated.ascent;
          const descent = Number.isFinite(metrics.descent) ? metrics.descent : accumulated.descent;
          appendMetrics(distance, duration, ascent, descent, index);
          continue;
        }

        const segmentFeature = await this.requestRoute([startWaypoint, endWaypoint], travelMode);
        const rawSegmentCoords = Array.isArray(segmentFeature.geometry?.coordinates)
          ? segmentFeature.geometry.coordinates
          : [];
        const segmentCoords = sanitizeCoordinateSequence(rawSegmentCoords)
          || [sanitizeCoordinate(startWaypoint), sanitizeCoordinate(endWaypoint)].filter(Boolean);
        appendCoordinateSequence(geometryCoords, segmentCoords);
        const summary = sanitizeSummaryMetrics(segmentFeature.properties?.summary);
        const geometrySummary = this.buildSummaryFromGeometry(segmentCoords, travelMode);
        const distance = Number.isFinite(summary?.distance) ? summary.distance : geometrySummary.distance;
        const duration = Number.isFinite(summary?.duration) ? summary.duration : geometrySummary.duration;
        const ascent = Number.isFinite(summary?.ascent) ? summary.ascent : geometrySummary.ascent;
        const descent = Number.isFinite(summary?.descent) ? summary.descent : geometrySummary.descent;
        appendMetrics(distance, duration, ascent, descent, index);
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
    } catch (error) {
      const supportsFallback = this.fallbackRouter
        && typeof this.fallbackRouter.getRoute === 'function'
        && (!this.fallbackRouter.supportsMode
          || this.fallbackRouter.supportsMode(travelMode));

      if (!supportsFallback) {
        throw error;
      }

      console.warn('OpenRouteService routing failed. Falling back to the offline router.', error);
      try {
        const fallbackRoute = await this.fallbackRouter.getRoute(coords, {
          mode: travelMode,
          preservedSegments: sanitizedPreserved
        });
        if (fallbackRoute && typeof fallbackRoute === 'object') {
          const properties = fallbackRoute.properties && typeof fallbackRoute.properties === 'object'
            ? { ...fallbackRoute.properties }
            : {};
          const warnings = Array.isArray(properties.warnings) ? [...properties.warnings] : [];
          warnings.push('OpenRouteService request failed; offline routing was used instead.');
          fallbackRoute.properties = {
            ...properties,
            warnings,
            fallbackSource: 'openrouteservice'
          };
        }
        return fallbackRoute;
      } catch (fallbackError) {
        const combined = new Error('OpenRouteService routing failed and offline fallback was unsuccessful');
        combined.cause = fallbackError;
        combined.originalError = error;
        throw combined;
      }
    }
  }

}

export default OrsRouter;
