const DEFAULT_MODULE_URL = new URL(
  './vendor/route-snapper/route_snapper.js',
  import.meta.url
).href;
const DEFAULT_WASM_URL = new URL(
  './vendor/route-snapper/route_snapper_bg.wasm',
  import.meta.url
).href;

let routeSnapperModulePromise = null;

function getInitializationAttempts(wasmUrl) {
  const attempts = [];
  if (wasmUrl != null) {
    const normalized = typeof wasmUrl === 'string'
      ? wasmUrl
      : (typeof wasmUrl.href === 'string' ? wasmUrl.href : String(wasmUrl));
    const sharedOptions = { module_or_path: normalized, wasmUrl: normalized };
    attempts.push([sharedOptions]);
    attempts.push([{ module_or_path: normalized }]);
    attempts.push([{ wasmUrl: normalized }]);
    attempts.push([normalized]);
  }
  attempts.push([]);
  attempts.push([{}]);
  return attempts;
}

async function tryInitialize(fn, context, wasmUrl) {
  const attempts = getInitializationAttempts(wasmUrl);
  let lastError = null;

  for (const args of attempts) {
    try {
      const result = fn.apply(context, args);
      if (result && typeof result.then === 'function') {
        await result;
      }
      return true;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return false;
}

async function initializeModule(module, { wasmUrl = DEFAULT_WASM_URL } = {}) {
  if (!module || typeof module !== 'object') {
    return module;
  }

  const candidates = [
    module.init,
    module.default,
    module.initialize
  ].filter((candidate) => typeof candidate === 'function');

  for (const candidate of candidates) {
    try {
      const initialized = await tryInitialize(candidate, module, wasmUrl);
      if (initialized) {
        return module;
      }
    } catch (error) {
      console.warn('[RouteSnapperLoader] RouteSnapper init function failed', error);
    }
  }

  return module;
}

async function importRouteSnapper({ moduleUrl = DEFAULT_MODULE_URL, wasmUrl = DEFAULT_WASM_URL } = {}) {
  if (routeSnapperModulePromise) {
    return routeSnapperModulePromise;
  }

  routeSnapperModulePromise = (async () => {
    if (typeof WebAssembly === 'undefined') {
      return null;
    }

    try {
      const module = await import(/* @vite-ignore */ moduleUrl);
      return await initializeModule(module, { wasmUrl });
    } catch (error) {
      console.warn('[RouteSnapperLoader] Unable to load module', error);
      return null;
    }
  })();

  return routeSnapperModulePromise;
}

function selectFunction(instance, candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      return candidate;
    }
  }
  return null;
}

function wrapRouteSnapperInstance(instance) {
  if (!instance || typeof instance !== 'object') {
    return null;
  }

  if (
    typeof instance.findNearestPoint === 'function'
    && typeof instance.getCandidateNodesForSnap === 'function'
    && typeof instance.buildPath === 'function'
  ) {
    return instance;
  }

  const findNearestPoint = selectFunction(instance, [
    instance.findNearestPoint,
    instance.find_nearest_point,
    instance.nearestPoint,
    instance.nearest_point,
    instance.snapPoint,
    instance.snap_point
  ]);

  const getCandidateNodesForSnap = selectFunction(instance, [
    instance.getCandidateNodesForSnap,
    instance.get_candidate_nodes_for_snap,
    instance.candidateNodesForSnap,
    instance.candidate_nodes_for_snap,
    instance.candidateNodes,
    instance.candidate_nodes
  ]);

  const buildPath = selectFunction(instance, [
    instance.buildPath,
    instance.build_path,
    instance.pathBetween,
    instance.path_between,
    instance.routeBetween,
    instance.route_between
  ]);

  const getAllNodes = selectFunction(instance, [
    instance.getAllNodes,
    instance.get_all_nodes,
    instance.nodes,
    instance.get_nodes
  ]);

  if (!findNearestPoint || !getCandidateNodesForSnap || !buildPath) {
    return null;
  }

  const dispose = selectFunction(instance, [instance.dispose, instance.free, instance.release]);

  return {
    findNearestPoint: (...args) => findNearestPoint.apply(instance, args),
    findNearestNode: typeof instance.findNearestNode === 'function'
      ? (...args) => instance.findNearestNode.apply(instance, args)
      : (coord) => {
        const result = findNearestPoint.apply(instance, [coord]);
        return result && result.node ? result.node : null;
      },
    getCandidateNodesForSnap: (...args) => getCandidateNodesForSnap.apply(instance, args) ?? [],
    buildPath: (...args) => buildPath.apply(instance, args) ?? null,
    getAllNodes: (...args) => (getAllNodes ? getAllNodes.apply(instance, args) ?? [] : []),
    dispose: () => {
      if (dispose) {
        dispose.call(instance);
      }
    }
  };
}

async function createFromFactories(module, geojson, options) {
  if (!module) {
    return null;
  }

  const factories = [
    module.createPathFinder,
    module.create_path_finder,
    module.RouteSnapper?.createPathFinder,
    module.RouteSnapper?.create_path_finder,
    module.RouteSnapperFacade?.fromGeoJson,
    module.RouteSnapperFacade?.from_geojson
  ];

  for (const factory of factories) {
    if (typeof factory !== 'function') {
      continue;
    }
    try {
      const result = await factory.call(module.RouteSnapper ?? module, geojson, options);
      const wrapped = wrapRouteSnapperInstance(result);
      if (wrapped) {
        return wrapped;
      }
    } catch (error) {
      console.warn('[RouteSnapperLoader] RouteSnapper factory failed', error);
    }
  }

  if (module.RouteSnapper && typeof module.RouteSnapper.fromGeoJson === 'function') {
    try {
      const result = module.RouteSnapper.fromGeoJson(geojson, options);
      const wrapped = wrapRouteSnapperInstance(result);
      if (wrapped) {
        return wrapped;
      }
    } catch (error) {
      console.warn('[RouteSnapperLoader] RouteSnapper.fromGeoJson failed', error);
    }
  }

  if (module.RouteSnapper && typeof module.RouteSnapper.from_geojson === 'function') {
    try {
      const result = module.RouteSnapper.from_geojson(geojson, options);
      const wrapped = wrapRouteSnapperInstance(result);
      if (wrapped) {
        return wrapped;
      }
    } catch (error) {
      console.warn('[RouteSnapperLoader] RouteSnapper.from_geojson failed', error);
    }
  }

  return null;
}

export async function createRouteSnapperPathFinder(geojson, options = {}) {
  const module = await importRouteSnapper(options);
  if (!module) {
    return null;
  }

  const pathFinder = await createFromFactories(module, geojson, options);
  if (pathFinder) {
    return pathFinder;
  }

  console.warn('[RouteSnapperLoader] No compatible RouteSnapper factory found');
  return null;
}

export function resetRouteSnapperModuleForTests() {
  routeSnapperModulePromise = null;
}

export const ROUTE_SNAPPER_DEFAULTS = Object.freeze({
  moduleUrl: DEFAULT_MODULE_URL,
  wasmUrl: DEFAULT_WASM_URL
});
