const EMPTY_LINE_STRING = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'LineString',
    coordinates: []
  }
};

const EMPTY_COLLECTION = {
  type: 'FeatureCollection',
  features: []
};

const MODE_COLORS = {
  'foot-hiking': '#f8b40b',
  'cycling-regular': '#1bbd14',
  'driving-car': '#193ae1'
};

const HOVER_PIXEL_TOLERANCE = 12;
const COORD_EPSILON = 1e-6;
const WAYPOINT_MATCH_TOLERANCE_METERS = 30;
const MAX_ELEVATION_POINTS = 180;
const MAX_DISTANCE_MARKERS = 60;
const ELEVATION_TICK_TARGET = 5;
const DISTANCE_TICK_TARGET = 6;
const turfApi = typeof turf !== 'undefined' ? turf : null;

const SUMMARY_ICONS = {
  ascent: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4 17.5 9.5l-1.4 1.4L13 7.8V20h-2V7.8l-3.1 3.1-1.4-1.4Z"/></svg>',
  descent: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20 6.5 14.5l1.4-1.4L11 16.2V4h2v12.2l3.1-3.1 1.4 1.4Z"/></svg>',
  distance: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.4 6.4 2.8 11l4.6 4.6 1.4-1.4-2.2-2.2h10.8l-2.2 2.2 1.4 1.4 4.6-4.6-4.6-4.6-1.4 1.4 2.2 2.2H6.6l2.2-2.2Z"/></svg>'
};

const createWaypointFeature = (coords, index, total) => ({
  type: 'Feature',
  properties: {
    index,
    title: index === 0 ? 'A' : index === total - 1 ? 'B' : `Via ${index}`
  },
  geometry: {
    type: 'Point',
    coordinates: coords
  }
});

const toLngLat = (coord) => new maplibregl.LngLat(coord[0], coord[1]);

export class DirectionsManager {
  constructor(map, uiElements = []) {
    if (!map || typeof map.addSource !== 'function') {
      throw new Error('A valid MapLibre GL JS map instance is required');
    }

    const [
      directionsToggle,
      directionsDock,
      directionsControl,
      transportModes,
      swapButton,
      clearButton,
      routeStats,
      elevationChart,
      directionsInfoButton,
      directionsHint
    ] = uiElements;

    this.map = map;
    this.directionsToggle = directionsToggle ?? null;
    this.directionsDock = directionsDock ?? null;
    this.directionsControl = directionsControl ?? null;
    this.transportModes = transportModes ? Array.from(transportModes) : [];
    this.swapButton = swapButton ?? null;
    this.clearButton = clearButton ?? null;
    this.routeStats = routeStats ?? null;
    this.elevationChart = elevationChart ?? null;
    this.infoButton = directionsInfoButton ?? null;
    this.directionsHint = directionsHint ?? null;

    if (this.routeStats) {
      this.routeStats.classList.add('sr-only');
    }

    this.waypoints = [];
    this.currentMode = 'foot-hiking';
    this.modeColors = { ...MODE_COLORS };

    this.latestMetrics = null;

    this.isDragging = false;
    this.draggedWaypointIndex = null;
    this.hoveredWaypointIndex = null;
    this.hoveredSegmentIndex = null;
    this.hoveredLegIndex = null;

    this.routeGeojson = null;
    this.routeSegments = [];
    this.segmentLegLookup = [];

    this.setHintVisible(false);

    this.handleWaypointMouseDown = (event) => this.onWaypointMouseDown(event);
    this.handleMapMouseMove = (event) => this.onMapMouseMove(event);
    this.handleMapMouseUp = () => this.onMapMouseUp();
    this.handleMapMouseLeave = () => {
      this.resetSegmentHover();
      this.setHoveredWaypointIndex(null);
    };
    this.handleMapClick = (event) => this.onMapClick(event);
    this.handleWaypointDoubleClick = (event) => this.onWaypointDoubleClick(event);

    this.setupRouteLayers();
    this.setupUIHandlers();
    this.setupMapHandlers();
    this.updatePanelVisibilityState();
  }

