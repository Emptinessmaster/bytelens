/* =========================================================================
   ByteLens — logica di compressione/ridimensionamento (100% client-side)

   Pipeline:
     file -> ImageBitmap -> canvas (dimensioni target) -> toBlob(formato, qualità)
   Modalità automatica:
     1) ridimensiona per rientrare in maxW x maxH (mantiene proporzioni)
     2) ricerca binaria sulla qualità per rientrare nel peso massimo (MB)
   PNG è senza perdita: il peso massimo può non essere raggiungibile e viene
   segnalato all'utente.
   ========================================================================= */
'use strict';

(function () {
  const $ = (sel) => document.querySelector(sel);
  // Traduzione: usa i18n.js se presente, altrimenti il fallback italiano.
  const T = (key, fallback) => (window.I18N ? window.I18N.t(key) : fallback);

  // ---- Riferimenti DOM ----
  const el = {
    dropzone:    $('#dropzone'),
    fileInput:   $('#fileInput'),
    dropEmpty:   $('#dropEmpty'),
    previewHold: $('#previewHolder'),
    previewImg:  $('#previewImg'),
    formatBadge: $('#formatBadge'),

    controls:    $('#controls'),
    emptyNote:   $('#emptyNote'),
    resetBtn:    $('#resetBtn'),

    autoMode:    $('#autoMode'),
    maxSize:     $('#maxSize'),
    maxSizeUnit: $('#maxSizeUnit'),
    maxW:        $('#maxW'),
    maxH:        $('#maxH'),
    ratioSelect: $('#ratioSelect'),
    ratioLabel:  $('#ratioLabel'),
    quality:     $('#quality'),
    qualityVal:  $('#qualityVal'),
    qualityField:$('#qualityField'),
    qualityHint: $('#qualityHint'),
    scale:       $('#scale'),
    scaleVal:    $('#scaleVal'),
    formatHint:  $('#formatHint'),

    compareBar:  $('#compareBar'),
    origSize:    $('#origSize'),
    origDims:    $('#origDims'),
    newSize:     $('#newSize'),
    newDims:     $('#newDims'),
    savings:     $('#savings'),
    statusMsg:   $('#statusMsg'),

    downloadBtn: $('#downloadBtn'),
    downloadLabel: $('#downloadLabel'),
    themeToggle: $('#themeToggle'),
    year:        $('#year'),
  };

  // ---- Stato ----
  const state = {
    bitmap: null,       // ImageBitmap sorgente
    file: null,         // File originale
    origBytes: 0,
    origW: 0,
    origH: 0,
    outBlob: null,
    outUrl: null,
    busy: false,
    queued: false,
  };

  const MAX_ALLOWED = { w: 8192, h: 8192, pixels: 16000000 };
  let revision = 0;
  let loadSequence = 0;
  let decodeQueue = Promise.resolve();

  // ---- Utilità ----
  function fmtBytes(bytes) {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    const kb = bytes / 1024;
    if (kb < 1024) return (kb < 10 ? kb.toFixed(1) : Math.round(kb)) + ' KB';
    const mb = kb / 1024;
    return (mb < 10 ? mb.toFixed(2) : mb.toFixed(1)) + ' MB';
  }

  function currentFormat() {
    const r = document.querySelector('input[name="format"]:checked');
    return r ? r.value : 'image/jpeg';
  }

  function extFor(mime) {
    return { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' }[mime] || 'img';
  }

  function num(input, fallback, min) {
    let v = parseFloat(input.value);
    if (!isFinite(v) || v <= 0) v = fallback;
    if (min != null && v < min) v = min;
    return v;
  }

  // I limiti mantengono le proporzioni; un preset applica un ritaglio centrale.
  function sourceRect() {
    let w = state.origW, h = state.origH;
    const ratio = RATIOS.find((r) => r.key === el.ratioSelect?.value);
    if (ratio && ratio.w) {
      if (w / h > ratio.w / ratio.h) w = h * ratio.w / ratio.h;
      else h = w * ratio.h / ratio.w;
    }
    return { x: (state.origW - w) / 2, y: (state.origH - h) / 2, w, h };
  }

  function targetDimensions() {
    const maxW = Math.min(num(el.maxW, state.origW, 1), MAX_ALLOWED.w);
    const maxH = Math.min(num(el.maxH, state.origH, 1), MAX_ALLOWED.h);
    const scale = (parseInt(el.scale.value, 10) || 100) / 100;

    const source = sourceRect();
    const factor = Math.min(scale, maxW / source.w, maxH / source.h,
      Math.sqrt(MAX_ALLOWED.pixels / (source.w * source.h)));
    return { w: Math.max(1, Math.floor(source.w * factor)), h: Math.max(1, Math.floor(source.h * factor)) };
  }

  // Disegna il bitmap su canvas alle dimensioni date
  function drawCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const source = sourceRect();
    ctx.drawImage(state.bitmap, source.x, source.y, source.w, source.h, 0, 0, w, h);
    return canvas;
  }

  function canvasToBlob(canvas, mime, quality) {
    const ticket = revision;
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (ticket !== revision) reject(new DOMException('Cancelled', 'AbortError'));
        else if (!blob || blob.type !== mime) reject(new Error('Unsupported output format'));
        else resolve(blob);
      }, mime, quality);
    });
  }

  // ---- Elaborazione principale (debounced) ----
  let debounceTimer = null;
  function invalidateResult() {
    revision++;
    clearTimeout(debounceTimer);
    el.downloadBtn.setAttribute('aria-disabled', 'true');
    el.downloadBtn.removeAttribute('href');
  }

  function scheduleProcess() {
    if (!state.bitmap) return;
    invalidateResult();
    debounceTimer = setTimeout(runProcess, 140);
  }

  async function runProcess() {
    if (!state.bitmap) return;
    if (state.busy) { state.queued = true; return; }
    state.busy = true;
    const ticket = revision;
    setStatus(T('status_processing', 'Elaborazione…'), 'neutral');

    try {
      const mime = currentFormat();
      const isLossy = (mime === 'image/jpeg' || mime === 'image/webp');
      const base = targetDimensions();

      const auto = el.autoMode.checked;
      const unitFactor = el.maxSizeUnit.value === 'KB' ? 1024 : 1024 * 1024;
      const maxBytes = num(el.maxSize, Infinity) * unitFactor;

      let blob, usedQuality, outW = base.w, outH = base.h;

      if (auto && isLossy && isFinite(maxBytes)) {
        // Prima abbassa la qualità; se non basta, riduce anche la risoluzione
        // finché l'immagine rientra nel peso massimo impostato.
        const res = await fitAuto(base.w, base.h, mime, maxBytes);
        if (ticket !== revision) return;
        blob = res.blob; usedQuality = res.quality; outW = res.w; outH = res.h;
        el.quality.value = Math.round(usedQuality * 100);
        el.qualityVal.textContent = Math.round(usedQuality * 100) + '%';
      } else {
        const canvas = drawCanvas(outW, outH);
        usedQuality = (parseInt(el.quality.value, 10) || 80) / 100;
        try {
          blob = await canvasToBlob(canvas, mime, isLossy ? usedQuality : undefined);
        } finally { canvas.width = 0; canvas.height = 0; }
      }

      if (!blob) throw new Error('Formato non supportato dal browser.');
      if (ticket !== revision) return;

      applyResult(blob, outW, outH, mime, maxBytes, auto, isLossy);
    } catch (err) {
      if (ticket === revision && err.name !== 'AbortError') {
        console.error(err);
        setStatus(T('status_error', 'Errore di elaborazione'), 'over');
      }
    } finally {
      state.busy = false;
      if (state.queued) { state.queued = false; runProcess(); }
    }
  }

  // Ricerca binaria della qualità per rientrare nel budget di byte, a
  // risoluzione fissa. Se nemmeno la qualità minima rientra, restituisce il
  // file PIÙ PICCOLO ottenibile (qualità minima), non il più grande.
  async function fitToBudget(canvas, mime, maxBytes) {
    const qHi = await canvasToBlob(canvas, mime, 1.0);
    if (qHi && qHi.size <= maxBytes) return { blob: qHi, quality: 1.0 };

    let lo = 0.05, hi = 1.0, best = null, bestQ = null;
    for (let i = 0; i < 9; i++) {
      const mid = (lo + hi) / 2;
      const blob = await canvasToBlob(canvas, mime, mid);
      if (!blob) break;
      if (blob.size <= maxBytes) { best = blob; bestQ = mid; lo = mid; }
      else { hi = mid; }
    }
    if (best) return { blob: best, quality: bestQ };

    // impossibile a questa risoluzione: qualità minima = file più piccolo
    const qLo = await canvasToBlob(canvas, mime, 0.05);
    return { blob: qLo || qHi, quality: 0.05 };
  }

  // Ottimizzazione automatica completa: prova al livello di dimensioni scelto;
  // se il file resta sopra il peso massimo, riduce progressivamente la
  // risoluzione (mantenendo il rapporto delle dimensioni target) finché rientra.
  async function fitAuto(baseW, baseH, mime, maxBytes) {
    let w = baseW, h = baseH;
    let smallest = null, sQ = 0.05, sW = w, sH = h;
    for (let step = 0; step < 12; step++) {
      const canvas = drawCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      try {
        const res = await fitToBudget(canvas, mime, maxBytes);
        if (res.blob && res.blob.size <= maxBytes) {
          return { blob: res.blob, quality: res.quality, w: canvas.width, h: canvas.height };
        }
        if (res.blob && (!smallest || res.blob.size < smallest.size)) {
          smallest = res.blob; sQ = res.quality; sW = canvas.width; sH = canvas.height;
        }
      } finally { canvas.width = 0; canvas.height = 0; }
      if (w <= 32 || h <= 32) break;
      w *= 0.82; h *= 0.82;
    }
    return { blob: smallest, quality: sQ, w: sW, h: sH };
  }

  function applyResult(blob, w, h, mime, maxBytes, auto, isLossy) {
    // rilascia url precedente
    if (state.outUrl) URL.revokeObjectURL(state.outUrl);
    state.outBlob = blob;
    state.outUrl = URL.createObjectURL(blob);

    el.previewImg.src = state.outUrl;

    // confronto
    el.newSize.textContent = fmtBytes(blob.size);
    el.newDims.textContent = w + ' × ' + h + ' px';
    const saved = state.origBytes > 0 ? (1 - blob.size / state.origBytes) : 0;
    const savedPct = Math.round(saved * 100);
    el.savings.textContent = (savedPct >= 0 ? '−' : '+') + Math.abs(savedPct) + '%';

    // stato limite peso
    const overBudget = isFinite(maxBytes) && blob.size > maxBytes + 1;
    el.compareBar.classList.toggle('over', overBudget);

    if (overBudget) {
      if (!isLossy) {
        setStatus(T('status_png_over', 'PNG senza perdita: usa JPG/WebP per rientrare'), 'over');
      } else {
        setStatus(T('status_res_limit', 'Impossibile scendere oltre questa risoluzione'), 'over');
      }
    } else if (auto && isLossy) {
      setStatus(T('status_within', 'Rientra nei limiti ✓'), 'ok');
    } else {
      setStatus(T('status_ready', 'Pronta'), 'ok');
    }

    // badge formato
    el.formatBadge.hidden = false;
    el.formatBadge.textContent = extFor(mime).toUpperCase();

    // download
    const base = (state.file && state.file.name ? state.file.name.replace(/\.[^.]+$/, '') : 'immagine');
    el.downloadBtn.href = state.outUrl;
    el.downloadBtn.download = base + '-bytelens.' + extFor(mime);
    el.downloadBtn.setAttribute('aria-disabled', 'false');
    el.downloadLabel.textContent = T('download_prefix', 'Scarica') + ' ' + fmtBytes(blob.size);
  }

  function setStatus(msg, kind) {
    el.statusMsg.textContent = msg;
    el.statusMsg.style.color =
      kind === 'ok' ? 'var(--success)' :
      kind === 'over' ? 'var(--danger)' : 'var(--text-muted)';
  }

  // ---- Caricamento file ----
  async function loadFile(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      alert(T('alert_format', 'Formato non supportato. Usa JPG, PNG o WebP.'));
      return;
    }
    reset();
    const ticket = loadSequence;
    try {
      await window.ImageLimits.validate(file);
      if (ticket !== loadSequence) return;
      // Una sola decodifica alla volta, anche con selezioni ripetute rapidamente.
      const bitmap = await (decodeQueue = decodeQueue.catch(() => {}).then(() =>
        ticket === loadSequence ? createImageBitmap(file) : null));
      if (!bitmap) return;
      if (ticket !== loadSequence) { bitmap.close(); return; }
      if (bitmap.width * bitmap.height > window.ImageLimits.maxPixels) {
        bitmap.close();
        throw new RangeError('Image too large');
      }
      if (state.bitmap && state.bitmap.close) state.bitmap.close();
      state.bitmap = bitmap;
      state.file = file;
      state.origBytes = file.size;
      state.origW = bitmap.width;
      state.origH = bitmap.height;

      // UI: mostra anteprima, attiva controlli
      el.dropEmpty.hidden = true;
      el.previewHold.hidden = false;
      el.compareBar.hidden = false;
      el.controls.disabled = false;
      el.emptyNote.hidden = true;
      el.resetBtn.hidden = false;

      el.origSize.textContent = fmtBytes(file.size);
      el.origDims.textContent = bitmap.width + ' × ' + bitmap.height + ' px';

      // #1: i limiti in pixel partono dalle dimensioni dell'immagine originale
      // (una 2000×2000 non viene portata a 1920×1080).
      el.maxW.value = state.origW;
      el.maxH.value = state.origH;
      el.scale.value = 100; el.scaleVal.textContent = '100%';
      if (el.ratioSelect) el.ratioSelect.value = 'orig';
      const originalFormat = document.querySelector('input[name="format"][value="' + file.type + '"]');
      if (originalFormat) originalFormat.checked = true;

      // Il caricamento conserva il file originale; elabora solo dopo un cambio dei controlli.
      applyResult(file, bitmap.width, bitmap.height, file.type, Infinity, false,
        file.type !== 'image/png');
    } catch (err) {
      if (ticket !== loadSequence) return;
      console.error(err);
      alert(err.name === 'RangeError'
        ? T('alert_limits', 'Immagine troppo grande: massimo 64 MiB, 32 megapixel e 32768 pixel per lato.')
        : T('alert_read', 'Impossibile leggere l\'immagine. Prova con un altro file.'));
    }
  }

  function reset() {
    loadSequence++;
    invalidateResult();
    state.queued = false;
    if (state.bitmap && state.bitmap.close) state.bitmap.close();
    if (state.outUrl) URL.revokeObjectURL(state.outUrl);
    Object.assign(state, { bitmap: null, file: null, origBytes: 0, origW: 0, origH: 0, outBlob: null, outUrl: null });

    el.dropEmpty.hidden = false;
    el.previewHold.hidden = true;
    el.previewImg.removeAttribute('src');
    el.compareBar.hidden = true;
    el.compareBar.classList.remove('over');
    el.controls.disabled = true;
    el.emptyNote.hidden = false;
    el.resetBtn.hidden = true;
    el.formatBadge.hidden = true;
    el.fileInput.value = '';
    el.downloadBtn.setAttribute('aria-disabled', 'true');
    el.downloadBtn.removeAttribute('href');
    el.downloadLabel.textContent = T('download', 'Scarica immagine');
    setStatus('—', 'neutral');
  }

  // ---- Cambio unità di misura del peso (MB <-> KB) con conversione del valore ----
  function onUnitChange() {
    const prev = el.maxSizeUnit.dataset.prev || 'MB';
    const cur = el.maxSizeUnit.value;
    let v = parseFloat(el.maxSize.value);
    if (isFinite(v) && v > 0 && prev !== cur) {
      if (prev === 'MB' && cur === 'KB') v = Math.round(v * 1024);
      else if (prev === 'KB' && cur === 'MB') v = Math.round((v / 1024) * 1000) / 1000;
      el.maxSize.value = v;
    }
    if (cur === 'KB') { el.maxSize.step = '10'; el.maxSize.min = '1'; }
    else { el.maxSize.step = '0.1'; el.maxSize.min = '0.01'; }
    el.maxSizeUnit.dataset.prev = cur;
    scheduleProcess();
  }

  // ---- Proporzioni predefinite (menù a tendina) ----
  const RATIOS = [
    { key: 'custom' },
    { key: 'orig' },
    { key: '1:1',  w: 1,  h: 1 },
    { key: '4:3',  w: 4,  h: 3 },
    { key: '3:2',  w: 3,  h: 2 },
    { key: '16:9', w: 16, h: 9 },
    { key: '21:9', w: 21, h: 9 },
    { key: '3:4',  w: 3,  h: 4 },
    { key: '2:3',  w: 2,  h: 3 },
    { key: '9:16', w: 9,  h: 16 },
  ];
  const RATIO_TXT = {
    label:  { en: 'Aspect ratio', it: 'Proporzioni', es: 'Proporción', fr: 'Proportions', de: 'Seitenverhältnis', pt: 'Proporção', ru: 'Пропорции', zh: '比例', ja: '縦横比', ar: 'النسبة', hi: 'अनुपात', bn: 'অনুপাত', id: 'Rasio', tr: 'Oran', ur: 'تناسب' },
    orig:   { en: 'Original', it: 'Originale', es: 'Original', fr: 'Original', de: 'Original', pt: 'Original', ru: 'Оригинал', zh: '原始尺寸', ja: '元のサイズ', ar: 'الأصلية', hi: 'मूल', bn: 'মূল', id: 'Asli', tr: 'Orijinal', ur: 'اصل' },
    custom: { en: 'Custom', it: 'Personalizzato', es: 'Personalizado', fr: 'Personnalisé', de: 'Benutzerdefiniert', pt: 'Personalizado', ru: 'Свои', zh: '自定义', ja: 'カスタム', ar: 'مخصص', hi: 'कस्टम', bn: 'কাস্টম', id: 'Kustom', tr: 'Özel', ur: 'حسب ضرورت' },
  };
  function ratioLang() {
    return (window.I18N && RATIO_TXT.label[window.I18N.current]) ? window.I18N.current : 'en';
  }
  function ratioText(key) {
    const lang = ratioLang();
    if (key === 'custom') return RATIO_TXT.custom[lang];
    if (key === 'orig') return RATIO_TXT.orig[lang];
    return key;
  }
  function buildRatioOptions() {
    if (!el.ratioSelect) return;
    el.ratioSelect.innerHTML = '';
    RATIOS.forEach((r) => {
      const o = document.createElement('option');
      o.value = r.key;
      o.textContent = ratioText(r.key);
      el.ratioSelect.appendChild(o);
    });
    el.ratioSelect.value = 'orig';
    if (el.ratioLabel) el.ratioLabel.textContent = RATIO_TXT.label[ratioLang()];
  }
  function relabelRatios() {
    if (!el.ratioSelect) return;
    const cur = el.ratioSelect.value;
    Array.prototype.forEach.call(el.ratioSelect.options, (o) => { o.textContent = ratioText(o.value); });
    if (el.ratioLabel) el.ratioLabel.textContent = RATIO_TXT.label[ratioLang()];
    el.ratioSelect.value = cur;
  }
  function onRatioChange() {
    const key = el.ratioSelect.value;
    if (!state.bitmap) return;
    if (key === 'orig') {
      el.maxW.value = state.origW;
      el.maxH.value = state.origH;
    } else {
      const r = RATIOS.find((x) => x.key === key);
      if (r && r.w) {
        // riquadro più grande di quel rapporto che rientra nell'originale
        const s = Math.min(state.origW / r.w, state.origH / r.h);
        el.maxW.value = Math.max(1, Math.round(r.w * s));
        el.maxH.value = Math.max(1, Math.round(r.h * s));
      }
    }
    scheduleProcess();
  }

  // ---- Sync UI qualità/modalità ----
  function syncAutoUI() {
    const auto = el.autoMode.checked;
    // in auto la qualità è calcolata → slider informativo
    el.qualityField.classList.toggle('dim', auto);
    el.quality.disabled = auto;
    el.qualityHint.hidden = !auto;
  }

  // ---- Eventi ----
  function bind() {
    // dropzone click / keyboard
    el.dropzone.addEventListener('click', (e) => {
      // evita doppio trigger se si clicca il testo-link
      el.fileInput.click();
    });
    el.dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.fileInput.click(); }
    });
    el.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
    });

    // drag & drop
    ['dragenter', 'dragover'].forEach((ev) =>
      el.dropzone.addEventListener(ev, (e) => { e.preventDefault(); el.dropzone.classList.add('dragover'); })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      el.dropzone.addEventListener(ev, (e) => { e.preventDefault(); el.dropzone.classList.remove('dragover'); })
    );
    el.dropzone.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });
    // incolla dagli appunti
    window.addEventListener('paste', (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const it of items) {
        if (it.type && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) { loadFile(f); break; }
        }
      }
    });

    // controlli → riprocessa
    el.maxSize.addEventListener('input', scheduleProcess);
    // modifica manuale di larghezza/altezza → proporzione "Personalizzato"
    [el.maxW, el.maxH].forEach((i) => i.addEventListener('input', () => {
      if (el.ratioSelect) el.ratioSelect.value = 'custom';
      scheduleProcess();
    }));
    el.maxSizeUnit.dataset.prev = el.maxSizeUnit.value;
    el.maxSizeUnit.addEventListener('change', onUnitChange);
    if (el.ratioSelect) { buildRatioOptions(); el.ratioSelect.addEventListener('change', onRatioChange); }
    el.quality.addEventListener('input', () => { el.qualityVal.textContent = el.quality.value + '%'; scheduleProcess(); });
    el.scale.addEventListener('input', () => { el.scaleVal.textContent = el.scale.value + '%'; scheduleProcess(); });
    el.autoMode.addEventListener('change', () => { syncAutoUI(); scheduleProcess(); });
    document.querySelectorAll('input[name="format"]').forEach((r) =>
      r.addEventListener('change', scheduleProcess)
    );

    el.resetBtn.addEventListener('click', reset);

    // tema
    el.themeToggle.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme')
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('bytelens-theme', next); } catch (e) {}
    });

    el.year.textContent = new Date().getFullYear();

    // Al cambio lingua: se un'immagine è caricata, ri-elabora per aggiornare
    // le etichette dinamiche (stato, peso nel pulsante di download).
    window.addEventListener('i18n:change', () => {
      relabelRatios();
      if (state.bitmap) scheduleProcess();
    });
  }

  // ---- Avvio ----
  document.addEventListener('DOMContentLoaded', () => {
    bind();
    syncAutoUI();
  });
})();
