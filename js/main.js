/**
 * ASCII Look v01 — Application
 *
 * Wires the ascii.js engine to the DOM:
 *   • Upload section — image/video to colored ASCII canvas
 *   • Video scrub    — seek bar + time display
 *   • CSS filters    — contrast, saturation, hue shift post-processing
 *   • Nav            — scroll-state class
 */

'use strict';

// ── Colored ASCII renderer ─────────────────────────────────────
/**
 * Render a source image/video as colored ASCII onto a canvas.
 *
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} src
 * @param {HTMLCanvasElement} outCanvas
 * @param {number} cellSize   font size in CSS px (controls density)
 * @param {string} charset    key in CHARSETS
 * @param {number} gamma      tone curve: >1 brightens midtones, <1 darkens
 * @param {number} imageBlend 0–1 opacity of original image shown behind ASCII
 */
function renderColoredAscii(src, outCanvas, cellSize, charset = 'standard', gamma = 1.2, imageBlend = 0) {
  const dpr   = window.devicePixelRatio || 1;
  const pSize = cellSize * dpr;

  const ctx   = outCanvas.getContext('2d');
  const chars = CHARSETS[charset] || CHARSETS.standard;

  ctx.font = `${pSize}px 'IBM Plex Mono', monospace`;
  const cW    = ctx.measureText('M').width;
  const lineH = pSize * 1.15;

  const cols = Math.floor(outCanvas.width  / cW);
  const rows = Math.floor(outCanvas.height / lineH);
  if (cols < 1 || rows < 1) return;

  // Sample source at one pixel per character cell
  const samp = Object.assign(document.createElement('canvas'), { width: cols, height: rows });
  const sc   = samp.getContext('2d', { willReadFrequently: true });
  sc.drawImage(src, 0, 0, cols, rows);
  const { data } = sc.getImageData(0, 0, cols, rows);

  // Black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);

  // Optional: blend original image underneath
  if (imageBlend > 0) {
    ctx.globalAlpha = imageBlend;
    ctx.drawImage(src, 0, 0, outCanvas.width, outCanvas.height);
    ctx.globalAlpha = 1;
  }

  ctx.font = `${pSize}px 'IBM Plex Mono', monospace`;

  for (let row = 0; row < rows; row++) {
    const y = row * lineH + pSize;
    for (let col = 0; col < cols; col++) {
      const i = (row * cols + col) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];

      const { char, lum } = pixelToAsciiCell(r, g, b, charset, gamma);
      if (char === ' ') continue;

      // Dark areas fade out naturally
      const alpha = Math.pow(lum / 255, 1.4);
      if (alpha < 0.04) continue;

      ctx.globalAlpha = alpha;
      ctx.fillStyle   = `rgb(${r},${g},${b})`;
      ctx.fillText(char, col * cW, y);
    }
  }
  ctx.globalAlpha = 1;
}

// ── Upload state ───────────────────────────────────────────────
let uploadSrc        = null;
let uploadMode       = 'image';
let uploadCellSize   = 7;
let uploadCharset    = 'standard';
let uploadGamma      = 1.2;
let uploadBlend      = 0;
let uploadContrast   = 100;   // %
let uploadSaturation = 100;   // %
let uploadHue        = 0;     // degrees
let uploadRAF        = null;

// ── Label helpers ──────────────────────────────────────────────
function cellSizeLabel(v) {
  if (v <= 6)  return 'Extra fine';
  if (v <= 10) return 'Fine';
  if (v <= 15) return 'Medium';
  if (v <= 20) return 'Coarse';
  return 'Very coarse';
}

function gammaLabel(v) {
  if (v <= 0.7) return 'Dark';
  if (v <= 1.0) return 'Slightly dark';
  if (v <= 1.4) return 'Natural';
  if (v <= 2.0) return 'Bright';
  return 'Very bright';
}

// ── Apply CSS filters to the canvas ───────────────────────────
function applyCanvasFilters() {
  const canvas = document.getElementById('ascii-output-canvas');
  if (!canvas) return;
  const parts = [];
  if (uploadContrast   !== 100) parts.push(`contrast(${uploadContrast}%)`);
  if (uploadSaturation !== 100) parts.push(`saturate(${uploadSaturation}%)`);
  if (uploadHue        !==   0) parts.push(`hue-rotate(${uploadHue}deg)`);
  canvas.style.filter = parts.length ? parts.join(' ') : '';
}

