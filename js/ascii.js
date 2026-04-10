/**
 * ASCII Look v01 — Core Renderer
 *
 * Pure functions: no DOM, no canvas, no side-effects.
 * Designed test-first — see tests/ascii.test.js for the full TDD suite.
 */

'use strict';

// ---------------------------------------------------------------------------
// Character sets  (light → dark, space = transparent background)
// ---------------------------------------------------------------------------
// No '@' — characters are chosen for visual weight, not code familiarity.
const CHARSETS = {
  standard: ' .,:;-+*#',   // 9 levels  (Dense)
  blocks:   ' ░▒▓█',        // 5 levels  (Blocks)
  minimal:  ' .:#'           // 4 levels  (Simple)
};

// ---------------------------------------------------------------------------
// mapBrightnessToChar
// ---------------------------------------------------------------------------
/**
 * Map a brightness value [0–255] to a single ASCII character.
 *
 * @param {number} brightness  0 (dark) → 255 (bright)
 * @param {string} [charset]   key in CHARSETS — default 'standard'
 * @returns {string}           one character
 * @throws  {Error}            if charset is unknown
 */
function mapBrightnessToChar(brightness, charset = 'standard') {
  const chars = CHARSETS[charset];
  if (!chars) throw new Error(`Unknown charset: "${charset}"`);
  const clamped = Math.max(0, Math.min(255, brightness));
  const index   = Math.floor((clamped / 255) * (chars.length - 1));
  return chars[index];
}

// ---------------------------------------------------------------------------
// Animation modes — each returns a value in [0, 1]
// ---------------------------------------------------------------------------

/**
 * Plasma: four overlapping sine waves producing a fluid, colorful field.
 * @param {number} col
 * @param {number} row
 * @param {number} t    elapsed time in seconds
 * @returns {number}    [0, 1]
 */
function computePlasma(col, row, t) {
  const v1 = Math.sin(col * 0.10 + t);
  const v2 = Math.sin(row * 0.10 + t * 0.70);
  const v3 = Math.sin((col + row) * 0.07 + t * 0.90);
  const v4 = Math.sin(Math.sqrt(col * col + row * row) * 0.08 - t);
  return (v1 + v2 + v3 + v4 + 4) / 8; // each vN ∈ [-1,1] → sum+4 ∈ [0,8] → /8 ∈ [0,1]
}

/**
 * Wave: intersecting horizontal × vertical sine wave product.
 * @param {number} col
 * @param {number} row
 * @param {number} t
 * @returns {number}    [0, 1]
 */
function computeWave(col, row, t) {
  const w = Math.sin(col * 0.15 + t) * Math.cos(row * 0.12 - t * 0.6);
  return (w + 1) / 2; // w ∈ [-1,1] → +1 ∈ [0,2] → /2 ∈ [0,1]
}

/**
 * Radial: concentric rings expanding from the grid centre.
 * @param {number} col
 * @param {number} row
 * @param {number} t
 * @param {number} cols   total column count (used for centering)
 * @param {number} rows   total row count    (used for centering)
 * @returns {number}      [0, 1]
 */
function computeRadial(col, row, t, cols, rows) {
  const nx   = cols > 0 ? col / cols - 0.5 : 0;
  const ny   = rows > 0 ? row / rows - 0.5 : 0;
  const dist = Math.sqrt(nx * nx + ny * ny) * 15;
  return (Math.sin(dist - t * 2) + 1) / 2;
}

// ---------------------------------------------------------------------------
// generateAsciiGrid
// ---------------------------------------------------------------------------
/**
 * Generate a complete ASCII grid as a newline-separated string.
 *
 * @param {number}   cols
 * @param {number}   rows
 * @param {Function} modeFn    (col, row, t) → [0, 1]
 * @param {string}   [charset] key in CHARSETS — default 'standard'
 * @param {number}   [t]       time offset — default 0
 * @returns {string}
 */
function generateAsciiGrid(cols, rows, modeFn, charset = 'standard', t = 0) {
  const lines = [];
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < cols; col++) {
      const v = Math.max(0, Math.min(1, modeFn(col, row, t)));
      line += mapBrightnessToChar(v * 255, charset);
    }
    lines.push(line);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// pixelToAsciiCell  (pure — no DOM required, fully testable in Node.js)
// ---------------------------------------------------------------------------
/**
 * Map an RGB pixel to its ASCII character and luminance.
 * Uses ITU-R BT.601 perceptual luminance weights.
 *
 * @param {number} r       Red   [0–255]
 * @param {number} g       Green [0–255]
 * @param {number} b       Blue  [0–255]
 * @param {string} [charset]  key in CHARSETS — default 'standard'
 * @returns {{ char: string, lum: number, r: number, g: number, b: number }}
 */
function pixelToAsciiCell(r, g, b, charset = 'standard', gamma = 1.0) {
  const rawLum = 0.299 * r + 0.587 * g + 0.114 * b; // ITU-R BT.601
  // Gamma adjusts the tone curve: >1 brightens midtones, <1 darkens them
  const lum = gamma === 1.0
    ? rawLum
    : Math.pow(rawLum / 255, 1 / gamma) * 255;
  const char = mapBrightnessToChar(lum, charset);
  return { char, lum, r: r | 0, g: g | 0, b: b | 0 };
}

// ---------------------------------------------------------------------------
// Node.js export (for test runner)
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CHARSETS,
    mapBrightnessToChar,
    computePlasma,
    computeWave,
    computeRadial,
    generateAsciiGrid,
    pixelToAsciiCell
  };
}
