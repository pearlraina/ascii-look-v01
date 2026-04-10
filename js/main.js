/**
 * ASCII Look v01 — Application
 *
 * Wires the ascii.js engine to the DOM:
 *   • Hero canvas — full-viewport plasma animation
 *   • Demo pre    — interactive, mode/charset-switchable
 *   • Controls    — mode and charset buttons
 *   • Nav         — scroll-state class
 *   • Hero sub    — typewriter reveal on load
 */

'use strict';

// ── State ──────────────────────────────────────────────────────
let currentMode    = 'plasma';
let currentCharset = 'standard';
let animTime       = 0;
let lastTs         = 0;

// ── Hero canvas ────────────────────────────────────────────────
let heroCanvas = null;
let heroCtx    = null;

function initHero() {
  heroCanvas = document.getElementById('hero-canvas');
  if (!heroCanvas) return;
  heroCtx = heroCanvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  document.fonts.ready.then(() => requestAnimationFrame(heroLoop));
}

function resize() {
  if (!heroCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  // Physical backing-store resolution — canvas CSS size stays 100%×100% via stylesheet
  heroCanvas.width  = Math.round(window.innerWidth  * dpr);
  heroCanvas.height = Math.round(window.innerHeight * dpr);
}

function heroLoop(ts) {
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs    = ts;
  animTime += dt * 0.55;
  renderHero();
  requestAnimationFrame(heroLoop);
}

function renderHero() {
  const dpr    = window.devicePixelRatio || 1;
  const pxSize = 7 * dpr;                          // 7 CSS-px font → physical px
  const ctx    = heroCtx;
  const w      = heroCanvas.width;
  const h      = heroCanvas.height;
  const chars  = CHARSETS.standard;
  const t      = animTime;

  ctx.font = `${pxSize}px "IBM Plex Mono", monospace`;
  const cW = ctx.measureText('M').width;           // physical char width
  const cH = pxSize * 1.1;

  const cols = Math.ceil(w / cW);
  const rows = Math.ceil(h / cH);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';                        // white — no green

  for (let row = 0; row < rows; row++) {
    const y = row * cH + pxSize;
    for (let col = 0; col < cols; col++) {
      const v = computePlasma(col, row, t);
      if (v < 0.1) continue;
      const char = chars[Math.floor(v * (chars.length - 1))];
      if (char === ' ') continue;
      ctx.globalAlpha = v * 0.28;                  // subtle — it's a background texture
      ctx.fillText(char, col * cW, y);
    }
  }
  ctx.globalAlpha = 1;
}

// ── Demo pre ───────────────────────────────────────────────────
const DEMO_COLS = 90;
const DEMO_ROWS = 34;

function initDemo() {
  const out = document.getElementById('demo-ascii-output');
  if (!out) return;

  let t    = 0;
  let last = 0;

  function demoLoop(ts) {
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    t   += dt * 0.9;

    const modeFns = {
      plasma: (c, r) => computePlasma(c, r, t),
      wave:   (c, r) => computeWave(c, r, t),
      radial: (c, r) => computeRadial(c, r, t, DEMO_COLS, DEMO_ROWS)
    };

    out.textContent = generateAsciiGrid(
      DEMO_COLS,
      DEMO_ROWS,
      modeFns[currentMode] || modeFns.plasma,
      currentCharset
    );

    requestAnimationFrame(demoLoop);
  }

  requestAnimationFrame(demoLoop);
}

// ── Colored ASCII from image / video ─────────────────────────────────────
/**
 * Render a source image or video frame as colored ASCII onto a canvas.
 * Uses pixelToAsciiCell from ascii.js for the character mapping.
 * Requires browser Canvas API.
 *
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} src
 * @param {HTMLCanvasElement} outCanvas  — sized by the caller
 * @param {number}  cellSize            — font size in px (controls density)
 * @param {string}  [charset]
 */
/**
 * Render a source image/video as colored ASCII with gamma and shadow-opacity.
 *
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} src
 * @param {HTMLCanvasElement} outCanvas
 * @param {number} cellSize     font size in px (controls scale)
 * @param {string} charset      key in CHARSETS
 * @param {number} gamma        tone curve: >1 brightens midtones, <1 darkens (default 1.2)
 * @param {number} imageBlend   0–1 opacity of the original image shown behind the ASCII (default 0)
 */
function renderColoredAscii(src, outCanvas, cellSize, charset = 'standard', gamma = 1.2, imageBlend = 0) {
  // Scale cellSize to physical pixels so it renders crisply on Retina/HiDPI
  const dpr   = window.devicePixelRatio || 1;
  const pSize = cellSize * dpr;                    // physical font size

  const ctx   = outCanvas.getContext('2d');
  const chars = CHARSETS[charset] || CHARSETS.standard;

  ctx.font = `${pSize}px 'IBM Plex Mono', monospace`;
  const cW   = ctx.measureText('M').width;         // physical char width
  const lineH = pSize * 1.15;

  // outCanvas.width / height are already in physical pixels (set in showUploadOutput)
  const cols = Math.floor(outCanvas.width  / cW);
  const rows = Math.floor(outCanvas.height / lineH);
  if (cols < 1 || rows < 1) return;

  // Scale source to exactly cols×rows — one pixel per character cell
  const samp = Object.assign(document.createElement('canvas'), { width: cols, height: rows });
  const sc   = samp.getContext('2d', { willReadFrequently: true });
  sc.drawImage(src, 0, 0, cols, rows);
  const { data } = sc.getImageData(0, 0, cols, rows);

  // 1. Black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);

  // 2. Optional: blend original image underneath the ASCII layer
  if (imageBlend > 0) {
    ctx.globalAlpha = imageBlend;
    ctx.drawImage(src, 0, 0, outCanvas.width, outCanvas.height);
    ctx.globalAlpha = 1;
  }

  // 3. Draw ASCII characters — opacity fades naturally with darkness
  ctx.font = `${pSize}px 'IBM Plex Mono', monospace`;

  for (let row = 0; row < rows; row++) {
    const y = row * lineH + pSize;
    for (let col = 0; col < cols; col++) {
      const i = (row * cols + col) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];

      const { char, lum } = pixelToAsciiCell(r, g, b, charset, gamma);
      if (char === ' ') continue;

      // Shadow opacity: dark areas fade out, bright areas are fully visible
      const alpha = Math.pow(lum / 255, 1.4);
      if (alpha < 0.04) continue;

      ctx.globalAlpha = alpha;
      ctx.fillStyle   = `rgb(${r},${g},${b})`;
      ctx.fillText(char, col * cW, y);
    }
  }
  ctx.globalAlpha = 1;
}

