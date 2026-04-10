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
  initTypewriter();
});
