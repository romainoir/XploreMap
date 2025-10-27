const DEFAULT_SERVICE_URL = 'https://router.project-osrm.org';

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
  return [lng, lat];
};

const sanitizeWaypointSequence = (waypoints) => {
  if (!Array.isArray(waypoints)) {
    return [];
  }
  return waypoints
    .map((coord) => sanitizeCoordinate(coord))
    .filter((coord) => Array.isArray(coord));
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

  async getRoute(waypoints, { mode } = {}) {
    const coords = sanitizeWaypointSequence(waypoints);
    if (coords.length < 2) {
      return null;
    }

    const travelMode = this.supportsMode(mode) ? mode : this.defaultMode;
    const url = this.buildRouteUrl(coords, travelMode);

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
}

export default OsrmRouter;
