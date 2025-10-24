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
const MAX_ELEVATION_POINTS = 180;
const MAX_DISTANCE_MARKERS = 60;
const turfApi = typeof turf !== 'undefined' ? turf : null;

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
      elevationChart
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
    return Math.abs(a[0] - b[0]) <= COORD_EPSILON && Math.abs(a[1] - b[1]) <= COORD_EPSILON;
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
      <div class="distance">Distance: <span>${distanceLabel}</span> km</div>
      <div class="elevation">Ascent: <span>${ascent}</span> m</div>
      <div class="elevation">Descent: <span>${descent}</span> m</div>
    `;
  }

  updateElevationProfile(coordinates) {
    if (!this.elevationChart) return;
    if (!Array.isArray(coordinates) || !coordinates.length) {
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

    const sampledElevations = this.downsampleElevations(elevations);
    const maxElevation = Math.max(...elevations);
    const minElevation = Math.min(...elevations);
    const range = Math.max(1, maxElevation - minElevation);

    const chartHtml = sampledElevations
      .map((value) => {
        const height = Math.max(2, ((value - minElevation) / range) * 100);
        return `<div class="elevation-bar" style="height:${height.toFixed(2)}%" title="${Math.round(value)} m"></div>`;
      })
      .join('');

    this.elevationChart.innerHTML = `
      <div class='elevation-chart-container'>${chartHtml}</div>
      <div class='elevation-labels'>
        <span>${Math.round(maxElevation)}m</span>
        <span>${Math.round(minElevation)}m</span>
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
