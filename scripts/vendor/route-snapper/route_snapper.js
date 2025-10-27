import { GeoJsonPathFinder } from '../../geojson-pathfinder.js';

function createFacade(pathFinder) {
  const source = pathFinder || new GeoJsonPathFinder({ type: 'FeatureCollection', features: [] });
  return {
    findNearestPoint(coord) {
      if (!source || typeof source.findNearestPoint !== 'function') {
        return null;
      }
      return source.findNearestPoint(coord);
    },
    findNearestNode(coord) {
      if (!source || typeof source.findNearestNode !== 'function') {
        return null;
      }
      return source.findNearestNode(coord);
    },
    getCandidateNodesForSnap(coord, toleranceMeters, options) {
      if (!source || typeof source.getCandidateNodesForSnap !== 'function') {
        return [];
      }
      return source.getCandidateNodesForSnap(coord, toleranceMeters, options);
    },
    buildPath(startKey, endKey, mode) {
      if (!source || typeof source.buildPath !== 'function') {
        return null;
      }
      return source.buildPath(startKey, endKey, mode);
    },
    getAllNodes() {
      if (!source || typeof source.getAllNodes !== 'function') {
        return [];
      }
      return source.getAllNodes();
    },
    dispose() {
      if (source && typeof source.dispose === 'function') {
        source.dispose();
      }
    }
  };
}

export async function init() {
  return true;
}

export function createPathFinder(geojson, options = {}) {
  const { fallbackPathFinderOptions = {} } = options;
  const pathFinder = new GeoJsonPathFinder(geojson, fallbackPathFinderOptions);
  const facade = createFacade(pathFinder);
  return facade;
}

export class RouteSnapperFacade {
  static fromGeoJson(geojson, options = {}) {
    const { fallbackPathFinderOptions = {} } = options;
    const pathFinder = new GeoJsonPathFinder(geojson, fallbackPathFinderOptions);
    return createFacade(pathFinder);
  }
}

export default async function defaultInit() {
  return init();
}
