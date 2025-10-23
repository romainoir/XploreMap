import { GPX_LINE_LAYER_ID, GPX_POINT_LAYER_ID, GPX_SOURCE_ID } from './constants.js';

function getTextContent(el, tagName) {
  if (!el) return null;
  const child = el.getElementsByTagName(tagName)[0];
  if (!child || !child.textContent) return null;
  const text = child.textContent.trim();
  return text.length ? text : null;
}

function parsePointElement(el, latAttr = 'lat', lonAttr = 'lon') {
  if (!el) return null;
  const lat = parseFloat(el.getAttribute(latAttr));
  const lon = parseFloat(el.getAttribute(lonAttr));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const coord = [lon, lat];
  const eleText = getTextContent(el, 'ele');
  const ele = eleText !== null ? parseFloat(eleText) : NaN;
  if (Number.isFinite(ele)) coord.push(ele);
  return coord;
}

export function parseGpxToGeoJson(gpxText) {
  if (!gpxText) return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(gpxText, 'application/xml');
  if (!doc || doc.getElementsByTagName('parsererror').length) {
    throw new Error('Invalid GPX document');
  }

  const features = [];

  const appendLineFeature = (coordinates, properties = {}) => {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties
    });
  };

  const appendMultiLineFeature = (segments, properties = {}) => {
    const validSegments = segments.filter(segment => Array.isArray(segment) && segment.length >= 2);
    if (!validSegments.length) return;
    if (validSegments.length === 1) {
      appendLineFeature(validSegments[0], properties);
      return;
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'MultiLineString', coordinates: validSegments },
      properties
    });
  };

  const appendPointFeature = (coord, properties = {}) => {
    if (!Array.isArray(coord) || coord.length < 2) return;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coord },
      properties
    });
  };

  const trackElements = Array.from(doc.getElementsByTagName('trk'));
  trackElements.forEach((trackEl, trackIndex) => {
    const trackName = getTextContent(trackEl, 'name') || `Track ${trackIndex + 1}`;
    const segments = Array.from(trackEl.getElementsByTagName('trkseg'));
    const segmentCoords = [];
    segments.forEach((segmentEl, segIndex) => {
      const points = Array.from(segmentEl.getElementsByTagName('trkpt'));
      const coords = points
        .map(pt => parsePointElement(pt))
        .filter(coord => Array.isArray(coord));
      if (coords.length >= 2) {
        segmentCoords.push(coords);
      } else if (coords.length === 1) {
        appendPointFeature(coords[0], { name: trackName, source: 'track', segment: segIndex + 1 });
      }
    });
    appendMultiLineFeature(segmentCoords, { name: trackName, source: 'track' });
  });

  const routeElements = Array.from(doc.getElementsByTagName('rte'));
  routeElements.forEach((routeEl, routeIndex) => {
    const routeName = getTextContent(routeEl, 'name') || `Route ${routeIndex + 1}`;
    const points = Array.from(routeEl.getElementsByTagName('rtept'));
    const coords = points
      .map(pt => parsePointElement(pt))
      .filter(coord => Array.isArray(coord));
    appendLineFeature(coords, { name: routeName, source: 'route' });
  });

  const waypointElements = Array.from(doc.getElementsByTagName('wpt'));
  waypointElements.forEach((wptEl, waypointIndex) => {
    const coord = parsePointElement(wptEl);
    if (!coord) return;
    const name = getTextContent(wptEl, 'name') || `Waypoint ${waypointIndex + 1}`;
    appendPointFeature(coord, { name, source: 'waypoint' });
  });

  return {
    type: 'FeatureCollection',
    features
  };
}

export function computeGeojsonBounds(geojson) {
  if (!geojson || geojson.type !== 'FeatureCollection') return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const extend = (coord) => {
    if (!Array.isArray(coord) || coord.length < 2) return;
    const [x, y] = coord;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  const walk = (coords) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      extend(coords);
      return;
    }
    coords.forEach(walk);
  };

  (geojson.features || []).forEach(feature => {
    if (!feature || !feature.geometry) return;
    walk(feature.geometry.coordinates);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return [[minX, minY], [maxX, maxY]];
}

export function ensureGpxLayers(map, data, beforeLayerId) {
  if (!map) return;
  const emptyCollection = { type: 'FeatureCollection', features: [] };
  const dataset = data && Array.isArray(data.features) ? data : emptyCollection;

  const existingSource = map.getSource(GPX_SOURCE_ID);
  if (existingSource) {
    existingSource.setData(dataset);
  } else if (typeof map.addSource === 'function') {
    map.addSource(GPX_SOURCE_ID, {
      type: 'geojson',
      data: dataset
    });
  }

  const before = beforeLayerId || undefined;

  if (!map.getLayer(GPX_LINE_LAYER_ID)) {
    map.addLayer({
      id: GPX_LINE_LAYER_ID,
      type: 'line',
      source: GPX_SOURCE_ID,
      filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#ff6b3a',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.4, 12, 3.6, 14, 5.2, 16, 7.5],
        'line-opacity': 0.9
      }
    }, before);
  } else if (before) {
    try { map.moveLayer(GPX_LINE_LAYER_ID, before); } catch (_) {}
  }

  if (!map.getLayer(GPX_POINT_LAYER_ID)) {
    map.addLayer({
      id: GPX_POINT_LAYER_ID,
      type: 'circle',
      source: GPX_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 12, 5.5, 16, 8],
        'circle-color': '#ffffff',
        'circle-opacity': 0.95,
        'circle-stroke-color': '#ff6b3a',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 12, 1.6, 16, 2.4]
      }
    }, before);
  } else if (before) {
    try { map.moveLayer(GPX_POINT_LAYER_ID, before); } catch (_) {}
  }
}

export function zoomToGeojson(map, geojson) {
  if (!map || !geojson) return;
  const bounds = computeGeojsonBounds(geojson);
  if (!bounds) return;
  const [[minX, minY], [maxX, maxY]] = bounds;
  if (minX === maxX && minY === maxY) {
    const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : 13;
    const targetZoom = Number.isFinite(currentZoom) ? Math.max(13, currentZoom) : 13;
    map.flyTo({ center: [minX, minY], zoom: targetZoom });
    return;
  }
  map.fitBounds(bounds, {
    padding: { top: 80, bottom: 80, left: 80, right: 80 },
    maxZoom: 15,
    duration: 1200
  });
}
