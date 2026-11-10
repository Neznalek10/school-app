/**
 * Photo preparation: shrinks a photo picked by the student to a JPEG data URL small enough to send to an AI.
 *
 * Responsibility: `fitSize` is the pure size calculation, `prepareImage` decodes a file (phone orientation
 * applied), draws it on a canvas and returns the JPEG as a base64 data URL. Photos are never stored; the
 * caller keeps the data URLs in memory only until the request is sent.
 *
 * Fits in: js/views/testcheck.js calls prepareImage for every picked photo and passes the data URLs to
 * js/ai.js imageMessages. Imports nothing. The browser pieces (createImageBitmap, canvas) are injectable so
 * the logic runs under gjs, which has neither.
 *
 * Invariants: the longest side never exceeds the maximum, small photos are never enlarged, sizes are integers >= 1.
 */
import { bytesToBase64 } from './text.js';

/** The most photos one check accepts. */
export const MAX_PHOTOS = 8;

/** Longest side of a prepared photo in pixels: enough to read handwriting, small enough to upload fast. */
export const MAX_SIDE = 1600;

/** JPEG quality from 0 to 1. */
export const JPEG_QUALITY = 0.82;

/** Largest file accepted before decoding (a phone photo is a few MB; this stops accidental huge files). */
export const MAX_FILE_BYTES = 30 * 1024 * 1024;

/** Background painted under the photo, because JPEG has no transparency. */
const BACKGROUND_COLOR = '#ffffff';
const JPEG_TYPE = 'image/jpeg';

/**
 * Scales a size down so its longest side fits `maxSide`, keeping the aspect ratio.
 *
 * @param {number} width Source width in pixels (positive).
 * @param {number} height Source height in pixels (positive).
 * @param {number} [maxSide=MAX_SIDE] Longest allowed side in pixels.
 * @returns {{ width: number, height: number }} Integers >= 1; equal to the input (rounded) when it already fits.
 * @example
 * fitSize(4000, 3000); // { width: 1600, height: 1200 }
 */
export function fitSize(width, height, maxSide = MAX_SIDE) {
  const longest = Math.max(width, height);
  // Never upscale: a photo that already fits keeps its size.
  const scale = longest > maxSide ? maxSide / longest : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Creates the drawing surface: an OffscreenCanvas when the browser has one, else a canvas element.
 *
 * @param {number} width Pixels.
 * @param {number} height Pixels.
 * @returns {object} A canvas with getContext('2d') and convertToBlob or toDataURL.
 */
function defaultCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Reads the finished canvas as a JPEG data URL.
 *
 * @param {object} canvas Canvas with convertToBlob (OffscreenCanvas) or toDataURL (element).
 * @param {number} quality JPEG quality 0..1.
 * @returns {Promise<string>} `data:image/jpeg;base64,...`
 */
async function canvasToDataUrl(canvas, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    const blob = await canvas.convertToBlob({ type: JPEG_TYPE, quality });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return `data:${JPEG_TYPE};base64,${bytesToBase64(bytes)}`;
  }
  return canvas.toDataURL(JPEG_TYPE, quality);
}

/**
 * Downscales a photo file to a JPEG data URL.
 *
 * @param {Blob} file The picked file (needs type, size and optionally name).
 * @param {object} [options]
 * @param {number} [options.maxSide=MAX_SIDE] Longest side in pixels.
 * @param {number} [options.quality=JPEG_QUALITY] JPEG quality 0..1.
 * @param {Function} [options.createBitmap=globalThis.createImageBitmap] Decoder; called as createBitmap(file, { imageOrientation: 'from-image' }).
 * @param {Function} [options.makeCanvas] `(width, height) => canvas`; defaults to OffscreenCanvas or a canvas element.
 * @returns {Promise<{ dataUrl: string, width: number, height: number }>} The JPEG and its pixel size.
 * @throws {Error} '<name> is not a photo.' for a non-image type, '<name> is too large.' over MAX_FILE_BYTES,
 *   or a message asking to pick another photo when the file cannot be decoded.
 * @example
 * const { dataUrl } = await prepareImage(input.files[0]);
 */
export async function prepareImage(file, {
  maxSide = MAX_SIDE,
  quality = JPEG_QUALITY,
  createBitmap = globalThis.createImageBitmap,
  makeCanvas = defaultCanvas,
} = {}) {
  const name = file?.name || 'This file';
  if (!String(file?.type || '').startsWith('image/')) throw new Error(`${name} is not a photo.`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`${name} is too large.`);
  let bitmap;
  try {
    // 'from-image' applies the EXIF rotation so a phone photo is upright.
    bitmap = await createBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`${name} could not be opened as a photo. Pick another one.`);
  }
  try {
    const { width, height } = fitSize(bitmap.width, bitmap.height, maxSide);
    const canvas = makeCanvas(width, height);
    const context = canvas.getContext('2d');
    // JPEG has no transparency: paint white first so a transparent PNG does not turn black.
    context.fillStyle = BACKGROUND_COLOR;
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    return { dataUrl: await canvasToDataUrl(canvas, quality), width, height };
  } finally {
    // Free the decoded pixels right away; phone photos are large.
    bitmap.close?.();
  }
}
