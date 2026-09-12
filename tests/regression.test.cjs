const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function appHarness() {
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      value: '', checked: false, textContent: '', hidden: false, disabled: false,
      style: {}, dataset: {}, attributes: {},
      classList: { toggle() {}, remove() {}, add() {} },
      setAttribute(k, v) { this.attributes[k] = v; },
      removeAttribute(k) { delete this.attributes[k]; if (k === 'href') delete this.href; },
      addEventListener() {},
    });
    return elements.get(selector);
  }
  const encodings = [], drawings = [], canvases = [], alerts = [];
  const context = vm.createContext({
    console: { error() {} }, DOMException, setTimeout, clearTimeout,
    alert: message => alerts.push(message),
    URL: { createObjectURL: blob => 'blob:' + blob.id, revokeObjectURL() {} },
    createImageBitmap: async file => ({ width: 2000, height: 1000, id: file.name, close() {} }),
    window: { ImageLimits: { validate: async () => {}, maxPixels: 32000000 } },
    document: {
      querySelector: element, addEventListener() {},
      createElement() {
        const canvas = { width: 0, height: 0,
          getContext: () => ({ drawImage: (...args) => drawings.push(args) }),
          toBlob(callback, mime, quality) { encodings.push({ callback, mime, quality, canvas }); },
        };
        canvases.push(canvas);
        return canvas;
      },
    },
  });
  const source = read('app.js').replace(/\}\)\(\);\s*$/, 'window.testAPI = { state, el, reset, loadFile, runProcess, scheduleProcess, onRatioChange, targetDimensions, sourceRect, drawCanvas, fitToBudget, fitAuto }; })();');
  vm.runInContext(source, context);
  const api = context.window.testAPI;
  Object.assign(api.state, { bitmap: { close() {} }, origW: 2000, origH: 1000, origBytes: 5000, file: { name: 'original.png' } });
  api.el.maxW.value = '2000'; api.el.maxH.value = '1000';
  api.el.scale.value = '100'; api.el.quality.value = '80';
  api.el.maxSize.value = '2'; api.el.maxSizeUnit.value = 'MB';
  api.el.ratioSelect.value = 'orig';
  element('input[name="format"]:checked').value = 'image/jpeg';
  return { api, context, encodings, drawings, canvases, alerts, element };
}

test('pixel limits preserve proportions and obey the total canvas budget', () => {
  const { api } = appHarness();
  api.el.maxW.value = '900';
  assert.deepEqual({ ...api.targetDimensions() }, { w: 900, h: 450 });
  Object.assign(api.state, { origW: 8000, origH: 4000 });
  api.el.maxW.value = '20000'; api.el.maxH.value = '20000';
  const { w, h } = api.targetDimensions();
  assert.ok(w * h <= 16000000 && w <= 8192 && h <= 8192);
  assert.ok(Math.abs(w / h - 2) < 0.001);
});

test('ratio preset crops the source centrally instead of stretching', () => {
  const { api, drawings } = appHarness();
  api.el.ratioSelect.value = '1:1';
  const size = api.targetDimensions();
  assert.deepEqual({ ...size }, { w: 1000, h: 1000 });
  api.drawCanvas(size.w, size.h);
  assert.deepEqual(drawings[0].slice(1), [500, 0, 1000, 1000, 0, 0, 1000, 1000]);
});

test('loading preserves original bytes, format and dimensions despite previous limits', async () => {
  const { api, context, encodings } = appHarness();
  context.createImageBitmap = async () => ({ width: 6000, height: 4000, close() {} });
  api.el.autoMode.checked = true;
  api.el.maxW.value = '1920'; api.el.maxH.value = '1080';
  api.el.scale.value = '50'; api.el.ratioSelect.value = '1:1';
  const file = { name: 'original.webp', type: 'image/webp', size: 5000000, id: 'original' };
  await api.loadFile(file);
  assert.equal(api.state.outBlob, file);
  assert.equal(encodings.length, 0);
  assert.equal(Number(api.el.maxW.value), 6000);
  assert.equal(Number(api.el.maxH.value), 4000);
  assert.equal(Number(api.el.scale.value), 100);
  assert.equal(api.el.ratioSelect.value, 'orig');
  assert.equal(api.el.newDims.textContent, '6000 × 4000 px');
  assert.equal(api.el.downloadBtn.download, 'original-bytelens.webp');
  api.reset();
});

