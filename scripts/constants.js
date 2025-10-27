export const RELIEF_OPACITY = 0.40;
export const BASE_STYLE_RELIEF_OPACITY = 0.45;
export const COLOR_RELIEF_COLOR_RAMP = [
  'interpolate', ['linear'], ['elevation'],
  0, '#254a38',
  400, '#2f6b4a',
  800, '#5b8f5f',
  1200, '#7fa36e',
  1600, '#9eb17b',
  2000, '#b9bf8a',
  2300, '#c9c38f',
  2600, '#b6ab93',
  2900, '#9e978e',
  3200, '#8a8a8a',
  3500, '#aeb6c0',
  3800, '#cfd6de',
  4100, '#f2f3f5'
];
export const S2_OPACITY = 0.50;
export const VERSATILES_LOCAL_JSON = './osm_liberty.json';
export const S2C_URL = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg';
export const TILE_FADE_DURATION = 800;
export const S2_FADE_DURATION = 700;
export const MAPTERHORN_TILE_URL = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
export const MAPTERHORN_ATTRIBUTION = '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>';
export const OVERTURE_BUILDINGS_PM_URL = 'https://data.source.coop/cholmes/overture/overture-buildings.pmtiles';
export const OVERTURE_BUILDINGS_ATTRIBUTION = '<a href="https://overturemaps.org/">© Overture Maps Foundation</a>';
export const OVERTURE_BUILDING_COLOR_EXPR = [
  'let', 'overture_building_type',
  ['downcase', ['to-string', ['coalesce',
    ['get', 'subclass'],
    ['get', 'class'],
    ['get', 'category'],
    ['get', 'primary_use'],
    ['get', 'type'],
    ''
  ]]],
  ['match', ['var', 'overture_building_type'],
    'residential', '#f1d5b8',
    'multi_family', '#f1d5b8',
    'single_family', '#f1d5b8',
    'apartments', '#f1d5b8',
    'condominium', '#f1d5b8',
    'dormitory', '#f1d5b8',
    'duplex', '#f1d5b8',
    'house', '#f1d5b8',
    'row_house', '#f1d5b8',
    'terrace', '#f1d5b8',
    'townhouse', '#f1d5b8',

    'commercial', '#f5c08a',
    'retail', '#f5c08a',
    'shopping_centre', '#f5c08a',
    'shop', '#f5c08a',
    'store', '#f5c08a',
    'supermarket', '#f5c08a',
    'market', '#f5c08a',
    'office', '#f5c08a',
    'restaurant', '#f5c08a',

    'industrial', '#c6bda9',
    'manufacturing', '#c6bda9',
    'plant', '#c6bda9',
    'factory', '#c6bda9',
    'logistics', '#c6bda9',
    'warehouse', '#c6bda9',
    'storage', '#c6bda9',

    'education', '#cfe3ff',
    'school', '#cfe3ff',
    'college', '#cfe3ff',
    'university', '#cfe3ff',
    'kindergarten', '#cfe3ff',

    'healthcare', '#f4a9a0',
    'hospital', '#f4a9a0',
    'medical', '#f4a9a0',
    'clinic', '#f4a9a0',
    'nursing_home', '#f4a9a0',

    'religious', '#d5c0f2',
    'church', '#d5c0f2',
    'temple', '#d5c0f2',
    'synagogue', '#d5c0f2',
    'mosque', '#d5c0f2',

    'civic', '#e1d1f3',
    'public', '#e1d1f3',
    'government', '#e1d1f3',
    'community', '#e1d1f3',
    'fire_station', '#e1d1f3',
    'police_station', '#e1d1f3',
    'courthouse', '#e1d1f3',

    'hospitality', '#f5d0b8',
    'hotel', '#f5d0b8',
    'motel', '#f5d0b8',
    'resort', '#f5d0b8',
    'lodging', '#f5d0b8',

    'recreation', '#d8e8d2',
    'entertainment', '#d8e8d2',
    'sports', '#d8e8d2',
    'stadium', '#d8e8d2',
    'arena', '#d8e8d2',
    'theatre', '#d8e8d2',
    'museum', '#d8e8d2',
    'library', '#d8e8d2',

    'transportation', '#d9e3ef',
    'station', '#d9e3ef',
    'terminal', '#d9e3ef',
    'hangar', '#d9e3ef',
    'garage', '#d9e3ef',
    'parking', '#d9e3ef',
    'depot', '#d9e3ef',

    'agriculture', '#e9ddb8',
    'barn', '#e9ddb8',
    'farm', '#e9ddb8',
    'greenhouse', '#e9ddb8',

    'military', '#f1c8c8',
    'defence', '#f1c8c8',

    'utility', '#d2d8e0',
    'infrastructure', '#d2d8e0',
    'power', '#d2d8e0',
    'energy', '#d2d8e0',

    '#d9d2c2'
  ]
];

export const OVERTURE_BUILDING_HEIGHT_EXPR = [
  'coalesce',
  ['get', 'height'],
  ['*', ['coalesce', ['get', 'num_floors'], ['get', 'levels'], 2], 3.3]
];

export const OVERTURE_BUILDING_BASE_EXPR = [
  'coalesce',
  ['get', 'ground_height'],
  ['get', 'base_height'],
  ['get', 'min_height'],
  0
];

export const SKY_SETTINGS = {
  'sky-color': '#bcd0e6',
  'sky-horizon-blend': 0.35,
  'horizon-color': '#e6effa',
  'horizon-fog-blend': 0.35,
  'fog-color': '#bcd0e6',
  'fog-ground-blend': 0.15
};

export const VIEW_MODES = Object.freeze({ THREED: '3d', TWOD: '2d' });
export const DEFAULT_3D_ORIENTATION = Object.freeze({ pitch: 60, bearing: -18.6 });

export const GPX_SOURCE_ID = 'imported-gpx';
export const GPX_LINE_LAYER_ID = 'imported-gpx-line';
export const GPX_POINT_LAYER_ID = 'imported-gpx-points';
