const ICON_BASE_PATH = './data/icons_Xmap/';
const ICON_SPECS = Object.freeze({
  cabin: { path: `${ICON_BASE_PATH}cabin.png`, pixelRatio: 2 },
  camera: { path: `${ICON_BASE_PATH}camera.png`, pixelRatio: 2 },
  parking: { path: `${ICON_BASE_PATH}parking.png`, pixelRatio: 2 },
  peak_minor: { path: `${ICON_BASE_PATH}peak_minor.png`, pixelRatio: 2 },
  peak_principal: { path: `${ICON_BASE_PATH}peak_principal.png`, pixelRatio: 2 },
  saddle: { path: `${ICON_BASE_PATH}saddle.png`, pixelRatio: 2 },
  signpost: { path: `${ICON_BASE_PATH}signpost.png`, pixelRatio: 2 },
  viewpoint: { path: `${ICON_BASE_PATH}viewpoint.png`, pixelRatio: 2 },
  water: { path: `${ICON_BASE_PATH}water.png`, pixelRatio: 2 }
});

const metadataCache = new Map();
const metadataPromises = new Map();
const mapImagePromises = new WeakMap();

function normalizePoiIconKey(key) {
  if (typeof key !== 'string') {
    return '';
  }
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function resolveIconUrl(path) {
  if (typeof path !== 'string' || !path) {
    return '';
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (typeof window !== 'undefined' && window.location) {
    try {
      return new URL(path, window.location.href).toString();
    } catch (error) {
      console.warn('Failed to resolve POI icon URL', path, error);
    }
  }
  return path;
}

export function getPoiIconImageId(iconKey) {
  const normalized = normalizePoiIconKey(iconKey);
  return normalized ? `xmap-poi-${normalized}` : '';
}

export async function getPoiIconMetadata(iconKey) {
  const normalized = normalizePoiIconKey(iconKey);
  if (!normalized) {
    return null;
  }
  if (metadataCache.has(normalized)) {
    return metadataCache.get(normalized);
  }
  if (metadataPromises.has(normalized)) {
    return metadataPromises.get(normalized);
  }
  const spec = ICON_SPECS[normalized];
  if (!spec) {
    metadataCache.set(normalized, null);
    return null;
  }
  const url = resolveIconUrl(spec.path);
  if (typeof Image === 'undefined') {
    const fallback = { url, width: spec.width ?? null, height: spec.height ?? null, pixelRatio: spec.pixelRatio ?? 1 };
    metadataCache.set(normalized, fallback);
    return fallback;
  }
  const promise = new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.loading = 'eager';
    image.onload = () => {
      const metadata = {
        url,
        width: Number.isFinite(image.naturalWidth) && image.naturalWidth > 0 ? image.naturalWidth : spec.width ?? null,
        height: Number.isFinite(image.naturalHeight) && image.naturalHeight > 0 ? image.naturalHeight : spec.height ?? null,
        pixelRatio: spec.pixelRatio ?? 1
      };
      metadataCache.set(normalized, metadata);
      metadataPromises.delete(normalized);
      resolve(metadata);
    };
    image.onerror = () => {
      console.warn('Failed to load POI icon asset', iconKey);
      metadataCache.set(normalized, null);
      metadataPromises.delete(normalized);
      resolve(null);
    };
    image.src = url;
  });
  metadataPromises.set(normalized, promise);
  return promise;
}

export function ensurePoiIconImages(map, iconKeys = []) {
  if (!map || typeof map.loadImage !== 'function' || typeof map.addImage !== 'function') {
    return Promise.resolve();
  }
  const keys = Array.isArray(iconKeys) && iconKeys.length
    ? iconKeys
    : Object.keys(ICON_SPECS);
  const normalizedKeys = Array.from(new Set(keys
    .map((key) => normalizePoiIconKey(key))
    .filter((key) => key && ICON_SPECS[key])));
  if (!normalizedKeys.length) {
    return Promise.resolve();
  }
  let promisesById = mapImagePromises.get(map);
  if (!promisesById) {
    promisesById = new Map();
    mapImagePromises.set(map, promisesById);
  }
  const tasks = normalizedKeys.map((key) => {
    const imageId = getPoiIconImageId(key);
    if (!imageId) {
      return Promise.resolve(null);
    }
    if (map.hasImage(imageId)) {
      return Promise.resolve(imageId);
    }
    if (promisesById.has(imageId)) {
      return promisesById.get(imageId);
    }
    const spec = ICON_SPECS[key];
    if (!spec) {
      return Promise.resolve(null);
    }
    const url = resolveIconUrl(spec.path);
    const promise = new Promise((resolve) => {
      map.loadImage(url, (error, image) => {
        if (error || !image) {
          console.warn('Failed to load POI icon image', key, error);
          promisesById.delete(imageId);
          resolve(null);
          return;
        }
        try {
          if (!map.hasImage(imageId)) {
            map.addImage(imageId, image, { pixelRatio: spec.pixelRatio ?? 1 });
          }
        } catch (addError) {
          console.warn('Failed to register POI icon image', key, addError);
        }
        resolve(imageId);
      });
    });
    promisesById.set(imageId, promise);
    return promise;
  });
  return Promise.all(tasks).then(() => undefined);
}