// ── Upload state ──────────────────────────────────────────────
let uploadSrc      = null;
let uploadMode     = 'image';
let uploadCellSize = 7;      // CSS px — smaller = finer detail on screen
let uploadCharset  = 'standard';
let uploadGamma    = 1.2;
let uploadBlend    = 0;
let uploadRAF      = null;

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

function initUpload() {
  const dropZone   = document.getElementById('drop-zone');
  const fileInput  = document.getElementById('file-input');
  const cellSlider = document.getElementById('cell-size-slider');
  const cellVal    = document.getElementById('cell-size-val');
  if (!dropZone) return;

  // Click anywhere on drop-zone → open file picker
  dropZone.addEventListener('click', e => {
    if (e.target.tagName !== 'INPUT') fileInput.click();
  });
  dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });

  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleUploadFile(e.target.files[0]);
  });

  // Drag-and-drop
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

  // Cell size / scale slider
  if (cellSlider) {
    cellSlider.addEventListener('input', () => {
      uploadCellSize = parseInt(cellSlider.value, 10);
      if (cellVal) cellVal.textContent = cellSizeLabel(uploadCellSize);
      if (uploadSrc && uploadMode === 'image') renderUpload();
    });
    // Set initial label
    if (cellVal) cellVal.textContent = cellSizeLabel(uploadCellSize);
  }

  // Gamma slider
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

  // Image blend slider
  const blendSlider = document.getElementById('blend-slider');
  const blendVal    = document.getElementById('blend-val');
  if (blendSlider) {
    blendSlider.addEventListener('input', () => {
      uploadBlend = parseFloat(blendSlider.value);
      if (blendVal) blendVal.textContent = Math.round(uploadBlend * 100) + '%';
      if (uploadSrc && uploadMode === 'image') renderUpload();
    });
  }

  // Character style buttons for the upload section
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
}

function handleUploadFile(file) {
  const isVideo = file.type.startsWith('video/');

  // Clean up previous object URL
  if (uploadSrc && uploadSrc.src && uploadSrc.src.startsWith('blob:')) {
    URL.revokeObjectURL(uploadSrc.src);
  }
  if (uploadRAF) { cancelAnimationFrame(uploadRAF); uploadRAF = null; }

  // Update filename label
  const label = document.getElementById('upload-filename');
  if (label) label.textContent = file.name;

  if (isVideo) {
    uploadMode = 'video';
    const video = Object.assign(document.createElement('video'), {
      src:          URL.createObjectURL(file),
      loop:         true,
      muted:        true,
      playsInline:  true,
      crossOrigin:  'anonymous'
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

  const dpr    = window.devicePixelRatio || 1;
  const cssW   = Math.min(900, (wrapper ? wrapper.clientWidth : 900) - 2);
  const cssH   = Math.round(cssW * (srcH / srcW));

  // Set backing-store to physical pixels for crisp Retina rendering
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  // Let CSS scale the canvas to fill its container
  canvas.style.width  = '100%';
  canvas.style.height = 'auto';

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
  const playBtn = document.getElementById('video-play-pause');

  function frame() {
    if (uploadSrc && uploadMode === 'video') {
      if (!uploadSrc.paused && !uploadSrc.ended) {
        renderUpload();
      }
      if (playBtn) {
        playBtn.textContent = uploadSrc.paused ? '▶  PLAY' : '⏸  PAUSE';
      }
    }
    uploadRAF = requestAnimationFrame(frame);
  }
  uploadRAF = requestAnimationFrame(frame);
}

// ── Controls ───────────────────────────────────────────────────
function initControls() {
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentMode = btn.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('[data-charset]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCharset = btn.dataset.charset;
      document.querySelectorAll('[data-charset]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Sync demo rendering with the visual charset names
  // (demo uses CHARSETS keys directly; the labels Dense/Blocks/Simple map 1:1 to standard/blocks/minimal)
}

// ── Nav scroll class ───────────────────────────────────────────
function initNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const update = () => nav.classList.toggle('nav--scrolled', window.scrollY > 40);
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ── Typewriter for hero subtitle ──────────────────────────────
function initTypewriter() {
  const el = document.querySelector('.hero-sub');
  if (!el) return;
  const full = el.textContent.trim();
  el.textContent = '';
  let i = 0;
  const tick = () => {
    if (i >= full.length) return;
    el.textContent += full[i++];
    setTimeout(tick, full[i - 1] === '\n' ? 120 : 22);
  };
  setTimeout(tick, 600);
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initHero();
  initDemo();
  initControls();
  initUpload();
  initTypewriter();
});