// ── Format seconds as m:ss ─────────────────────────────────────
function fmtTime(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── Init upload section ────────────────────────────────────────
function initUpload() {
  const dropZone   = document.getElementById('drop-zone');
  const fileInput  = document.getElementById('file-input');
  const cellSlider = document.getElementById('cell-size-slider');
  const cellVal    = document.getElementById('cell-size-val');
  if (!dropZone) return;

  // Click / keyboard on drop zone
  dropZone.addEventListener('click', e => {
    if (e.target.tagName !== 'INPUT') fileInput.click();
  });
  dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });

  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleUploadFile(e.target.files[0]);
  });

  // Drag and drop
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drop-zone--active');
  });
  ['dragleave', 'dragend'].forEach(ev =>
    dropZone.addEventListener(ev, () => dropZone.classList.remove('drop-zone--active'))
  );
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drop-zone--active');
    const file = e.dataTransfer.files[0];
    if (file) handleUploadFile(file);
  });

  // Scale
  if (cellSlider) {
    cellSlider.addEventListener('input', () => {
      uploadCellSize = parseInt(cellSlider.value, 10);
      if (cellVal) cellVal.textContent = cellSizeLabel(uploadCellSize);
      if (uploadSrc && uploadMode === 'image') renderUpload();
    });
    if (cellVal) cellVal.textContent = cellSizeLabel(uploadCellSize);
  }

  // Gamma / brightness
  const gammaSlider = document.getElementById('gamma-slider');
  const gammaVal    = document.getElementById('gamma-val');
  if (gammaSlider) {
    gammaSlider.addEventListener('input', () => {
      uploadGamma = parseFloat(gammaSlider.value);
      if (gammaVal) gammaVal.textContent = gammaLabel(uploadGamma);
      if (uploadSrc && uploadMode === 'image') renderUpload();
    });
    if (gammaVal) gammaVal.textContent = gammaLabel(uploadGamma);
  }

  // Contrast
  const contrastSlider = document.getElementById('contrast-slider');
  const contrastVal    = document.getElementById('contrast-val');
  if (contrastSlider) {
    contrastSlider.addEventListener('input', () => {
      uploadContrast = parseInt(contrastSlider.value, 10);
      if (contrastVal) contrastVal.textContent = uploadContrast + '%';
      applyCanvasFilters();
    });
  }

  // Saturation
  const satSlider = document.getElementById('saturation-slider');
  const satVal    = document.getElementById('saturation-val');
  if (satSlider) {
    satSlider.addEventListener('input', () => {
      uploadSaturation = parseInt(satSlider.value, 10);
      if (satVal) satVal.textContent = uploadSaturation + '%';
      applyCanvasFilters();
    });
  }

  // Hue
  const hueSlider = document.getElementById('hue-slider');
  const hueVal    = document.getElementById('hue-val');
  if (hueSlider) {
    hueSlider.addEventListener('input', () => {
      uploadHue = parseInt(hueSlider.value, 10);
      if (hueVal) hueVal.textContent = uploadHue + '°';
      applyCanvasFilters();
    });
  }

  // Image blend
  const blendSlider = document.getElementById('blend-slider');
  const blendVal    = document.getElementById('blend-val');
  if (blendSlider) {
    blendSlider.addEventListener('input', () => {
      uploadBlend = parseFloat(blendSlider.value);
      if (blendVal) blendVal.textContent = Math.round(uploadBlend * 100) + '%';
      if (uploadSrc && uploadMode === 'image') renderUpload();
    });
  }

  // Character style
  document.querySelectorAll('[data-upload-charset]').forEach(btn => {
    btn.addEventListener('click', () => {
      uploadCharset = btn.dataset.uploadCharset;
      document.querySelectorAll('[data-upload-charset]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (uploadSrc && uploadMode === 'image') renderUpload();
    });
  });

  // Video play / pause
  const playBtn = document.getElementById('video-play-pause');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (!uploadSrc || uploadMode !== 'video') return;
      uploadSrc.paused ? uploadSrc.play() : uploadSrc.pause();
    });
  }

  // Video scrub
  const scrub     = document.getElementById('video-scrub');
  const timeLabel = document.getElementById('video-time');
  if (scrub) {
    let scrubbing = false;
    scrub.addEventListener('mousedown', () => { scrubbing = true; });
    scrub.addEventListener('touchstart', () => { scrubbing = true; }, { passive: true });
    scrub.addEventListener('input', () => {
      if (!uploadSrc || uploadMode !== 'video') return;
      const t = (scrub.value / 1000) * uploadSrc.duration;
      if (isFinite(t)) uploadSrc.currentTime = t;
    });
    window.addEventListener('mouseup',  () => { scrubbing = false; });
    window.addEventListener('touchend', () => { scrubbing = false; });
  }
}

