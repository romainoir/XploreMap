import {
  OVERTURE_BUILDINGS_ATTRIBUTION,
  OVERTURE_BUILDING_BASE_EXPR,
  OVERTURE_BUILDING_COLOR_EXPR,
  OVERTURE_BUILDING_HEIGHT_EXPR,
  OVERTURE_BUILDINGS_PM_URL
} from './constants.js';

export const pmtilesProtocol = new pmtiles.Protocol({ metadata: true, errorOnMissingTile: true });

if (typeof maplibregl !== 'undefined' && typeof maplibregl.addProtocol === 'function') {
  maplibregl.addProtocol('pmtiles', (params, abortController) => pmtilesProtocol.tile(params, abortController));
}

const overtureBuildingsTileset = new pmtiles.PMTiles(OVERTURE_BUILDINGS_PM_URL);
pmtilesProtocol.add(overtureBuildingsTileset);

const OVERTURE_LAYER_ID_CANDIDATES = ['building', 'buildings', 'overture_buildings'];
let overtureVectorLayerIdPromise = null;
let loggedOvertureMetadataError = false;

function pickBestLayerId(layers = []) {
  if (!Array.isArray(layers)) return null;
  for (const preferred of OVERTURE_LAYER_ID_CANDIDATES) {
    const match = layers.find((layer) => typeof layer.id === 'string' && layer.id.toLowerCase() === preferred);
    if (match) return match.id;
  }
  const any = layers.find((layer) => typeof layer.id === 'string' && /build/i.test(layer.id));
  if (any && any.id) return any.id;
  if (layers[0] && layers[0].id) return layers[0].id;
  return null;
}

async function getOvertureVectorLayerId() {
  if (!overtureVectorLayerIdPromise) {
    overtureVectorLayerIdPromise = overtureBuildingsTileset
      .getMetadata()
      .then((metadata) => {
        const layers = metadata && Array.isArray(metadata.vector_layers) ? metadata.vector_layers : [];
        const fromMetadata = pickBestLayerId(layers);
        if (fromMetadata) return fromMetadata;
        return OVERTURE_LAYER_ID_CANDIDATES[0];
      })
      .catch((error) => {
        if (!loggedOvertureMetadataError) {
          console.warn('Unable to read Overture buildings metadata', error);
          loggedOvertureMetadataError = true;
        }
        return OVERTURE_LAYER_ID_CANDIDATES[0];
      });
  }
  return overtureVectorLayerIdPromise;
}

export async function ensureOvertureBuildings(map, beforeLayerId) {
  if (!map || typeof map.addSource !== 'function') return;

  const layerId = await getOvertureVectorLayerId();
  if (!layerId) return;

  const sourceId = 'overture-buildings';
  const flatLayerId = 'overture-buildings-flat';
  const extrusionLayerId = 'overture-buildings-3d';

  try {
    if (map.getLayer(flatLayerId)) map.removeLayer(flatLayerId);
    if (map.getLayer(extrusionLayerId)) map.removeLayer(extrusionLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    try { map.setLayoutProperty('building', 'visibility', 'none'); } catch (_) {}
    try { map.setLayoutProperty('building-3d', 'visibility', 'none'); } catch (_) {}

    map.addSource(sourceId, {
      type: 'vector',
      url: `pmtiles://${OVERTURE_BUILDINGS_PM_URL}`,
      maxzoom: 15,
      attribution: OVERTURE_BUILDINGS_ATTRIBUTION
    });

    const before = beforeLayerId || undefined;

    map.addLayer({
      id: flatLayerId,
      type: 'fill',
      source: sourceId,
      'source-layer': layerId,
      minzoom: 12,
      paint: {
        'fill-color': OVERTURE_BUILDING_COLOR_EXPR,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0.0, 12.4, 0.7, 13.2, 0.82, 14.2, 0.9],
        'fill-outline-color': 'rgba(121, 109, 93, 0.35)'
      }
    }, before);

    map.addLayer({
      id: extrusionLayerId,
      type: 'fill-extrusion',
      source: sourceId,
      'source-layer': layerId,
      minzoom: 14,
      paint: {
        'fill-extrusion-color': OVERTURE_BUILDING_COLOR_EXPR,
        'fill-extrusion-opacity': 0.96,
        'fill-extrusion-height': OVERTURE_BUILDING_HEIGHT_EXPR,
        'fill-extrusion-base': OVERTURE_BUILDING_BASE_EXPR
      }
    }, before);
  } catch (error) {
    console.warn('Unable to add Overture buildings layer', error);
  }
}
