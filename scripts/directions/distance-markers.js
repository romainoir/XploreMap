import { DEFAULT_DISTANCE_MARKER_COLOR, DISTANCE_MARKER_PREFIX } from './constants.js';
import { adjustHexColor } from './utils.js';

export function createDistanceMarkerImage(label, {
  fill = DEFAULT_DISTANCE_MARKER_COLOR
} = {}) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  const deviceRatio = 2;
  const fontSize = 13;
  const paddingX = 8;
  const paddingY = 6;
  const borderRadius = 8;
  const font = `600 ${fontSize * deviceRatio}px 'Noto Sans', 'Noto Sans Bold', sans-serif`;
  context.font = font;
  const metrics = context.measureText(label);
  const textWidth = metrics.width;

  const baseWidth = Math.ceil(textWidth / deviceRatio + paddingX * 2);
  const baseHeight = Math.ceil(fontSize + paddingY * 2);

  canvas.width = baseWidth * deviceRatio;
  canvas.height = baseHeight * deviceRatio;

  context.scale(deviceRatio, deviceRatio);
  context.font = `600 ${fontSize}px 'Noto Sans', 'Noto Sans Bold', sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const drawRoundedRect = (x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  };

  drawRoundedRect(0, 0, baseWidth, baseHeight, borderRadius);
  const strokeColor = adjustHexColor(fill, -0.2);

  context.save();
  context.shadowColor = 'rgba(17, 34, 48, 0.3)';
  context.shadowBlur = 8;
  context.shadowOffsetY = 2;
  context.fillStyle = fill;
  context.fill();
  context.restore();

  context.lineWidth = 1.5;
  context.strokeStyle = strokeColor;
  context.stroke();

  context.fillStyle = '#ffffff';
  context.fillText(label, baseWidth / 2, baseHeight / 2);

  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) {
    return null;
  }

  const imageData = context.getImageData(0, 0, width, height);
  return {
    image: {
      width,
      height,
      data: imageData.data
    },
    pixelRatio: deviceRatio
  };
}

export function buildDistanceMarkerId(label, fill) {
  const normalizedLabel = String(label)
    .toLowerCase()
    .replace(/[^0-9a-z]+/gi, '-');
  const normalizedColor = typeof fill === 'string' && fill
    ? fill.toLowerCase().replace(/[^0-9a-f]+/g, '')
    : 'default';
  return `${DISTANCE_MARKER_PREFIX}${normalizedLabel}-${normalizedColor}`;
}

export function ensureDistanceMarkerImage(map, label, { fill } = {}) {
  const color = typeof fill === 'string' && fill ? fill : DEFAULT_DISTANCE_MARKER_COLOR;
  const imageId = buildDistanceMarkerId(label, color);
  if (map.hasImage(imageId)) {
    return imageId;
  }

  const rendered = createDistanceMarkerImage(label, { fill: color });
  if (!rendered) {
    return null;
  }

  map.addImage(imageId, rendered.image, { pixelRatio: rendered.pixelRatio });
  return imageId;
}
