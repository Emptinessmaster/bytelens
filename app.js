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

  const MAX_ALLOWED = { w: 20000, h: 20000 }; // guardrail anti-crash canvas

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

  // Calcola le dimensioni target: larghezza e altezza vengono limitate in modo
  // INDIPENDENTE, senza vincolo di proporzioni. Impostando maxW/maxH diversi
  // dal rapporto originale, l'immagine viene deformata di conseguenza
  // (es. 1920x1080 con maxW 900 -> 900x1080: solo la larghezza si riduce).
  function targetDimensions() {
    const maxW = Math.min(num(el.maxW, state.origW, 1), MAX_ALLOWED.w);
    const maxH = Math.min(num(el.maxH, state.origH, 1), MAX_ALLOWED.h);
    const scale = (parseInt(el.scale.value, 10) || 100) / 100;

    // scala uniforme (percentuale), poi limite indipendente per ciascun lato
    const w = Math.min(state.origW * scale, maxW);
    const h = Math.min(state.origH * scale, maxH);
    return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  }

  // Disegna il bitmap su canvas alle dimensioni date
  function drawCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(state.bitmap, 0, 0, w, h);
    return canvas;
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), mime, quality);
    });
  }

  // ---- Elaborazione principale (debounced) ----
  let debounceTimer = null;
  function scheduleProcess() {
    if (!state.bitmap) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runProcess, 140);
  }

  async function runProcess() {
    if (!state.bitmap) return;
    if (state.busy) { state.queued = true; return; }
    state.busy = true;
    setStatus(T('status_processing', 'Elaborazione…'), 'neutral');

    try {
      const mime = currentFormat();
      const isLossy = (mime === 'image/jpeg' || mime === 'image/webp');
      const { w, h } = targetDimensions();
      const canvas = drawCanvas(w, h);

      const auto = el.autoMode.checked;
      const unitFactor = el.maxSizeUnit.value === 'KB' ? 1024 : 1024 * 1024;
      const maxBytes = num(el.maxSize, Infinity) * unitFactor;

      let blob, usedQuality;

      if (auto && isLossy && isFinite(maxBytes)) {
        const res = await fitToBudget(canvas, mime, maxBytes);
        blob = res.blob;
        usedQuality = res.quality;
        // riflette la qualità trovata sullo slider
        el.quality.value = Math.round(usedQuality * 100);
        el.qualityVal.textContent = Math.round(usedQuality * 100) + '%';
      } else {
        usedQuality = (parseInt(el.quality.value, 10) || 80) / 100;
        blob = await canvasToBlob(canvas, mime, isLossy ? usedQuality : undefined);
      }

      if (!blob) throw new Error('Formato non supportato dal browser.');

      applyResult(blob, w, h, mime, maxBytes, auto, isLossy);
    } catch (err) {
      console.error(err);
      setStatus(T('status_error', 'Errore di elaborazione'), 'over');
    } finally {
      state.busy = false;
      if (state.queued) { state.queued = false; runProcess(); }
    }
  }

  // Ricerca binaria della qualità per rientrare nel budget di byte
  async function fitToBudget(canvas, mime, maxBytes) {
    let lo = 0.1, hi = 1.0, best = null, bestQ = lo;

    // se già sotto budget a qualità massima, usa quella
    let blobHi = await canvasToBlob(canvas, mime, hi);
    if (blobHi && blobHi.size <= maxBytes) return { blob: blobHi, quality: hi };

    best = blobHi; bestQ = hi;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      const blob = await canvasToBlob(canvas, mime, mid);
      if (!blob) break;
      if (blob.size <= maxBytes) {
        best = blob; bestQ = mid; lo = mid; // possiamo alzare la qualità
      } else {
        hi = mid; // troppo pesante, abbassa
      }
    }
    // preferisci l'ultima versione sotto budget se esiste
    const under = await canvasToBlob(canvas, mime, bestQ);
    if (under && under.size <= maxBytes) return { blob: under, quality: bestQ };
    return { blob: best, quality: bestQ };
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
    try {
      const bitmap = await createImageBitmap(file);
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

      // default sensati: se l'immagine è più piccola dei limiti, non ingrandire
      runProcess();
    } catch (err) {
      console.error(err);
      alert(T('alert_read', 'Impossibile leggere l\'immagine. Prova con un altro file.'));
    }
  }

  function reset() {
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
    el.downloadLabel.textContent = 'Scarica immagine';
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
    [el.maxSize, el.maxW, el.maxH].forEach((i) => i.addEventListener('input', scheduleProcess));
    el.maxSizeUnit.dataset.prev = el.maxSizeUnit.value;
    el.maxSizeUnit.addEventListener('change', onUnitChange);
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
      if (state.bitmap) scheduleProcess();
    });
  }

  // ---- Avvio ----
  document.addEventListener('DOMContentLoaded', () => {
    bind();
    syncAutoUI();
  });
})();
