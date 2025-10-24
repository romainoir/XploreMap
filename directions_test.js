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

const ASCENT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 18a1 1 0 0 1-.7-1.7l6.3-6.3a1 1 0 0 1 1.4 0l3.3 3.3 4.9-6.7H17a1 1 0 0 1 0-2h5a1 1 0 0 1 1 1v5a1 1 0 0 1-2 0V7.41l-5.6 7.6a1 1 0 0 1-1.5.12l-3.3-3.3-5.6 5.6a1 1 0 0 1-.7.27Z"/></svg>';
const DESCENT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 6a1 1 0 0 1 .7 1.7l-6.3 6.3a1 1 0 0 1-1.4 0l-3.3-3.3-4.9 6.7H7a1 1 0 0 1 0 2H2a1 1 0 0 1-1-1v-5a1 1 0 0 1 2 0v3.59l5.6-7.6a1 1 0 0 1 1.5-.12l3.3 3.3 5.6-5.6a1 1 0 0 1 .7-.27Z"/></svg>';

const SUMMARY_ICONS = {
  ascent: ASCENT_ICON,
  descent: DESCENT_ICON
};

const DISTANCE_MARKER_PREFIX = 'distance-marker-';
const DISTANCE_MARKER_COLOR = '#f38b1c';

function createDistanceMarkerImage(label, {
  fill = DISTANCE_MARKER_COLOR
} = {}) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  const deviceRatio = 2;
  const fontSize = 13;
  const paddingX = 8;
  const paddingY = 6;
  const borderRadius = 8;
  const font = `600 ${fontSize * deviceRatio}px 'Noto Sans', 'Noto Sans Bold', sans-serif`;
  context.font = font;
  const metrics = context.measureText(label);
  const textWidth = metrics.width;

  const baseWidth = Math.ceil(textWidth / deviceRatio + paddingX * 2);
  const baseHeight = Math.ceil(fontSize + paddingY * 2);

  canvas.width = baseWidth * deviceRatio;
  canvas.height = baseHeight * deviceRatio;

  context.scale(deviceRatio, deviceRatio);
  context.font = `600 ${fontSize}px 'Noto Sans', 'Noto Sans Bold', sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const drawRoundedRect = (x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  };

  drawRoundedRect(0, 0, baseWidth, baseHeight, borderRadius);
  context.fillStyle = fill;
  context.fill();

  context.fillStyle = '#ffffff';
  context.fillText(label, baseWidth / 2, baseHeight / 2);

  return { image: canvas, pixelRatio: deviceRatio };
}

function ensureDistanceMarkerImage(map, label) {
  const imageId = `${DISTANCE_MARKER_PREFIX}${label}`;
  if (map.hasImage(imageId)) {
    return imageId;
  }

  const rendered = createDistanceMarkerImage(label);
  if (!rendered) {
    return null;
  }

  map.addImage(imageId, rendered.image, { pixelRatio: rendered.pixelRatio });
  return imageId;
}

const createWaypointFeature = (coords, index, total) => {
  const isStart = index === 0;
  const isEnd = index === total - 1 && total > 1;
  const role = isStart ? 'start' : isEnd ? 'end' : 'via';

  let title = '';
  if (isStart) {
    title = 'Départ';
  } else if (isEnd) {
    title = 'Arrivée';
  }

  return {
    type: 'Feature',
    properties: {
      index,
      role,
      title
    },
    geometry: {
      type: 'Point',
      coordinates: coords
    }
  };
};

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
    this.mapContainer = map.getContainer?.() ?? null;
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
      this.routeStats.setAttribute('aria-live', 'polite');
      this.routeStats.setAttribute('role', 'group');
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
    this.routeProfile = null;
    this.elevationSamples = [];
    this.elevationChartContainer = null;
    this.highlightedElevationBar = null;
    this.activeHoverSource = null;
    this.lastElevationHoverDistance = null;

    this.setHintVisible(false);

    this.handleWaypointMouseDown = (event) => this.onWaypointMouseDown(event);
    this.handleMapMouseMove = (event) => this.onMapMouseMove(event);
    this.handleMapMouseUp = () => this.onMapMouseUp();
    this.handleMapMouseLeave = () => {
      this.resetSegmentHover('map');
      this.setHoveredWaypointIndex(null);
    };
    this.handleMapClick = (event) => this.onMapClick(event);
    this.handleWaypointDoubleClick = (event) => this.onWaypointDoubleClick(event);
    this.handleElevationPointerMove = (event) => this.onElevationPointerMove(event);
    this.handleElevationPointerLeave = () => this.onElevationPointerLeave();

    this.routeHoverTooltip = null;

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
    removeLayer('route-hover-point');
    removeLayer('waypoints');
    removeLayer('waypoints-hit-area');
    removeLayer('route-markers');

    removeSource('route-line-source');
    removeSource('route-segments-source');
    removeSource('distance-markers-source');
    removeSource('route-hover-point-source');
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

    this.map.addSource('route-hover-point-source', {
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
        'line-opacity': 0
      },
      filter: ['==', 'segmentIndex', -1]
    });

    this.map.addLayer({
      id: 'distance-markers',
      type: 'symbol',
      source: 'distance-markers-source',
      layout: {
        'symbol-placement': 'point',
        'icon-image': ['concat', DISTANCE_MARKER_PREFIX, ['get', 'label']],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-anchor': 'center',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 12, 0.65, 16, 0.85],
        'text-field': '{label}',
        'text-size': 12,
        'text-anchor': 'center',
        'text-font': ['Noto Sans Bold'],
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: {
        'text-color': '#ffffff'
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
        'circle-radius': [
          'case',
          ['==', ['get', 'role'], 'start'], 9,
          ['==', ['get', 'role'], 'end'], 9,
          0
        ],
        'circle-color': [
          'case',
          ['==', ['get', 'role'], 'start'], '#2f8f3b',
          ['==', ['get', 'role'], 'end'], '#d64545',
          'rgba(0, 0, 0, 0)'
        ],
        'circle-stroke-width': [
          'case',
          ['any', ['==', ['get', 'role'], 'start'], ['==', ['get', 'role'], 'end']], 2,
          0
        ],
        'circle-stroke-color': '#ffffff'
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
        'text-offset': [0, 1.4],
        'text-anchor': 'top'
      },
      paint: {
        'text-color': [
          'case',
          ['==', ['get', 'role'], 'start'], '#2f8f3b',
          ['==', ['get', 'role'], 'end'], '#d64545',
          'rgba(17, 34, 48, 0.75)'
        ],
        'text-halo-color': 'rgba(255, 255, 255, 0.9)',
        'text-halo-width': 1.2,
        'text-halo-blur': 0.5
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

    this.map.addLayer({
      id: 'route-hover-point',
      type: 'circle',
      source: 'route-hover-point-source',
      paint: {
        'circle-radius': 6,
        'circle-color': '#fff',
        'circle-stroke-width': 3,
        'circle-stroke-color': this.modeColors[this.currentMode],
        'circle-opacity': 0
      }
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
      this.hideRouteHover();
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
      this.resetSegmentHover('map');
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
      this.resetSegmentHover('map');
    } else {
      const segment = this.routeSegments[closestIndex];
      if (!segment) {
        this.resetSegmentHover('map');
        return;
      }
      const projection = this.projectPointOnSegment(event.lngLat, segment.start, segment.end);
      this.showRouteHoverOnSegment(closestIndex, projection, { mousePoint: event.point, source: 'map' });
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

  clearHover(source = null) {
    if (source && this.activeHoverSource && source !== this.activeHoverSource) {
      return;
    }
    this.activeHoverSource = null;
    this.setHoveredSegment(null);
    this.hideRouteHover();
  }

  resetSegmentHover(source = null) {
    this.clearHover(source);
  }

  addViaWaypoint(lngLat) {
    if (this.hoveredSegmentIndex === null) return;
    const segment = this.routeSegments[this.hoveredSegmentIndex];
    if (!segment) return;

    const { coordinates: snapped } = this.projectPointOnSegment(lngLat, segment.start, segment.end);
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
      return { coordinates: [...startCoord], t: 0 };
    }
    let t = ((clickPixel.x - startPixel.x) * dx + (clickPixel.y - startPixel.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    const projected = {
      x: startPixel.x + t * dx,
      y: startPixel.y + t * dy
    };
    const result = this.map.unproject(projected);
    return { coordinates: [result.lng, result.lat], t };
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

  findProfileIntervalIndex(distanceKm) {
    const profile = this.routeProfile;
    const distances = profile?.cumulativeDistances;
    if (!profile || !Array.isArray(distances) || distances.length < 2) {
      return null;
    }
    if (!Number.isFinite(distanceKm)) {
      return null;
    }

    const lastIndex = distances.length - 1;
    if (distanceKm <= (distances[0] ?? 0)) {
      return 0;
    }
    if (distanceKm >= (distances[lastIndex] ?? 0)) {
      return Math.max(0, lastIndex - 1);
    }

    let low = 0;
    let high = lastIndex;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const value = distances[mid];
      if (!Number.isFinite(value)) {
        break;
      }
      if (value <= distanceKm) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const index = Math.max(0, Math.min(low - 1, lastIndex - 1));
    return index;
  }

  getElevationAtDistance(distanceKm) {
    if (!this.routeProfile || !Number.isFinite(distanceKm)) {
      return null;
    }

    const distances = this.routeProfile.cumulativeDistances ?? [];
    const elevations = this.routeProfile.elevations ?? [];
    if (!Array.isArray(distances) || !Array.isArray(elevations) || distances.length !== elevations.length) {
      return null;
    }

    const lastIndex = distances.length - 1;
    if (lastIndex < 0) {
      return null;
    }

    const findPrev = (startIndex) => {
      for (let index = Math.min(startIndex, lastIndex); index >= 0; index -= 1) {
        const distance = distances[index];
        const elevation = elevations[index];
        if (!Number.isFinite(distance) || distance > distanceKm) {
          continue;
        }
        if (Number.isFinite(elevation)) {
          return { distance, elevation };
        }
      }
      return null;
    };

    const findNext = (startIndex) => {
      for (let index = Math.max(startIndex, 0); index <= lastIndex; index += 1) {
        const distance = distances[index];
        const elevation = elevations[index];
        if (!Number.isFinite(distance) || distance < distanceKm) {
          continue;
        }
        if (Number.isFinite(elevation)) {
          return { distance, elevation };
        }
      }
      return null;
    };

    if (distanceKm <= (distances[0] ?? 0)) {
      const next = findNext(0);
      return next?.elevation ?? null;
    }

    if (distanceKm >= (distances[lastIndex] ?? 0)) {
      const prev = findPrev(lastIndex);
      return prev?.elevation ?? null;
    }

    const intervalIndex = this.findProfileIntervalIndex(distanceKm);
    if (intervalIndex === null) {
      return null;
    }

    const previous = findPrev(Math.min(intervalIndex + 1, lastIndex));
    const next = findNext(Math.max(intervalIndex, 0));

    if (previous && next && Number.isFinite(previous.distance) && Number.isFinite(next.distance)
      && next.distance > previous.distance) {
      const span = next.distance - previous.distance;
      const ratio = span > 0 ? (distanceKm - previous.distance) / span : 0;
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      return previous.elevation + (next.elevation - previous.elevation) * clampedRatio;
    }

    if (previous) {
      return previous.elevation;
    }
    if (next) {
      return next.elevation;
    }

    return null;
  }

  computeGradeAtDistance(distanceKm, windowMeters = 30) {
    if (!this.routeProfile || !Number.isFinite(distanceKm)) {
      return null;
    }

    const totalDistance = Number(this.routeProfile.totalDistanceKm);
    if (!Number.isFinite(totalDistance) || totalDistance <= 0) {
      return null;
    }

    const minimumWindowKm = Math.max(windowMeters / 1000, Math.min(totalDistance, 0.01));
    const dynamicWindowKm = Math.max(minimumWindowKm, totalDistance * 0.015);
    const windowKm = Math.min(dynamicWindowKm, totalDistance);

    let startDistance = Math.max(0, distanceKm - windowKm / 2);
    let endDistance = Math.min(totalDistance, distanceKm + windowKm / 2);

    if (endDistance - startDistance < minimumWindowKm) {
      const padding = (minimumWindowKm - (endDistance - startDistance)) / 2;
      startDistance = Math.max(0, startDistance - padding);
      endDistance = Math.min(totalDistance, endDistance + padding);
    }

    const span = endDistance - startDistance;
    if (!Number.isFinite(span) || span <= 0.002) {
      return null;
    }

    const startElevation = this.getElevationAtDistance(startDistance);
    const endElevation = this.getElevationAtDistance(endDistance);
    if (!Number.isFinite(startElevation) || !Number.isFinite(endElevation)) {
      return null;
    }

    const horizontalMeters = Math.max(span * 1000, 1);
    const grade = ((endElevation - startElevation) / horizontalMeters) * 100;
    if (!Number.isFinite(grade)) {
      return null;
    }

    const clamped = Math.max(Math.min(grade, 100), -100);
    return clamped;
  }

  computeDistanceKm(startCoord, endCoord) {
    if (!startCoord || !endCoord) return 0;
    if (turfApi) {
      try {
        return turfApi.distance(turfApi.point(startCoord), turfApi.point(endCoord), { units: 'kilometers' });
      } catch (error) {
        console.warn('Failed to measure distance with turf', error);
      }
    }

    const toRadians = (value) => (value * Math.PI) / 180;
    const [lng1, lat1] = startCoord;
    const [lng2, lat2] = endCoord;
    const earthRadiusKm = 6371;
    const dLat = toRadians((lat2 ?? 0) - (lat1 ?? 0));
    const dLng = toRadians((lng2 ?? 0) - (lng1 ?? 0));
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRadians(lat1 ?? 0)) * Math.cos(toRadians(lat2 ?? 0)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    return earthRadiusKm * c;
  }

  findSegmentIndexByDistance(distanceKm) {
    if (!Array.isArray(this.routeSegments) || !this.routeSegments.length) {
      return null;
    }
    if (!Number.isFinite(distanceKm)) {
      return null;
    }

    const lastIndex = this.routeSegments.length - 1;
    if (distanceKm <= (this.routeSegments[0]?.startDistanceKm ?? 0)) {
      return 0;
    }
    if (distanceKm >= (this.routeSegments[lastIndex]?.endDistanceKm ?? 0)) {
      return lastIndex;
    }

    let low = 0;
    let high = lastIndex;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const segment = this.routeSegments[mid];
      if (!segment) {
        break;
      }
      const start = segment.startDistanceKm ?? 0;
      const end = segment.endDistanceKm ?? start;
      if (distanceKm < start) {
        high = mid - 1;
      } else if (distanceKm > end) {
        low = mid + 1;
      } else {
        return mid;
      }
    }

    const candidate = Math.max(0, Math.min(low, lastIndex));
    return candidate;
  }

  interpolateSegmentCoordinate(segment, t, distanceKm) {
    if (!segment) {
      return null;
    }
    const start = segment.start ?? [];
    const end = segment.end ?? [];
    const startLng = Number(start[0]);
    const startLat = Number(start[1]);
    const endLng = Number(end[0]);
    const endLat = Number(end[1]);
    if (!Number.isFinite(startLng) || !Number.isFinite(startLat) || !Number.isFinite(endLng) || !Number.isFinite(endLat)) {
      return null;
    }

    const clampedT = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
    const lng = startLng + (endLng - startLng) * clampedT;
    const lat = startLat + (endLat - startLat) * clampedT;

    const coord = [lng, lat];
    const interpolatedElevation = this.getElevationAtDistance(distanceKm);
    if (Number.isFinite(interpolatedElevation)) {
      coord.push(interpolatedElevation);
      return coord;
    }

    const startElevation = Number(start[2]);
    const endElevation = Number(end[2]);
    if (Number.isFinite(startElevation) && Number.isFinite(endElevation)) {
      coord.push(startElevation + (endElevation - startElevation) * clampedT);
    } else if (Number.isFinite(startElevation)) {
      coord.push(startElevation);
    } else if (Number.isFinite(endElevation)) {
      coord.push(endElevation);
    }

    return coord;
  }

  showRouteHoverOnSegment(segmentIndex, projection, { mousePoint = null, source = null } = {}) {
    const segment = this.routeSegments?.[segmentIndex];
    if (!segment) {
      return;
    }

    const clampedT = Math.max(0, Math.min(1, Number.isFinite(projection?.t) ? projection.t : 0));
    const distanceKm = Number.isFinite(projection?.distanceKm)
      ? projection.distanceKm
      : (segment.startDistanceKm ?? 0) + (segment.distanceKm ?? 0) * clampedT;

    const coordinates = this.interpolateSegmentCoordinate(segment, clampedT, distanceKm) ?? projection?.coordinates ?? null;
    let screenPoint = mousePoint;
    if ((!screenPoint || !Number.isFinite(screenPoint.x) || !Number.isFinite(screenPoint.y)) && coordinates) {
      try {
        const projected = this.map.project(toLngLat(coordinates));
        if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
          screenPoint = { x: projected.x, y: projected.y };
        }
      } catch (error) {
        console.warn('Failed to project hover coordinate', error);
      }
    }

    const projectionData = {
      ...projection,
      coordinates,
      t: clampedT,
      distanceKm,
      source
    };

    this.activeHoverSource = source ?? null;
    this.setHoveredSegment(segmentIndex);
    this.updateRouteHoverDisplay(screenPoint, segment, projectionData);
  }

  showRouteHoverAtDistance(distanceKm, { source = null } = {}) {
    if (!Number.isFinite(distanceKm)) {
      this.resetSegmentHover(source ?? undefined);
      return;
    }

    const segmentIndex = this.findSegmentIndexByDistance(distanceKm);
    if (!Number.isInteger(segmentIndex)) {
      this.resetSegmentHover(source ?? undefined);
      return;
    }

    const segment = this.routeSegments?.[segmentIndex];
    if (!segment) {
      this.resetSegmentHover(source ?? undefined);
      return;
    }

    const startDistance = segment.startDistanceKm ?? 0;
    const segmentDistance = segment.distanceKm ?? 0;
    let relativeDistance = distanceKm - startDistance;
    if (!Number.isFinite(relativeDistance)) {
      relativeDistance = 0;
    }
    relativeDistance = Math.max(0, Math.min(segmentDistance, relativeDistance));
    const t = segmentDistance > 0 ? relativeDistance / segmentDistance : 0;

    this.showRouteHoverOnSegment(segmentIndex, { t, distanceKm }, { source });
  }

  buildRouteProfile(coordinates = []) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return null;
    }

    const cumulativeDistances = new Array(coordinates.length).fill(0);
    let totalDistance = 0;

    for (let index = 1; index < coordinates.length; index += 1) {
      const segmentDistance = this.computeDistanceKm(coordinates[index - 1], coordinates[index]);
      totalDistance += Number.isFinite(segmentDistance) ? segmentDistance : 0;
      cumulativeDistances[index] = totalDistance;
    }

    const elevations = coordinates.map((coord) => {
      const elevation = coord?.[2];
      return Number.isFinite(elevation) ? elevation : null;
    });

    return {
      coordinates,
      cumulativeDistances,
      totalDistanceKm: totalDistance,
      elevations
    };
  }

  generateElevationSamples(coordinates) {
    if (!this.routeProfile) return [];
    const profile = this.routeProfile;
    const points = (coordinates ?? [])
      .map((coord, index) => ({
        elevation: Number.isFinite(coord?.[2]) ? coord[2] : null,
        distanceKm: profile.cumulativeDistances[index] ?? 0
      }))
      .filter((point) => Number.isFinite(point.elevation));

    if (points.length < 2) {
      return [];
    }

    if (points.length <= MAX_ELEVATION_POINTS) {
      const samples = points.map((point, index) => ({
        elevation: point.elevation,
        startDistanceKm: index === 0 ? 0 : points[index - 1].distanceKm,
        endDistanceKm: point.distanceKm
      }));
      if (samples.length) {
        const lastSample = samples[samples.length - 1];
        if (Number.isFinite(profile.totalDistanceKm) && lastSample.endDistanceKm < profile.totalDistanceKm) {
          lastSample.endDistanceKm = profile.totalDistanceKm;
        }
      }
      return samples;
    }

    const samples = [];
    const bucketSize = points.length / MAX_ELEVATION_POINTS;

    for (let bucketIndex = 0; bucketIndex < MAX_ELEVATION_POINTS; bucketIndex += 1) {
      const start = Math.floor(bucketIndex * bucketSize);
      const end = bucketIndex === MAX_ELEVATION_POINTS - 1
        ? points.length
        : Math.max(start + 1, Math.floor((bucketIndex + 1) * bucketSize));

      let elevationSum = 0;
      let count = 0;
      for (let index = start; index < end; index += 1) {
        elevationSum += points[index].elevation;
        count += 1;
      }

      const firstPoint = points[start];
      const lastPoint = points[Math.min(end - 1, points.length - 1)];
      const startDistanceKm = firstPoint?.distanceKm ?? 0;
      const endDistanceKm = lastPoint?.distanceKm ?? startDistanceKm;
      samples.push({
        elevation: count ? elevationSum / count : firstPoint?.elevation ?? 0,
        startDistanceKm,
        endDistanceKm
      });
    }

    if (samples.length) {
      const lastSample = samples[samples.length - 1];
      if (Number.isFinite(profile.totalDistanceKm) && lastSample.endDistanceKm < profile.totalDistanceKm) {
        lastSample.endDistanceKm = profile.totalDistanceKm;
      }
    }

    return samples;
  }

  ensureRouteHoverTooltip() {
    if (this.routeHoverTooltip && this.routeHoverTooltip.parentElement) {
      return this.routeHoverTooltip;
    }
    const tooltip = document.createElement('div');
    tooltip.className = 'directions-route-tooltip';
    tooltip.setAttribute('role', 'presentation');
    tooltip.style.display = 'none';
    (this.mapContainer ?? document.body).appendChild(tooltip);
    this.routeHoverTooltip = tooltip;
    return tooltip;
  }

  formatGrade(value) {
    if (!Number.isFinite(value)) return '—';
    const rounded = Math.round(value * 10) / 10;
    const formatted = Math.abs(rounded) < 0.05 ? 0 : rounded;
    const sign = formatted > 0 ? '+' : '';
    return `${sign}${formatted.toFixed(1)}%`;
  }

  highlightElevationAt(distanceKm) {
    if (!this.elevationChartContainer) return;
    const bars = Array.from(this.elevationChartContainer.querySelectorAll('.elevation-bar'));
    let targetBar = null;
    let fallbackBar = null;
    let fallbackDelta = Infinity;

    if (Number.isFinite(distanceKm)) {
      for (const bar of bars) {
        const startKm = Number(bar.dataset.startKm);
        const endKm = Number(bar.dataset.endKm);
        if (!Number.isFinite(startKm) || !Number.isFinite(endKm)) {
          continue;
        }
        const segmentSpan = Math.max(endKm - startKm, 0);
        const tolerance = Math.max(0.0005, segmentSpan * 0.6);
        if (distanceKm >= startKm - tolerance && distanceKm <= endKm + tolerance) {
          targetBar = bar;
          break;
        }
        const center = startKm + segmentSpan / 2;
        const delta = Math.abs(center - distanceKm);
        if (delta < fallbackDelta) {
          fallbackDelta = delta;
          fallbackBar = bar;
        }
      }

      if (!targetBar && fallbackBar) {
        targetBar = fallbackBar;
      }
    }

    if (this.highlightedElevationBar && this.highlightedElevationBar !== targetBar) {
      this.highlightedElevationBar.classList.remove('highlighted');
    }

    if (targetBar) {
      if (targetBar !== this.highlightedElevationBar) {
        targetBar.classList.add('highlighted');
      }
      this.highlightedElevationBar = targetBar;
    } else {
      this.highlightedElevationBar = null;
    }
  }

  detachElevationChartEvents() {
    if (!this.elevationChartContainer) {
      return;
    }
    this.elevationChartContainer.removeEventListener('pointermove', this.handleElevationPointerMove);
    this.elevationChartContainer.removeEventListener('pointerleave', this.handleElevationPointerLeave);
  }

  attachElevationChartEvents() {
    if (!this.elevationChartContainer) {
      return;
    }
    this.elevationChartContainer.addEventListener('pointermove', this.handleElevationPointerMove);
    this.elevationChartContainer.addEventListener('pointerleave', this.handleElevationPointerLeave);
  }

  onElevationPointerMove(event) {
    if (!this.elevationChartContainer) {
      return;
    }

    const bars = Array.from(this.elevationChartContainer.querySelectorAll('.elevation-bar'));
    if (!bars.length) {
      return;
    }

    let target = event.target?.closest?.('.elevation-bar') ?? null;
    if (!target || !this.elevationChartContainer.contains(target)) {
      const rect = this.elevationChartContainer.getBoundingClientRect();
      const relativeX = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
      const ratio = Math.max(0, Math.min(0.9999, relativeX));
      const index = Math.max(0, Math.min(bars.length - 1, Math.floor(ratio * bars.length)));
      target = bars[index];
    }

    if (!target) {
      return;
    }

    const startKm = Number(target.dataset.startKm);
    const endKm = Number(target.dataset.endKm);
    if (!Number.isFinite(startKm) || !Number.isFinite(endKm)) {
      return;
    }

    const midpoint = Number(target.dataset.midKm);
    const distanceKm = Number.isFinite(midpoint)
      ? midpoint
      : Math.max(0, startKm + Math.max(0, endKm - startKm) / 2);

    if (this.activeHoverSource === 'chart' && this.lastElevationHoverDistance !== null
      && Math.abs(this.lastElevationHoverDistance - distanceKm) < 1e-4) {
      return;
    }

    this.lastElevationHoverDistance = distanceKm;
    this.showRouteHoverAtDistance(distanceKm, { source: 'chart' });
  }

  onElevationPointerLeave() {
    this.lastElevationHoverDistance = null;
    this.resetSegmentHover('chart');
  }

  hideRouteHover() {
    if (this.routeHoverTooltip) {
      this.routeHoverTooltip.style.display = 'none';
    }
    this.map.getSource('route-hover-point-source')?.setData(EMPTY_COLLECTION);
    if (this.map.getLayer('route-hover-point')) {
      this.map.setPaintProperty('route-hover-point', 'circle-opacity', 0);
    }
    const canvas = this.map.getCanvas?.();
    if (canvas) {
      canvas.style.cursor = '';
    }
    this.highlightElevationAt(null);
  }

  updateRouteHoverDisplay(mousePoint, segment, projection) {
    if (!segment || !projection) return;

    const tooltip = this.ensureRouteHoverTooltip();
    const clampedT = Math.max(0, Math.min(1, Number.isFinite(projection.t) ? projection.t : 0));
    const distanceKm = Number.isFinite(projection.distanceKm)
      ? projection.distanceKm
      : (segment.startDistanceKm ?? 0) + (segment.distanceKm ?? 0) * clampedT;
    const distanceLabel = this.formatDistance(distanceKm);
    const elevation = this.getElevationAtDistance(distanceKm);
    let gradeValue = this.computeGradeAtDistance(distanceKm);
    if (!Number.isFinite(gradeValue)) {
      if ((segment.distanceKm ?? 0) > 0 && Number.isFinite(segment.startElevation) && Number.isFinite(segment.endElevation)) {
        gradeValue = ((segment.endElevation - segment.startElevation) / Math.max(segment.distanceKm * 1000, 1)) * 100;
      } else {
        gradeValue = null;
      }
    }
    const altitudeLabel = Number.isFinite(elevation) ? `${Math.round(elevation)} m` : 'N/A';
    const gradeLabel = this.formatGrade(gradeValue);

    let screenPoint = mousePoint;
    if ((!screenPoint || !Number.isFinite(screenPoint.x) || !Number.isFinite(screenPoint.y)) && projection.coordinates) {
      try {
        const projected = this.map.project(toLngLat(projection.coordinates));
        if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
          screenPoint = { x: projected.x, y: projected.y };
        }
      } catch (error) {
        console.warn('Failed to project tooltip coordinate', error);
      }
    }

    tooltip.innerHTML = `
      <div class="tooltip-distance">${distanceLabel} km</div>
      <div class="tooltip-details">
        <span class="tooltip-altitude">Alt. ${altitudeLabel}</span>
        <span class="tooltip-grade">${gradeLabel}</span>
      </div>
    `;
    tooltip.style.display = 'block';

    const container = this.mapContainer;
    if (container && screenPoint) {
      const margin = 12;
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      const maxLeft = container.clientWidth - tooltipWidth - margin;
      const maxTop = container.clientHeight - tooltipHeight - margin;
      const centeredLeft = screenPoint.x - tooltipWidth / 2;
      let rawTop = screenPoint.y - tooltipHeight - margin;
      if (rawTop < margin) {
        rawTop = Math.min(screenPoint.y + margin, maxTop);
      }
      const left = Math.min(Math.max(centeredLeft, margin), Math.max(margin, maxLeft));
      const top = Math.min(Math.max(rawTop, margin), Math.max(margin, maxTop));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    if (this.map.getLayer('route-hover-point')) {
      this.map.setPaintProperty('route-hover-point', 'circle-opacity', 1);
    }
    if (projection.coordinates) {
      this.map.getSource('route-hover-point-source')?.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: projection.coordinates }
          }
        ]
      });
    } else {
      this.map.getSource('route-hover-point-source')?.setData(EMPTY_COLLECTION);
    }

    const canvas = this.map.getCanvas?.();
    if (canvas) {
      const shouldPointer = projection.source === 'map';
      canvas.style.cursor = shouldPointer ? 'pointer' : '';
    }

    this.highlightElevationAt(distanceKm);
  }

  clearRoute() {
    this.routeGeojson = null;
    this.routeSegments = [];
    this.segmentLegLookup = [];
    this.latestMetrics = null;
    this.routeProfile = null;
    this.elevationSamples = [];
    this.detachElevationChartEvents();
    this.elevationChartContainer = null;
    this.highlightedElevationBar = null;
    this.lastElevationHoverDistance = null;

    this.map.getSource('route-line-source')?.setData(EMPTY_LINE_STRING);
    this.map.getSource('distance-markers-source')?.setData(EMPTY_COLLECTION);
    this.map.getSource('route-segments-source')?.setData(EMPTY_COLLECTION);
    this.clearHover();
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
    if (this.map.getLayer('route-hover-point')) {
      this.map.setPaintProperty('route-hover-point', 'circle-stroke-color', this.modeColors[mode]);
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

    const profile = this.routeProfile;
    const cumulative = profile?.cumulativeDistances ?? [];
    const elevations = profile?.elevations ?? [];

    this.routeSegments = coords.slice(0, -1).map((coord, index) => {
      const startDistanceKm = cumulative[index] ?? 0;
      const endDistanceKm = cumulative[index + 1] ?? startDistanceKm;
      const distanceKm = Math.max(0, endDistanceKm - startDistanceKm);
      return {
        start: coord,
        end: coords[index + 1],
        index,
        startDistanceKm,
        endDistanceKm,
        distanceKm,
        startElevation: elevations[index],
        endElevation: elevations[index + 1]
      };
    });

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

  updateStats(route) {
    if (!this.routeStats) return;
    if (!route || !route.geometry?.coordinates || route.geometry.coordinates.length < 2) {
      this.routeStats.innerHTML = '';
      this.routeStats.classList.remove('has-stats');
      return;
    }

    const metrics = this.latestMetrics ?? this.calculateRouteMetrics(route);
    const distanceLabel = this.formatDistance(metrics.distanceKm);
    const ascent = Math.max(0, Math.round(metrics.ascent));
    const descent = Math.max(0, Math.round(metrics.descent));

    const stats = [
      { key: 'ascent', label: 'Total ascent', value: `${ascent} m` },
      { key: 'descent', label: 'Total descent', value: `${descent} m` },
      { key: 'distance', label: 'Total distance', value: `${distanceLabel} km` }
    ];

    const listItems = stats
      .map(({ key, label, value }) => {
        const icon = SUMMARY_ICONS[key] ?? '';
        const iconMarkup = icon ? `${icon}` : '';
        return `
        <li
          class="summary-item ${key}"
          aria-label="${label} ${value}"
          title="${label}"
        >
          ${iconMarkup}
          <span aria-hidden="true">${value}</span>
        </li>
      `.trim();
      })
      .join('');

    this.routeStats.innerHTML = `
      <span class="sr-only">
        Distance: ${distanceLabel} km. Ascent: ${ascent} m. Descent: ${descent} m.
      </span>
      <ul class="route-stats-list">
        ${listItems}
      </ul>
    `;
    this.routeStats.classList.add('has-stats');
  }

  updateElevationProfile(coordinates) {
    if (!this.elevationChart) return;
    this.detachElevationChartEvents();
    this.lastElevationHoverDistance = null;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      this.elevationChart.innerHTML = '';
      this.elevationSamples = [];
      this.elevationChartContainer = null;
      this.highlightedElevationBar = null;
      return;
    }

    const samples = this.generateElevationSamples(coordinates);

    if (!samples.length) {
      this.elevationChart.innerHTML = '';
      this.elevationSamples = [];
      this.elevationChartContainer = null;
      this.highlightedElevationBar = null;
      this.lastElevationHoverDistance = null;
      return;
    }

    const metrics = this.latestMetrics ?? this.calculateRouteMetrics({ geometry: { coordinates } });
    const totalDistance = Number(metrics.distanceKm) || 0;
    const distanceLabel = this.formatDistance(totalDistance);
    const ascent = Math.max(0, Math.round(metrics.ascent ?? 0));
    const descent = Math.max(0, Math.round(metrics.descent ?? 0));

    this.elevationSamples = samples;

    const elevations = samples.map((sample) => sample.elevation);
    const maxElevation = Math.max(...elevations);
    const minElevation = Math.min(...elevations);
    const yAxis = this.computeAxisTicks(minElevation, maxElevation, ELEVATION_TICK_TARGET);
    const range = Math.max(1, yAxis.max - yAxis.min);

    const chartHtml = samples
      .map((sample) => {
        const clamped = Math.min(yAxis.max, Math.max(yAxis.min, sample.elevation));
        const height = Math.max(2, ((clamped - yAxis.min) / range) * 100);
        const title = Number.isFinite(sample.elevation) ? `${Math.round(sample.elevation)} m` : '';
        return `
          <div
            class="elevation-bar"
            data-start-km="${sample.startDistanceKm.toFixed(4)}"
            data-end-km="${sample.endDistanceKm.toFixed(4)}"
            data-mid-km="${((sample.startDistanceKm + sample.endDistanceKm) / 2).toFixed(4)}"
            style="height:${height.toFixed(2)}%"
            title="${title}"
          ></div>
        `;
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

    this.elevationChartContainer = this.elevationChart.querySelector('.elevation-chart-container');
    this.highlightedElevationBar = null;
    this.attachElevationChartEvents();
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
        if (!Number.isFinite(value)) return '';
        if (value === 0) return '0';
        if (value >= 100) return `${Math.round(value)}`;
        if (value >= 10) return `${parseFloat(value.toFixed(1))}`;
        if (value >= 1) return `${parseFloat(value.toFixed(1))}`;
        const precise = parseFloat(value.toFixed(2));
        return Number.isFinite(precise) ? `${precise}` : '';
      };

      const features = [];
      let lastLabelValue = -Infinity;

      const addMarker = (distanceKm, labelValue = distanceKm) => {
        const clamped = Math.min(distanceKm, totalDistance);
        const point = turfApi.along(line, clamped, { units: 'kilometers' });
        const label = formatMarkerLabel(labelValue);
        if (!label) return;
        const imageId = ensureDistanceMarkerImage(this.map, label);
        if (!imageId) return;
        features.push({
          type: 'Feature',
          properties: { label },
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
    this.hideRouteHover();
    this.routeGeojson = route;
    const coordinates = route?.geometry?.coordinates ?? [];
    this.routeProfile = this.buildRouteProfile(coordinates);
    this.latestMetrics = this.calculateRouteMetrics(route);
    this.map.getSource('route-line-source')?.setData(route ?? EMPTY_LINE_STRING);
    this.rebuildSegmentData();
    this.updateDistanceMarkers(route);
    this.updateStats(route);
    this.updateElevationProfile(coordinates);
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