// ── File handling ──────────────────────────────────────────────
function handleUploadFile(file) {
  const isVideo = file.type.startsWith('video/');

  if (uploadSrc && uploadSrc.src && uploadSrc.src.startsWith('blob:')) {
    URL.revokeObjectURL(uploadSrc.src);
  }
  if (uploadRAF) { cancelAnimationFrame(uploadRAF); uploadRAF = null; }

  const label = document.getElementById('upload-filename');
  if (label) label.textContent = file.name;

  if (isVideo) {
    uploadMode = 'video';
    const video = Object.assign(document.createElement('video'), {
      src:         URL.createObjectURL(file),
      loop:        true,
      muted:       true,
      playsInline: true,
      crossOrigin: 'anonymous'
    });
    uploadSrc = video;
    video.addEventListener('loadeddata', () => {
      showUploadOutput(video.videoWidth, video.videoHeight, true);
      video.play();
      startVideoLoop();
    }, { once: true });
  } else {
    uploadMode = 'image';
    const img = new Image();
    img.onload = () => {
      uploadSrc = img;
      showUploadOutput(img.naturalWidth, img.naturalHeight, false);
      renderUpload();
    };
    img.src = URL.createObjectURL(file);
  }
}

function showUploadOutput(srcW, srcH, isVideo) {
  const output   = document.getElementById('upload-output');
  const canvas   = document.getElementById('ascii-output-canvas');
  const vidCtrls = document.getElementById('video-controls');
  const wrapper  = canvas ? canvas.closest('.output-card') : null;
  if (!output || !canvas) return;

  const dpr  = window.devicePixelRatio || 1;
  const cssW = Math.min(900, (wrapper ? wrapper.clientWidth : 900) - 2);
  const cssH = Math.round(cssW * (srcH / srcW));

  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width  = '100%';
  canvas.style.height = 'auto';

  // Reset CSS filters to default when a new file is loaded
  canvas.style.filter = '';
  uploadContrast   = 100;
  uploadSaturation = 100;
  uploadHue        = 0;
  const cs = document.getElementById('contrast-slider');
  const ss = document.getElementById('saturation-slider');
  const hs = document.getElementById('hue-slider');
  if (cs) cs.value = 100;
  if (ss) ss.value = 100;
  if (hs) hs.value = 0;
  const cv = document.getElementById('contrast-val');
  const sv = document.getElementById('saturation-val');
  const hv = document.getElementById('hue-val');
  if (cv) cv.textContent = '100%';
  if (sv) sv.textContent = '100%';
  if (hv) hv.textContent = '0°';

  if (vidCtrls) vidCtrls.hidden = !isVideo;
  output.hidden = false;
  setTimeout(() => output.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
}

function renderUpload() {
  const canvas = document.getElementById('ascii-output-canvas');
  if (!canvas || !uploadSrc) return;
  renderColoredAscii(uploadSrc, canvas, uploadCellSize, uploadCharset, uploadGamma, uploadBlend);
}

function startVideoLoop() {
  const playBtn   = document.getElementById('video-play-pause');
  const scrub     = document.getElementById('video-scrub');
  const timeLabel = document.getElementById('video-time');

  function frame() {
    if (uploadSrc && uploadMode === 'video') {
      if (!uploadSrc.paused && !uploadSrc.ended) {
        renderUpload();
      }
      // Update play/pause label
      if (playBtn) {
        playBtn.textContent = uploadSrc.paused ? '▶  Play' : '⏸  Pause';
      }
      // Update scrub bar (only when not scrubbing)
      if (scrub && uploadSrc.duration > 0) {
        scrub.value = (uploadSrc.currentTime / uploadSrc.duration) * 1000;
      }
      // Update time label
      if (timeLabel && uploadSrc.duration > 0) {
        timeLabel.textContent = `${fmtTime(uploadSrc.currentTime)} / ${fmtTime(uploadSrc.duration)}`;
      }
    }
    uploadRAF = requestAnimationFrame(frame);
  }
  uploadRAF = requestAnimationFrame(frame);
}

// ── Nav scroll class ───────────────────────────────────────────
function initNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const update = () => nav.classList.toggle('nav--scrolled', window.scrollY > 40);
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initUpload();
});
