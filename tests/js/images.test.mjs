/**
 * Tests for js/images.js: fitSize arithmetic and prepareImage with a fake decoder and canvas.
 *
 * Responsibility: protect the photo downscaling contract without a browser (gjs has no canvas, Blob or
 * createImageBitmap), so the decoder and canvas are injected fakes that record how they were called.
 */
import { test, assert } from './harness.mjs';
import { MAX_PHOTOS, MAX_SIDE, JPEG_QUALITY, MAX_FILE_BYTES, fitSize, prepareImage } from '../../js/images.js';

/** Builds a fake canvas that records draws and encodes through toDataURL or convertToBlob. */
function fakeCanvasFactory({ blobBytes = null } = {}) {
  const log = { size: null, draws: [], fills: [], encoded: null };
  const makeCanvas = (width, height) => {
    log.size = { width, height };
    const canvas = {
      getContext: kind => {
        assert.equal(kind, '2d');
        return {
          fillStyle: '',
          fillRect: (...args) => log.fills.push(args),
          drawImage: (...args) => log.draws.push(args.slice(1)),
        };
      },
    };
    if (blobBytes) {
      canvas.convertToBlob = async options => {
        log.encoded = options;
        return { arrayBuffer: async () => new Uint8Array(blobBytes).buffer };
      };
    } else {
      canvas.toDataURL = (type, quality) => {
        log.encoded = { type, quality };
        return 'data:image/jpeg;base64,FAKE';
      };
    }
    return canvas;
  };
  return { makeCanvas, log };
}

/** Builds a fake decoder returning a bitmap of the given size; records its arguments and whether it was closed. */
function fakeBitmap(width, height) {
  const state = { closed: false, args: null };
  const createBitmap = async (file, options) => {
    state.args = { file, options };
    return { width, height, close: () => { state.closed = true; } };
  };
  return { createBitmap, state };
}

const PHOTO = { name: 'test.jpg', type: 'image/jpeg', size: 1000 };

test('constants match the contract', () => {
  assert.equal(MAX_PHOTOS, 8);
  assert.equal(MAX_SIDE, 1600);
  assert.equal(JPEG_QUALITY, 0.82);
  assert.equal(MAX_FILE_BYTES, 30 * 1024 * 1024);
});

test('fitSize scales a landscape photo down by its width', () => {
  assert.deepEqual(fitSize(4000, 3000), { width: 1600, height: 1200 });
});

test('fitSize scales a portrait photo down by its height', () => {
  assert.deepEqual(fitSize(3000, 4000), { width: 1200, height: 1600 });
});

test('fitSize never upscales a small photo', () => {
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitSize(1600, 1600), { width: 1600, height: 1600 });
});

test('fitSize honours a custom maximum', () => {
  assert.deepEqual(fitSize(1000, 500, 100), { width: 100, height: 50 });
});

test('fitSize keeps both sides at 1 or more for extreme ratios', () => {
  assert.deepEqual(fitSize(10000, 1), { width: 1600, height: 1 });
  assert.deepEqual(fitSize(1, 10000), { width: 1, height: 1600 });
});

test('fitSize rounds to integers', () => {
  const { width, height } = fitSize(3333, 2222);
  assert.equal(width, 1600);
  assert.equal(height, Math.round(2222 * 1600 / 3333));
  assert.ok(Number.isInteger(height));
});

test('prepareImage downscales, paints white, draws and returns the JPEG data URL (toDataURL canvas)', async () => {
  const { createBitmap, state } = fakeBitmap(4000, 3000);
  const { makeCanvas, log } = fakeCanvasFactory();
  const result = await prepareImage(PHOTO, { createBitmap, makeCanvas });
  assert.deepEqual(result, { dataUrl: 'data:image/jpeg;base64,FAKE', width: 1600, height: 1200 });
  assert.deepEqual(log.size, { width: 1600, height: 1200 });
  assert.deepEqual(log.draws, [[0, 0, 1600, 1200]]);
  assert.deepEqual(log.fills, [[0, 0, 1600, 1200]]);
  assert.deepEqual(log.encoded, { type: 'image/jpeg', quality: JPEG_QUALITY });
  assert.deepEqual(state.args.options, { imageOrientation: 'from-image' });
  assert.equal(state.args.file, PHOTO);
});

test('prepareImage releases the bitmap after drawing', async () => {
  const { createBitmap, state } = fakeBitmap(100, 100);
  await prepareImage(PHOTO, { createBitmap, makeCanvas: fakeCanvasFactory().makeCanvas });
  assert.ok(state.closed);
});

test('prepareImage releases the bitmap even when drawing fails', async () => {
  const { createBitmap, state } = fakeBitmap(100, 100);
  const makeCanvas = () => { throw new Error('no canvas'); };
  await assert.rejects(prepareImage(PHOTO, { createBitmap, makeCanvas }), /no canvas/);
  assert.ok(state.closed);
});

test('prepareImage encodes a convertToBlob canvas as base64 for every length of padding', async () => {
  // "Man" -> TWFu (no padding), "Ma" -> TWE=, "M" -> TQ==
  const cases = [[[77, 97, 110], 'TWFu'], [[77, 97], 'TWE='], [[77], 'TQ=='], [[], '']];
  for (const [bytes, expected] of cases) {
    const { createBitmap } = fakeBitmap(10, 10);
    const { makeCanvas, log } = fakeCanvasFactory({ blobBytes: bytes });
    const { dataUrl } = await prepareImage(PHOTO, { createBitmap, makeCanvas, quality: 0.5 });
    assert.equal(dataUrl, `data:image/jpeg;base64,${expected}`);
    assert.deepEqual(log.encoded, { type: 'image/jpeg', quality: 0.5 });
  }
});

test('prepareImage uses a custom maxSide and does not enlarge small photos', async () => {
  const big = fakeBitmap(1000, 500);
  const small = fakeBitmap(50, 40);
  const bigResult = await prepareImage(PHOTO, { createBitmap: big.createBitmap, makeCanvas: fakeCanvasFactory().makeCanvas, maxSide: 200 });
  const smallResult = await prepareImage(PHOTO, { createBitmap: small.createBitmap, makeCanvas: fakeCanvasFactory().makeCanvas });
  assert.equal(bigResult.width, 200);
  assert.equal(bigResult.height, 100);
  assert.equal(smallResult.width, 50);
  assert.equal(smallResult.height, 40);
});

test('prepareImage rejects a file that is not an image, naming it', async () => {
  const { createBitmap } = fakeBitmap(1, 1);
  await assert.rejects(prepareImage({ name: 'notes.pdf', type: 'application/pdf', size: 10 }, { createBitmap }), /^notes\.pdf is not a photo\.$/);
  await assert.rejects(prepareImage({ name: 'x', size: 10 }, { createBitmap }), /x is not a photo\./);
});

test('prepareImage rejects a file over the size limit', async () => {
  const { createBitmap, state } = fakeBitmap(1, 1);
  const huge = { name: 'huge.png', type: 'image/png', size: MAX_FILE_BYTES + 1 };
  await assert.rejects(prepareImage(huge, { createBitmap }), /^huge\.png is too large\.$/);
  assert.equal(state.args, null);
});

test('prepareImage turns a decoder failure into a message for the student', async () => {
  const createBitmap = async () => { throw new Error('InvalidStateError'); };
  await assert.rejects(prepareImage(PHOTO, { createBitmap, makeCanvas: fakeCanvasFactory().makeCanvas }), /test\.jpg could not be opened as a photo/);
});