test('switching a crop preset to Custom invalidates and recomputes the download', async () => {
  const { api, encodings } = appHarness();
  api.el.ratioSelect.value = '1:1';
  const first = api.runProcess();
  encodings.shift().callback({ size: 100, type: 'image/jpeg', id: 'square' });
  await first;
  api.el.ratioSelect.value = 'custom';
  api.onRatioChange();
  assert.equal(api.el.downloadBtn.href, undefined);
  assert.equal(api.el.downloadBtn.attributes['aria-disabled'], 'true');
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(encodings.length, 1);
  encodings.shift().callback({ size: 200, type: 'image/jpeg', id: 'original-ratio' });
  await tick();
  assert.equal(api.el.newDims.textContent, '2000 × 1000 px');
  assert.equal(api.el.downloadBtn.href, 'blob:original-ratio');
  api.reset();
});

test('reset during encoding cannot restore an old download', async () => {
  const { api, encodings, canvases } = appHarness();
  const pending = api.runProcess();
  api.reset();
  encodings.shift().callback({ size: 100, type: 'image/jpeg', id: 'old' });
  await pending;
  assert.equal(api.state.outBlob, null);
  assert.equal(api.el.downloadBtn.attributes['aria-disabled'], 'true');
  assert.equal(api.el.downloadBtn.href, undefined);
  assert.equal(canvases[0].width, 0);
});

test('changing controls invalidates an in-flight result immediately', async () => {
  const { api, encodings } = appHarness();
  const pending = api.runProcess();
  api.el.downloadBtn.href = 'blob:previous';
  api.scheduleProcess();
  assert.equal(api.el.downloadBtn.href, undefined);
  encodings.shift().callback({ size: 100, type: 'image/jpeg' });
  await pending;
  assert.equal(api.state.outBlob, null);
  api.reset();
});

test('latest selected file wins, with at most one decode in flight', async () => {
  const { api, context, encodings } = appHarness();
  const decodes = [];
  context.createImageBitmap = file => new Promise(resolve => decodes.push({ file, resolve }));
  const first = api.loadFile({ name: 'first.png', type: 'image/png', size: 1000 });
  await tick();
  const second = api.loadFile({ name: 'second.png', type: 'image/png', size: 2000 });
  await tick();
  assert.equal(decodes.length, 1);
  let closed = false;
  decodes[0].resolve({ width: 10, height: 10, close() { closed = true; } });
  await tick();
  assert.equal(closed, true);
  assert.equal(decodes.length, 2);
  decodes[1].resolve({ width: 20, height: 10, close() {} });
  await Promise.all([first, second]);
  assert.equal(encodings.length, 0);
  assert.equal(api.state.file.name, 'second.png');
  assert.equal(api.el.downloadBtn.download, 'second-bytelens.png');
  api.reset();
});

test('reset while decoding closes the decoded bitmap and keeps the UI empty', async () => {
  const { api, context, encodings } = appHarness();
  let finish;
  context.createImageBitmap = () => new Promise(resolve => { finish = resolve; });
  const loading = api.loadFile({ name: 'image.png', type: 'image/png', size: 100 });
  await tick();
  api.reset();
  let closed = false;
  finish({ width: 10, height: 10, close() { closed = true; } });
  await loading;
  assert.ok(closed);
  assert.equal(api.state.bitmap, null);
  assert.equal(encodings.length, 0);
});

test('automatic fitting keeps canvas pixels across quality attempts and releases buffers', async () => {
  const { api, encodings, canvases } = appHarness();
  let done = false;
  const fitting = api.fitAuto(1000, 500, 'image/jpeg', 10000).then(result => { done = true; return result; });
  let attempts = 0;
  while (!done) {
    while (encodings.length) {
      const { callback, quality, canvas } = encodings.shift();
      assert.ok(canvas.width > 0 && canvas.height > 0);
      attempts++;
      callback({ size: Math.ceil(canvas.width * canvas.height * (0.1 + quality)), type: 'image/jpeg' });
    }
    await tick();
  }
  const result = await fitting;
  assert.ok(result.blob.size <= 10000);
  assert.ok(result.w < 1000 && result.h < 500 && attempts > 11);
  assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
});

