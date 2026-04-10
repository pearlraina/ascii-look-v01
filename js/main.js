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
let charW      = 6;   // character cell width  (recalculated after font loads)
let charH      = 10;  // character cell height

function initHero() {
  heroCanvas = document.getElementById('hero-canvas');
  if (!heroCanvas) return;
  heroCtx = heroCanvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);

  document.fonts.ready.then(() => {
    // Measure actual glyph width at our render size
    heroCtx.font = '9px "IBM Plex Mono", monospace';
    charW = heroCtx.measureText('M').width;
    charH = 11;
    requestAnimationFrame(heroLoop);
  });
}

function resize() {
  if (!heroCanvas) return;
  heroCanvas.width  = window.innerWidth;
  heroCanvas.height = window.innerHeight;
}

function heroLoop(ts) {
  const dt = Math.min((ts - lastTs) / 1000, 0.05); // cap at 50 ms to survive tab sleep
  lastTs    = ts;
  animTime += dt * 0.55;

  renderHero();
  requestAnimationFrame(heroLoop);
}

function renderHero() {
  const w    = heroCanvas.width;
  const h    = heroCanvas.height;
  const cols = Math.ceil(w / charW);
  const rows = Math.ceil(h / charH);
  const t    = animTime;
  const ctx  = heroCtx;
  const chars = CHARSETS.standard;

  ctx.clearRect(0, 0, w, h);
  ctx.font      = '9px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#00ff41';

  for (let row = 0; row < rows; row++) {
    const y = row * charH + 9;
    for (let col = 0; col < cols; col++) {
      const v = computePlasma(col, row, t);
      if (v < 0.12) continue;                        // skip near-black cells
      const char = chars[Math.floor(v * (chars.length - 1))];
      if (char === ' ') continue;
      ctx.globalAlpha = v * 0.6;
      ctx.fillText(char, col * charW, y);
    }
  }
  ctx.globalAlpha = 1;
}

// ── Demo pre ───────────────────────────────────────────────────
const DEMO_COLS = 58;
const DEMO_ROWS = 22;

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
function renderColoredAscii(src, outCanvas, cellSize, charset = 'standard') {
  const ctx   = outCanvas.getContext('2d');
  const chars = CHARSETS[charset] || CHARSETS.standard;

  ctx.font = `${cellSize}px 'IBM Plex Mono', monospace`;
  const charW = ctx.measureText('M').width;
  const lineH = cellSize * 1.15;

  const cols = Math.floor(outCanvas.width  / charW);
  const rows = Math.floor(outCanvas.height / lineH);
  if (cols < 1 || rows < 1) return;

  // Scale source to exactly cols×rows — one pixel per character cell
  const samp = Object.assign(document.createElement('canvas'), { width: cols, height: rows });
  const sc   = samp.getContext('2d', { willReadFrequently: true });
  sc.drawImage(src, 0, 0, cols, rows);
  const { data } = sc.getImageData(0, 0, cols, rows);

  // Black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);
  ctx.font = `${cellSize}px 'IBM Plex Mono', monospace`;

  for (let row = 0; row < rows; row++) {
    const y = row * lineH + cellSize;
    for (let col = 0; col < cols; col++) {
      const i = (row * cols + col) * 4;
      const { char } = pixelToAsciiCell(data[i], data[i + 1], data[i + 2], charset);
      if (char === ' ') continue;
      ctx.fillStyle = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
      ctx.fillText(char, col * charW, y);
    }
  }
}

// ── Upload state ──────────────────────────────────────────────
let uploadSrc      = null;  // HTMLImageElement or HTMLVideoElement
let uploadMode     = 'image';
let uploadCellSize = 10;
let uploadCharset  = 'standard';
let uploadRAF      = null;

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

  // Cell size slider
  if (cellSlider) {
    cellSlider.addEventListener('input', () => {
      uploadCellSize = parseInt(cellSlider.value, 10);
      if (cellVal) cellVal.textContent = uploadCellSize + 'px';
      if (uploadSrc && uploadMode === 'image') renderUpload();
    });
  }

  // Charset buttons for the upload section
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
  const wrapper  = canvas ? canvas.closest('.terminal-window') : null;
  if (!output || !canvas) return;

  // Size canvas: max 900px wide, preserve source aspect ratio
  const maxW  = Math.min(900, (wrapper ? wrapper.clientWidth : 900) - 2);
  canvas.width  = maxW;
  canvas.height = Math.round(maxW * (srcH / srcW));

  if (vidCtrls) vidCtrls.hidden = !isVideo;
  output.hidden = false;
  setTimeout(() => output.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
}

function renderUpload() {
  const canvas = document.getElementById('ascii-output-canvas');
  if (!canvas || !uploadSrc) return;
  renderColoredAscii(uploadSrc, canvas, uploadCellSize, uploadCharset);
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
