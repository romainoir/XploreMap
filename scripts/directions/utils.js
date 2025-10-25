import { SEGMENT_COLOR_PALETTE } from './constants.js';

export function createMarkerCanvas(baseSize = 52) {
  const ratio = 2;
  const canvas = document.createElement('canvas');
  canvas.width = baseSize * ratio;
  canvas.height = baseSize * ratio;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, baseSize, baseSize);
  return { canvas, ctx, ratio, size: baseSize };
}

export function finalizeMarkerImage(base) {
  if (!base) {
    return null;
  }

  const { canvas, ctx, ratio } = base;
  const { width, height } = canvas;
  if (!width || !height) {
    return null;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  return { image: imageData, pixelRatio: ratio };
}

export function adjustHexColor(hex, ratio = 0) {
  if (typeof hex !== 'string' || !/^#([0-9a-f]{6})$/i.test(hex)) {
    return hex;
  }

  const normalized = hex.slice(1);
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const clampedRatio = Math.max(-1, Math.min(1, Number(ratio) || 0));

  const transform = (channel) => {
    if (clampedRatio >= 0) {
      return Math.round(channel + (255 - channel) * clampedRatio);
    }
    return Math.round(channel * (1 + clampedRatio));
  };

  const toHex = (value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');

  const nextR = toHex(transform(r));
  const nextG = toHex(transform(g));
  const nextB = toHex(transform(b));
  return `#${nextR}${nextG}${nextB}`;
}

export function parseHexColor(hex) {
  if (typeof hex !== 'string') {
    return null;
  }
  const match = hex.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    return null;
  }
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

export function blendHexColors(colorA, colorB, weight = 0.5) {
  const parsedA = parseHexColor(colorA);
  const parsedB = parseHexColor(colorB);
  if (!parsedA && !parsedB) {
    return null;
  }
  if (!parsedA) {
    return colorB;
  }
  if (!parsedB) {
    return colorA;
  }
  const clamped = Math.max(0, Math.min(1, Number.isFinite(weight) ? Number(weight) : 0.5));
  const mix = (index) => Math.round(parsedA[index] + (parsedB[index] - parsedA[index]) * clamped);
  const toHex = (value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
  return `#${toHex(mix(0))}${toHex(mix(1))}${toHex(mix(2))}`;
}

export function getSegmentPaletteColor(index) {
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }
  if (!Array.isArray(SEGMENT_COLOR_PALETTE) || !SEGMENT_COLOR_PALETTE.length) {
    return null;
  }
  return SEGMENT_COLOR_PALETTE[index % SEGMENT_COLOR_PALETTE.length];
}

export const toLngLat = (coord) => new maplibregl.LngLat(coord[0], coord[1]);

export const createWaypointFeature = (coords, index, total, extraProperties = {}) => {
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
      title,
      ...extraProperties
    },
    geometry: {
      type: 'Point',
      coordinates: coords
    }
  };
};
