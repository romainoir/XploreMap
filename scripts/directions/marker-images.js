import {
  BIVOUAC_MARKER_ICON_ID,
  BIVOUAC_MARKER_IMAGE_URL,
  HIKER_MARKER_ICON_ID,
  HIKER_MARKER_IMAGE_URL,
  SEGMENT_MARKER_COLORS,
  START_MARKER_ICON_ID,
  END_MARKER_ICON_ID
} from './constants.js';
import { createMarkerCanvas, finalizeMarkerImage } from './utils.js';

let bivouacMarkerImage = null;
let bivouacMarkerImagePromise = null;
let hikerMarkerImagePromise = null;

export function createFlagMarkerImage(fillColor) {
  const base = createMarkerCanvas();
  if (!base) {
    return null;
  }

  const { ctx, size } = base;
  const poleX = size * 0.5;
  const poleTop = size * 0.16;
  const poleBottom = size * 0.88;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.beginPath();
  ctx.ellipse(poleX, poleBottom + size * 0.03, size * 0.2, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#27363f';
  ctx.lineWidth = size * 0.06;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(poleX, poleTop);
  ctx.lineTo(poleX, poleBottom);
  ctx.stroke();

  const flagWidth = size * 0.36;
  const flagHeight = size * 0.3;
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = 'rgba(17, 34, 48, 0.18)';
  ctx.lineWidth = size * 0.025;
  ctx.beginPath();
  ctx.moveTo(poleX, poleTop + size * 0.02);
  ctx.quadraticCurveTo(poleX + flagWidth, poleTop - size * 0.04, poleX + flagWidth, poleTop + flagHeight * 0.35);
  ctx.quadraticCurveTo(poleX + flagWidth, poleTop + flagHeight * 0.75, poleX, poleTop + flagHeight);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  return finalizeMarkerImage(base);
}

function loadImageAsset(url) {
  if (!url) {
    return Promise.reject(new Error('Missing image URL'));
  }

  if (typeof Image === 'undefined') {
    return Promise.reject(new Error('Image constructor is not available in this environment'));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image: ${url}`));
    image.src = url;
  });
}

export function getBivouacMarkerImage() {
  if (bivouacMarkerImage) {
    return Promise.resolve(bivouacMarkerImage);
  }

  if (!bivouacMarkerImagePromise) {
    bivouacMarkerImagePromise = loadImageAsset(BIVOUAC_MARKER_IMAGE_URL)
      .then((image) => {
        bivouacMarkerImage = image;
        return image;
      })
      .catch((error) => {
        bivouacMarkerImagePromise = null;
        throw error;
      });
  }

  return bivouacMarkerImagePromise;
}

export function ensureHikerMarkerImage(map) {
  if (!map || typeof map.hasImage !== 'function' || typeof map.addImage !== 'function') {
    return Promise.resolve();
  }

  if (map.hasImage(HIKER_MARKER_ICON_ID)) {
    return Promise.resolve();
  }

  if (!hikerMarkerImagePromise) {
    hikerMarkerImagePromise = loadImageAsset(HIKER_MARKER_IMAGE_URL)
      .then((image) => {
        if (image && !map.hasImage(HIKER_MARKER_ICON_ID)) {
          map.addImage(HIKER_MARKER_ICON_ID, image, { pixelRatio: 2 });
        }
      })
      .catch((error) => {
        hikerMarkerImagePromise = null;
        throw error;
      });
  }

  return hikerMarkerImagePromise;
}

export function ensureSegmentMarkerImages(map) {
  if (!map || typeof map.hasImage !== 'function' || typeof map.addImage !== 'function') {
    return;
  }

  if (!map.hasImage(START_MARKER_ICON_ID)) {
    const startIcon = createFlagMarkerImage(SEGMENT_MARKER_COLORS.start);
    if (startIcon) {
      map.addImage(START_MARKER_ICON_ID, startIcon.image, { pixelRatio: startIcon.pixelRatio });
    }
  }

  if (!map.hasImage(END_MARKER_ICON_ID)) {
    const endIcon = createFlagMarkerImage(SEGMENT_MARKER_COLORS.end);
    if (endIcon) {
      map.addImage(END_MARKER_ICON_ID, endIcon.image, { pixelRatio: endIcon.pixelRatio });
    }
  }

  if (!map.hasImage(BIVOUAC_MARKER_ICON_ID)) {
    getBivouacMarkerImage()
      .then((image) => {
        if (!image || !map || typeof map.hasImage !== 'function' || typeof map.addImage !== 'function') {
          return;
        }
        if (!map.hasImage(BIVOUAC_MARKER_ICON_ID)) {
          map.addImage(BIVOUAC_MARKER_ICON_ID, image);
        }
      })
      .catch((error) => {
        console.error('Failed to load bivouac marker image', error);
      });
  }
}