test('unsupported encoder fallback cannot create a mislabeled download', async () => {
  const { api, encodings } = appHarness();
  const pending = api.runProcess();
  encodings.shift().callback({ size: 100, type: 'image/png' });
  await pending;
  assert.equal(api.state.outBlob, null);
});

function png(width, height) {
  const b = Buffer.alloc(24);
  b.writeUInt32BE(0x89504e47); b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12);
  b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20);
  return new Blob([b], { type: 'image/png' });
}

test('header guard accepts PNG/JPEG/WebP and rejects oversized or malformed inputs', async () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(read('image-limits.js'), context);
  const { validate } = context.window.ImageLimits;
  await validate(png(4000, 3000));
  await assert.rejects(validate(png(10000, 10000)), /safe dimensions/);
  await assert.rejects(validate(png(0, 100)), /safe dimensions/);
  await assert.rejects(validate(png(40000, 1)), /safe dimensions/);
  await assert.rejects(validate({ size: 65 * 1024 * 1024 }), /64 MiB/);
  await assert.rejects(validate(new Blob(['broken'], { type: 'image/png' })), /header/);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 8, 8, 0, 100, 0, 200, 1]);
  await validate(new Blob([jpeg], { type: 'image/jpeg' }));
  for (const kind of ['VP8X', 'VP8 ', 'VP8L']) {
    const b = Buffer.alloc(30);
    b.write('RIFF'); b.writeUInt32LE(22, 4); b.write('WEBP', 8);
    b.write(kind, 12); b.writeUInt32LE(10, 16);
    if (kind === 'VP8X') { b[24] = 199; b[27] = 99; }
    if (kind === 'VP8 ') { b[23] = 0x9d; b[24] = 1; b[25] = 0x2a; b.writeUInt16LE(200, 26); b.writeUInt16LE(100, 28); }
    if (kind === 'VP8L') { b[20] = 0x2f; b.writeUInt32LE(199 | (99 << 14), 21); }
    await validate(new Blob([b], { type: 'image/webp' }));
  }
});

function workerHarness() {
  const listeners = {}, deleted = [], writes = [], opened = [];
  const cached = new Map();
  const context = vm.createContext({
    URL, Response, fetch: async () => new Response('ok'),
    self: { location: { origin: 'https://example.test' }, clients: { claim() {} },
      skipWaiting() {}, addEventListener: (type, callback) => { listeners[type] = callback; } },
    caches: {
      keys: async () => ['bytelens-v1', 'bytelens-v2', 'privapdf-v1'],
      delete: async key => { deleted.push(key); },
      open: async name => { opened.push(name); return {
        put: async (key, response) => { writes.push(key); cached.set(key, response); },
        match: async key => cached.get(key),
      }; },
    },
  });
  vm.runInContext(read('sw.js'), context);
  return { context, listeners, deleted, writes, opened, cached };
}

test('service worker activation preserves other applications caches', async () => {
  const { listeners, deleted } = workerHarness();
  let pending;
  listeners.activate({ waitUntil: promise => { pending = promise; } });
  await pending;
  assert.deepEqual(deleted, ['bytelens-v1']);
});

test('service worker scopes offline reads and never caches HTTP errors', async () => {
  const { context, listeners, writes, opened, cached } = workerHarness();
  const request = { method: 'GET', mode: 'navigate', url: 'https://example.test/bytelens/' };
  const waits = [];
  let response;
  const event = { request, respondWith: promise => { response = promise; }, waitUntil: p => waits.push(p) };
  context.fetch = async () => new Response('error', { status: 500 });
  listeners.fetch(event);
  assert.equal((await response).status, 500);
  assert.equal(writes.length, 0);
  cached.set('./index.html', new Response('offline shell'));
  context.fetch = async () => { throw new Error('offline'); };
  listeners.fetch(event);
  assert.equal(await (await response).text(), 'offline shell');
  assert.ok(opened.every(name => name === 'bytelens-v2'));
  context.fetch = async () => new Response('fresh');
  listeners.fetch(event);
  assert.equal(await (await response).text(), 'fresh');
  await Promise.all(waits);
  assert.deepEqual(writes, [request]);
});