  setupRouteLayers() {
    const removeLayer = (id) => {
      if (this.map.getLayer(id)) {
        this.map.removeLayer(id);
      }
    };
    const removeSource = (id) => {
      if (this.map.getSource(id)) {
        this.map.removeSource(id);
      }
    };

    removeLayer('route-line');
    removeLayer('route-segment-hover');
    removeLayer('distance-markers');
    removeLayer('waypoint-hover-drag');
    removeLayer('waypoints');
    removeLayer('waypoints-hit-area');
    removeLayer('route-markers');

    removeSource('route-line-source');
    removeSource('route-segments-source');
    removeSource('distance-markers-source');
    removeSource('waypoints');

    this.map.addSource('route-line-source', {
      type: 'geojson',
      data: EMPTY_LINE_STRING
    });

    this.map.addSource('route-segments-source', {
      type: 'geojson',
      data: EMPTY_COLLECTION
    });

    this.map.addSource('distance-markers-source', {
      type: 'geojson',
      data: EMPTY_COLLECTION
    });

    this.map.addSource('waypoints', {
      type: 'geojson',
      data: EMPTY_COLLECTION
    });

    this.map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-line-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': this.modeColors[this.currentMode],
        'line-width': 4
      }
    });

    this.map.addLayer({
      id: 'route-segment-hover',
      type: 'line',
      source: 'route-segments-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': 'yellow',
        'line-width': 6,
        'line-opacity': 0.8
      },
      filter: ['==', 'segmentIndex', -1]
    });

    this.map.addLayer({
      id: 'distance-markers',
      type: 'symbol',
      source: 'distance-markers-source',
      layout: {
        'symbol-placement': 'line',
        'text-field': '{distance}',
        'text-size': 12,
        'text-offset': [0, 1.5],
        'symbol-spacing': 100,
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: {
        'text-color': this.modeColors[this.currentMode]
      }
    });

    this.map.addLayer({
      id: 'waypoints-hit-area',
      type: 'circle',
      source: 'waypoints',
      paint: {
        'circle-radius': 12,
        'circle-color': 'transparent'
      },
      filter: ['==', '$type', 'Point']
    });

    this.map.addLayer({
      id: 'waypoints',
      type: 'circle',
      source: 'waypoints',
      paint: {
        'circle-radius': 8,
        'circle-color': '#fff',
        'circle-stroke-width': 3,
        'circle-stroke-color': '#000'
      },
      filter: ['==', '$type', 'Point']
    });

    this.map.addLayer({
      id: 'route-markers',
      type: 'symbol',
      source: 'waypoints',
      layout: {
        'symbol-placement': 'point',
        'text-field': ['get', 'title'],
        'text-size': 14,
        'text-offset': [0, 1.5]
      },
      paint: {
        'text-color': '#fff'
      }
    });

    this.map.addLayer({
      id: 'waypoint-hover-drag',
      type: 'circle',
      source: 'waypoints',
      paint: {
        'circle-radius': 16,
        'circle-color': 'rgba(255, 255, 0, 0.5)',
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(0, 0, 0, 0.7)'
      },
      filter: ['==', 'index', -1]
    });
  }

  setupUIHandlers() {
    this.directionsToggle?.addEventListener('click', () => {
      this.directionsToggle.classList.toggle('active');
      this.directionsControl?.classList.toggle('visible');
      this.updatePanelVisibilityState();
    });

    this.transportModes.forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.mode;
        if (!mode || mode === this.currentMode) return;
        this.setTransportMode(mode);
      });
    });

    this.infoButton?.addEventListener('click', () => {
      const isExpanded = this.infoButton.getAttribute('aria-expanded') === 'true';
      this.setHintVisible(!isExpanded);
    });

    this.swapButton?.addEventListener('click', () => {
      if (this.waypoints.length < 2) return;
      this.waypoints.reverse();
      this.updateWaypoints();
      this.getRoute();
    });

    this.clearButton?.addEventListener('click', () => {
      this.clearDirections();
    });
  }

  setupMapHandlers() {
    this.map.on('mousedown', 'waypoints-hit-area', this.handleWaypointMouseDown);
    this.map.on('mousemove', this.handleMapMouseMove);
    this.map.on('mouseup', this.handleMapMouseUp);
    this.map.on('mouseleave', this.handleMapMouseLeave);
    this.map.on('click', this.handleMapClick);
    this.map.on('dblclick', 'waypoints-hit-area', this.handleWaypointDoubleClick);
  }

  setHintVisible(isVisible) {
    const visible = Boolean(isVisible);
    if (this.directionsHint) {
      this.directionsHint.classList.toggle('visible', visible);
      this.directionsHint.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    if (this.infoButton) {
      this.infoButton.setAttribute('aria-expanded', visible ? 'true' : 'false');
    }
  }

  isPanelVisible() {
    return Boolean(this.directionsControl?.classList.contains('visible'));
  }

  updatePanelVisibilityState() {
    const isVisible = this.isPanelVisible();
    if (this.directionsToggle) {
      this.directionsToggle.setAttribute('aria-expanded', isVisible ? 'true' : 'false');
    }
    if (this.directionsControl) {
      this.directionsControl.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    }
    if (this.directionsDock) {
      this.directionsDock.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    }
    if (this.routeStats) {
      this.routeStats.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    }
    if (this.elevationChart) {
      this.elevationChart.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    }
    if (!isVisible) {
      this.setHintVisible(false);
    }
  }

  onWaypointMouseDown(event) {
    if (!this.isPanelVisible()) return;
    const feature = event.features?.[0];
    if (!feature) return;
    this.isDragging = true;
    this.draggedWaypointIndex = Number(feature.properties.index);
    this.setHoveredWaypointIndex(this.draggedWaypointIndex);
    this.map.dragPan?.disable();
  }

  onMapMouseMove(event) {
    if (!this.isPanelVisible()) return;

    if (this.isDragging && this.draggedWaypointIndex !== null) {
      this.waypoints[this.draggedWaypointIndex] = [event.lngLat.lng, event.lngLat.lat];
      this.updateWaypoints();
    }

    const features = this.map.queryRenderedFeatures(event.point, { layers: ['waypoints-hit-area'] });
    if (features.length > 0) {
      const index = Number(features[0].properties.index);
      this.setHoveredWaypointIndex(index);
    } else if (!this.isDragging) {
      this.setHoveredWaypointIndex(null);
    }

    this.handleRouteSegmentHover(event);
  }

  onMapMouseUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.draggedWaypointIndex = null;
    this.map.dragPan?.enable();
    this.setHoveredWaypointIndex(null);
    if (this.waypoints.length >= 2) {
      this.getRoute();
    }
  }

  onMapClick(event) {
    if (!this.isPanelVisible() || this.isDragging) return;

    const hitWaypoints = this.map.queryRenderedFeatures(event.point, { layers: ['waypoints-hit-area'] });
    if (hitWaypoints.length) return;

    if (this.hoveredSegmentIndex !== null) {
      this.addViaWaypoint(event.lngLat);
      return;
    }

    this.waypoints.push([event.lngLat.lng, event.lngLat.lat]);
    this.updateWaypoints();
    if (this.waypoints.length >= 2) {
      this.getRoute();
    }
  }

  onWaypointDoubleClick(event) {
    if (!this.isPanelVisible()) return;
    const index = Number(event.features?.[0]?.properties.index);
    if (!Number.isFinite(index) || index <= 0 || index >= this.waypoints.length - 1) return;
    this.waypoints.splice(index, 1);
    this.updateWaypoints();
    if (this.waypoints.length >= 2) {
      this.getRoute();
    } else {
      this.clearRoute();
      this.updateStats(null);
      this.updateElevationProfile([]);
    }
  }

  setHoveredWaypointIndex(index) {
    this.hoveredWaypointIndex = index;
    const target = Number.isInteger(index) ? index : -1;
    if (this.map.getLayer('waypoint-hover-drag')) {
      this.map.setFilter('waypoint-hover-drag', ['==', 'index', target]);
    }
  }

  handleRouteSegmentHover(event) {
    if (!this.routeSegments.length) {
      this.resetSegmentHover();
      return;
    }

    const mousePixel = this.map.project(event.lngLat);
    let closestIndex = -1;
    let minDistance = Infinity;

    this.routeSegments.forEach((segment, index) => {
      const startPixel = this.map.project(toLngLat(segment.start));
      const endPixel = this.map.project(toLngLat(segment.end));
      const distance = this.pointToSegmentDistance(mousePixel, startPixel, endPixel);
      if (distance < minDistance && distance <= HOVER_PIXEL_TOLERANCE) {
        minDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex === -1) {
      this.resetSegmentHover();
    } else {
      this.setHoveredSegment(closestIndex);
    }
  }

  setHoveredSegment(index) {
    this.hoveredSegmentIndex = Number.isInteger(index) ? index : null;
    this.hoveredLegIndex = this.hoveredSegmentIndex !== null
      ? this.segmentLegLookup[this.hoveredSegmentIndex] ?? null
      : null;

    if (this.map.getLayer('route-segment-hover')) {
      const target = this.hoveredSegmentIndex ?? -1;
      this.map.setFilter('route-segment-hover', ['==', 'segmentIndex', target]);
    }
  }

  resetSegmentHover() {
    this.setHoveredSegment(null);
  }

  addViaWaypoint(lngLat) {
    if (this.hoveredSegmentIndex === null) return;
    const segment = this.routeSegments[this.hoveredSegmentIndex];
    if (!segment) return;

    const snapped = this.projectPointOnSegment(lngLat, segment.start, segment.end);
    const insertIndex = this.hoveredLegIndex !== null
      ? Math.min(this.hoveredLegIndex + 1, this.waypoints.length - 1)
      : this.waypoints.length - 1;

    this.waypoints.splice(insertIndex, 0, snapped);
    this.updateWaypoints();
    this.resetSegmentHover();
    this.getRoute();
  }

  updateWaypoints() {
    const source = this.map.getSource('waypoints');
    if (!source) return;
    const total = this.waypoints.length;
    const features = this.waypoints.map((coords, index) => createWaypointFeature(coords, index, total));
    source.setData({
      type: 'FeatureCollection',
      features
    });
  }

  projectPointOnSegment(lngLat, startCoord, endCoord) {
    const startPixel = this.map.project(toLngLat(startCoord));
    const endPixel = this.map.project(toLngLat(endCoord));
    const clickPixel = this.map.project(lngLat);
    const dx = endPixel.x - startPixel.x;
    const dy = endPixel.y - startPixel.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      return [...startCoord];
    }
    let t = ((clickPixel.x - startPixel.x) * dx + (clickPixel.y - startPixel.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    const projected = {
      x: startPixel.x + t * dx,
      y: startPixel.y + t * dy
    };
    const result = this.map.unproject(projected);
    return [result.lng, result.lat];
  }

  pointToSegmentDistance(point, startPixel, endPixel) {
    const dx = endPixel.x - startPixel.x;
    const dy = endPixel.y - startPixel.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      return Math.hypot(point.x - startPixel.x, point.y - startPixel.y);
    }
    let t = ((point.x - startPixel.x) * dx + (point.y - startPixel.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    const projection = {
      x: startPixel.x + t * dx,
      y: startPixel.y + t * dy
    };
    return Math.hypot(point.x - projection.x, point.y - projection.y);
  }

  clearRoute() {
    this.routeGeojson = null;
    this.routeSegments = [];
    this.segmentLegLookup = [];
    this.latestMetrics = null;

    this.map.getSource('route-line-source')?.setData(EMPTY_LINE_STRING);
    this.map.getSource('distance-markers-source')?.setData(EMPTY_COLLECTION);
    this.map.getSource('route-segments-source')?.setData(EMPTY_COLLECTION);
    this.resetSegmentHover();
  }

  clearDirections() {
    this.waypoints = [];
    this.updateWaypoints();
    this.clearRoute();
    this.updateStats(null);
    this.updateElevationProfile([]);
    this.draggedWaypointIndex = null;
    this.setHoveredWaypointIndex(null);
  }

  setTransportMode(mode) {
    if (!this.modeColors[mode]) return;
    this.currentMode = mode;
    this.transportModes.forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === mode);
    });
    if (this.map.getLayer('route-line')) {
      this.map.setPaintProperty('route-line', 'line-color', this.modeColors[mode]);
    }
    if (this.map.getLayer('distance-markers')) {
      this.map.setPaintProperty('distance-markers', 'text-color', this.modeColors[mode]);
    }
    if (this.waypoints.length >= 2) {
      this.getRoute();
    }
  }

  rebuildSegmentData() {
    const coords = this.routeGeojson?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      this.routeSegments = [];
      this.segmentLegLookup = [];
      this.map.getSource('route-segments-source')?.setData(EMPTY_COLLECTION);
      this.resetSegmentHover();
      return;
    }

    this.routeSegments = coords.slice(0, -1).map((coord, index) => ({
      start: coord,
      end: coords[index + 1],
      index
    }));

    this.segmentLegLookup = this.computeSegmentLegLookup(coords);

    const segmentFeatures = this.routeSegments.map((segment) => ({
      type: 'Feature',
      properties: { segmentIndex: segment.index },
      geometry: {
        type: 'LineString',
        coordinates: [segment.start, segment.end]
      }
    }));

    this.map.getSource('route-segments-source')?.setData({
      type: 'FeatureCollection',
      features: segmentFeatures
    });

    this.resetSegmentHover();
  }

  computeSegmentLegLookup(coords) {
    if (this.waypoints.length < 2) return [];
    const lookup = new Array(coords.length - 1).fill(0);
    let currentLeg = 0;
    let nextWaypointIndex = 1;

    for (let i = 0; i < coords.length - 1; i += 1) {
      lookup[i] = currentLeg;
      const nextWaypoint = this.waypoints[nextWaypointIndex];
      if (nextWaypoint && this.coordinatesMatch(coords[i + 1], nextWaypoint)) {
        currentLeg = Math.min(currentLeg + 1, this.waypoints.length - 2);
        nextWaypointIndex += 1;
      }
    }

    return lookup;
  }

  coordinatesMatch(a, b) {
    if (!a || !b) return false;
    if (Math.abs(a[0] - b[0]) <= COORD_EPSILON && Math.abs(a[1] - b[1]) <= COORD_EPSILON) {
      return true;
    }
    if (!turfApi) return false;
    try {
      const distance = turfApi.distance(turfApi.point(a), turfApi.point(b), { units: 'meters' });
      return Number.isFinite(distance) && distance <= WAYPOINT_MATCH_TOLERANCE_METERS;
    } catch (error) {
      console.warn('Failed to compare waypoint coordinates', error);
      return false;
    }
  }

  formatDistance(distanceKm) {
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      return '0.0';
    }
    if (distanceKm >= 100) {
      return Math.round(distanceKm).toString();
    }
    if (distanceKm >= 10) {
      return distanceKm.toFixed(1);
    }
    return parseFloat(distanceKm.toFixed(2)).toString();
  }

  niceNumber(value, round) {
    const absValue = Math.abs(value);
    if (!Number.isFinite(absValue) || absValue === 0) {
      return 1;
    }
    const exponent = Math.floor(Math.log10(absValue));
    const fraction = absValue / 10 ** exponent;
    let niceFraction;

    if (round) {
      if (fraction < 1.5) {
        niceFraction = 1;
      } else if (fraction < 3) {
        niceFraction = 2;
      } else if (fraction < 7) {
        niceFraction = 5;
      } else {
        niceFraction = 10;
      }
    } else if (fraction <= 1) {
      niceFraction = 1;
    } else if (fraction <= 2) {
      niceFraction = 2;
    } else if (fraction <= 5) {
      niceFraction = 5;
    } else {
      niceFraction = 10;
    }

    return niceFraction * 10 ** exponent;
  }

  computeAxisTicks(minValue, maxValue, maxTicks = 6) {
    let min = Number.isFinite(minValue) ? minValue : 0;
    let max = Number.isFinite(maxValue) ? maxValue : min;

    if (max < min) {
      [min, max] = [max, min];
    }

    if (max === min) {
      const adjustment = Math.max(1, Math.abs(max) * 0.05 || 1);
      min -= adjustment;
      max += adjustment;
    }

    const span = Math.max(max - min, Number.EPSILON);
    const niceRange = this.niceNumber(span, false);
    const step = Math.max(
      this.niceNumber(niceRange / Math.max(1, maxTicks - 1), true),
      Number.EPSILON
    );
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    const ticks = [];
    const epsilon = step * 0.001;
    for (let value = niceMin; value <= niceMax + epsilon; value += step) {
      ticks.push(Number(value.toFixed(6)));
    }
    return { ticks, min: niceMin, max: niceMax, step };
  }

  formatElevationLabel(value) {
    if (!Number.isFinite(value)) return '0 m';
    return `${Math.round(value)} m`;
  }

  formatDistanceTick(value) {
    if (!Number.isFinite(value) || Math.abs(value) < 1e-6) {
      return '0 km';
    }
    return `${this.formatDistance(value)} km`;
  }

  calculateRouteMetrics(route) {
    const metrics = { distanceKm: 0, ascent: 0, descent: 0 };
    if (!route || !route.geometry?.coordinates) {
      return metrics;
    }

    const coords = route.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      return metrics;
    }

    if (turfApi) {
      try {
        const line = turfApi.lineString(coords);
        metrics.distanceKm = Number(turfApi.length(line, { units: 'kilometers' })) || 0;
      } catch (error) {
        console.error('Error computing route length', error);
      }
    }

    if (!metrics.distanceKm) {
      const summaryDistance = Number(route.properties?.summary?.distance);
      if (Number.isFinite(summaryDistance) && summaryDistance > 0) {
        metrics.distanceKm = summaryDistance / 1000;
      } else if (Array.isArray(route.properties?.segments)) {
        const totalMeters = route.properties.segments
          .map((segment) => Number(segment.distance) || 0)
          .reduce((total, value) => total + value, 0);
        metrics.distanceKm = totalMeters / 1000;
      }
    }

    let previousElevation = null;
    coords.forEach((coord) => {
      const elevation = coord?.[2];
      if (!Number.isFinite(elevation)) return;
      if (previousElevation === null) {
        previousElevation = elevation;
        return;
      }
      const delta = elevation - previousElevation;
      if (delta > 0) {
        metrics.ascent += delta;
      } else if (delta < 0) {
        metrics.descent += Math.abs(delta);
      }
      previousElevation = elevation;
    });

    if (metrics.ascent === 0 && metrics.descent === 0 && Array.isArray(route.properties?.segments)) {
      metrics.ascent = route.properties.segments
        .map((segment) => Number(segment.ascent) || 0)
        .reduce((total, value) => total + value, 0);
      metrics.descent = route.properties.segments
        .map((segment) => Number(segment.descent) || 0)
        .reduce((total, value) => total + value, 0);
    }

    return metrics;
  }

  downsampleElevations(elevations, limit = MAX_ELEVATION_POINTS) {
    if (!Array.isArray(elevations) || elevations.length <= limit) {
      return elevations ?? [];
    }

    const result = [];
    const bucketSize = elevations.length / limit;
    for (let bucketIndex = 0; bucketIndex < limit; bucketIndex += 1) {
      const start = Math.floor(bucketIndex * bucketSize);
      const end = bucketIndex === limit - 1
        ? elevations.length
        : Math.max(start + 1, Math.floor((bucketIndex + 1) * bucketSize));

      let sum = 0;
      let count = 0;
      for (let i = start; i < end; i += 1) {
        sum += elevations[i];
        count += 1;
      }

      result.push(count ? sum / count : elevations[start]);
    }

    return result;
  }

  updateStats(route) {
    if (!this.routeStats) return;
    if (!route || !route.geometry?.coordinates || route.geometry.coordinates.length < 2) {
      this.routeStats.innerHTML = '';
      return;
    }

    const metrics = this.latestMetrics ?? this.calculateRouteMetrics(route);
    const distanceLabel = this.formatDistance(metrics.distanceKm);
    const ascent = Math.max(0, Math.round(metrics.ascent));
    const descent = Math.max(0, Math.round(metrics.descent));

    this.routeStats.innerHTML = `
      <span class="sr-only">
        Distance: ${distanceLabel} km. Ascent: ${ascent} m. Descent: ${descent} m.
      </span>
    `;
  }

  updateElevationProfile(coordinates) {
    if (!this.elevationChart) return;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      this.elevationChart.innerHTML = '';
      return;
    }

    const elevations = coordinates
      .map((coord) => coord[2])
      .filter((value) => Number.isFinite(value));

    if (!elevations.length) {
      this.elevationChart.innerHTML = '';
      return;
    }

    const metrics = this.latestMetrics ?? this.calculateRouteMetrics({ geometry: { coordinates } });
    const totalDistance = Number(metrics.distanceKm) || 0;
    const distanceLabel = this.formatDistance(totalDistance);
    const ascent = Math.max(0, Math.round(metrics.ascent ?? 0));
    const descent = Math.max(0, Math.round(metrics.descent ?? 0));

    const sampledElevations = this.downsampleElevations(elevations);
    const maxElevation = Math.max(...elevations);
    const minElevation = Math.min(...elevations);
    const yAxis = this.computeAxisTicks(minElevation, maxElevation, ELEVATION_TICK_TARGET);
    const range = Math.max(1, yAxis.max - yAxis.min);

    const chartHtml = sampledElevations
      .map((value) => {
        const clamped = Math.min(yAxis.max, Math.max(yAxis.min, value));
        const height = Math.max(2, ((clamped - yAxis.min) / range) * 100);
        return `<div class="elevation-bar" style="height:${height.toFixed(2)}%" title="${Math.round(value)} m"></div>`;
      })
      .join('');

    const yAxisLabels = [...yAxis.ticks]
      .sort((a, b) => b - a)
      .map((value) => `<span>${this.formatElevationLabel(value)}</span>`)
      .join('');

    const distanceAxis = this.computeAxisTicks(0, totalDistance, DISTANCE_TICK_TARGET);
    const rawTicks = [...distanceAxis.ticks];
    if (totalDistance > 0) {
      const lastTick = rawTicks[rawTicks.length - 1];
      if (!rawTicks.length || Math.abs(lastTick - totalDistance) > distanceAxis.step * 0.25) {
        rawTicks.push(totalDistance);
      }
    }
    const tickSet = new Set();
    rawTicks.forEach((value) => {
      const normalized = Number(value.toFixed(3));
      if (Number.isFinite(normalized) && normalized >= 0) {
        tickSet.add(normalized);
      }
    });
    if (totalDistance > 0) {
      tickSet.add(Number(totalDistance.toFixed(3)));
    }
    tickSet.add(0);
    const tolerance = distanceAxis.step || 1;
    const upperBound = totalDistance > 0
      ? Number(totalDistance.toFixed(3))
      : Math.max(...tickSet);
    const xTicks = Array.from(tickSet)
      .filter((value) => value <= upperBound + tolerance * 0.25)
      .sort((a, b) => a - b);
    const xAxisLabels = xTicks
      .map((value) => `<span>${this.formatDistanceTick(value)}</span>`)
      .join('');

    this.elevationChart.innerHTML = `
      <div class="elevation-summary" role="presentation">
        <div class="summary-item ascent" title="Total ascent">
          ${SUMMARY_ICONS.ascent}
          <span>${ascent} m</span>
        </div>
        <div class="summary-item descent" title="Total descent">
          ${SUMMARY_ICONS.descent}
          <span>${descent} m</span>
        </div>
        <div class="summary-item distance" title="Total distance">
          ${SUMMARY_ICONS.distance}
          <span>${distanceLabel} km</span>
        </div>
      </div>
      <div class="elevation-plot">
        <div class="elevation-y-axis">${yAxisLabels}</div>
        <div class="elevation-plot-area">
          <div class="elevation-chart-container" role="presentation">${chartHtml}</div>
          <div class="elevation-x-axis">${xAxisLabels}</div>
        </div>
      </div>
    `;
  }

  updateDistanceMarkers(route) {
    const source = this.map.getSource('distance-markers-source');
    if (!source) return;

    if (!route || !route.geometry?.coordinates || !turfApi) {
      source.setData(EMPTY_COLLECTION);
      return;
    }

    try {
      const coordinates = route.geometry.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        source.setData(EMPTY_COLLECTION);
        return;
      }

      const metrics = this.latestMetrics ?? this.calculateRouteMetrics(route);
      const totalDistance = Number(metrics.distanceKm) || 0;
      if (totalDistance <= 0) {
        source.setData(EMPTY_COLLECTION);
        return;
      }

      const line = turfApi.lineString(coordinates);
      const markerInterval = totalDistance > MAX_DISTANCE_MARKERS
        ? Math.ceil(totalDistance / MAX_DISTANCE_MARKERS)
        : 1;

      const formatMarkerLabel = (value) => {
        if (value === 0) return '0 km';
        if (value >= 100) return `${Math.round(value)} km`;
        if (value >= 10) return `${parseFloat(value.toFixed(1))} km`;
        if (value >= 1) return `${parseFloat(value.toFixed(1))} km`;
        return `${parseFloat(value.toFixed(2))} km`;
      };

      const features = [];
      let lastLabelValue = -Infinity;

      const addMarker = (distanceKm, labelValue = distanceKm) => {
        const clamped = Math.min(distanceKm, totalDistance);
        const point = turfApi.along(line, clamped, { units: 'kilometers' });
        features.push({
          type: 'Feature',
          properties: { distance: formatMarkerLabel(labelValue) },
          geometry: { type: 'Point', coordinates: point.geometry.coordinates }
        });
        lastLabelValue = labelValue;
      };

      addMarker(0, 0);

      for (let km = markerInterval; km < totalDistance; km += markerInterval) {
        addMarker(km, km);
      }

      if (totalDistance - lastLabelValue > 0.01) {
        addMarker(totalDistance, totalDistance);
      }

      source.setData({ type: 'FeatureCollection', features });
    } catch (error) {
      console.error('Error updating distance markers', error);
      source.setData(EMPTY_COLLECTION);
    }
  }

  applyRoute(route) {
    this.routeGeojson = route;
    this.latestMetrics = this.calculateRouteMetrics(route);
    this.map.getSource('route-line-source')?.setData(route ?? EMPTY_LINE_STRING);
    this.rebuildSegmentData();
    this.updateDistanceMarkers(route);
    this.updateStats(route);
    this.updateElevationProfile(route?.geometry?.coordinates ?? []);
  }

  async getRoute() {
    if (this.waypoints.length < 2) return;

    try {
      const response = await fetch(`https://api.openrouteservice.org/v2/directions/${this.currentMode}/geojson`, {
        method: 'POST',
        headers: {
          Accept: 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
          'Content-Type': 'application/json',
          Authorization: '5b3ce3597851110001cf62483828a115553d4a98817dd43f61935829'
        },
        body: JSON.stringify({
          coordinates: this.waypoints,
          elevation: true,
          extra_info: ['waytype', 'steepness'],
          preference: this.currentMode === 'foot-hiking' ? 'recommended' : 'fastest',
          units: 'km',
          language: 'en'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Unable to fetch directions');
      }

      const data = await response.json();
      const route = data.features?.[0];
      if (!route) {
        throw new Error('No route returned from the directions service');
      }

      this.applyRoute(route);
    } catch (error) {
      console.error('Failed to fetch route', error);
    }
  }
}
