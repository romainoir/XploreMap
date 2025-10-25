export const EMPTY_COLLECTION = {
  type: 'FeatureCollection',
  features: []
};

export const MODE_COLORS = {
  'foot-hiking': '#f6a662',
  'cycling-regular': '#8fd3a5',
  'driving-car': '#f19595',
  'manual-draw': '#c3a3e0'
};

export const HOVER_PIXEL_TOLERANCE = 12;
export const COORD_EPSILON = 1e-6;
export const WAYPOINT_MATCH_TOLERANCE_METERS = 30;
export const MAX_ELEVATION_POINTS = 180;
export const MAX_DISTANCE_MARKERS = 60;
export const ELEVATION_TICK_TARGET = 5;
export const DISTANCE_TICK_TARGET = 6;
export const ROUTE_CUT_EPSILON_KM = 0.02;
export const ROUTE_CLICK_PIXEL_TOLERANCE = 18;

export const SEGMENT_COLOR_PALETTE = [
  '#8ecae6',
  '#f6bd60',
  '#bde0fe',
  '#c1fba4',
  '#f4a7bb',
  '#d0bdf4',
  '#ffd6a5',
  '#a3c4f3'
];

export const ASCENT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 18a1 1 0 0 1-.7-1.7l6.3-6.3a1 1 0 0 1 1.4 0l3.3 3.3 4.9-6.7H17a1 1 0 0 1 0-2h5a1 1 0 0 1 1 1v5a1 1 0 0 1-2 0V7.41l-5.6 7.6a1 1 0 0 1-1.5.12l-3.3-3.3-5.6 5.6a1 1 0 0 1-.7.27Z"/></svg>';
export const DESCENT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 6a1 1 0 0 1 .7 1.7l-6.3 6.3a1 1 0 0 1-1.4 0l-3.3-3.3-4.9 6.7H7a1 1 0 0 1 0 2H2a1 1 0 0 1-1-1v-5a1 1 0 0 1 2 0v3.59l5.6-7.6a1 1 0 0 1 1.5-.12l3.3 3.3 5.6-5.6a1 1 0 0 1 .7-.27Z"/></svg>';

export const SUMMARY_ICONS = {
  ascent: ASCENT_ICON,
  descent: DESCENT_ICON
};

export const BIVOUAC_ELEVATION_ICON =
  '<img src="bivouac.png" alt="Bivouac" class="bivouac-elevation-icon" loading="lazy" decoding="async" />';

export const DISTANCE_MARKER_PREFIX = 'distance-marker-';
export const DEFAULT_DISTANCE_MARKER_COLOR = '#f6bd60';

export const SEGMENT_MARKER_SOURCE_ID = 'segment-markers';
export const SEGMENT_MARKER_LAYER_ID = 'segment-markers';
export const SEGMENT_MARKER_COLORS = {
  start: '#4f9d69',
  bivouac: '#6c91bf',
  end: '#e07a5f'
};
export const START_MARKER_ICON_ID = 'segment-marker-start';
export const BIVOUAC_MARKER_ICON_ID = 'segment-marker-bivouac';
export const END_MARKER_ICON_ID = 'segment-marker-end';
export const SEGMENT_MARKER_ICONS = {
  start: START_MARKER_ICON_ID,
  bivouac: BIVOUAC_MARKER_ICON_ID,
  end: END_MARKER_ICON_ID
};

export const BIVOUAC_MARKER_IMAGE_URL = 'bivouac.png';

export const HIKER_MARKER_ICON_ID = 'route-hiker-icon';
export const HIKER_MARKER_LAYER_ID = 'route-hiker';
export const HIKER_MARKER_SOURCE_ID = 'route-hiker-source';
export const HIKER_MARKER_IMAGE_URL = 'randonneur.png';

export const turfApi = typeof turf !== 'undefined' ? turf : null;
