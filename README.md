# ASCII Look v01

> Terminal-aesthetic ASCII animation. No grain. No noise. Pure characters and light.

---

## Overview

A static website that renders animated ASCII art using pure mathematics — no WebGPU, no canvas
noise overlays, no SVG turbulence filters. The visual is built entirely from brightness-mapped
characters (`space` through `@`) driven by trigonometric wave functions.

Inspired by the aesthetic of [grainrad.com](https://grainrad.com/) — same dark terminal look,
same monospace font stack — but with the grain completely removed.

---

## Project Structure

```
ascii look v01/
├── index.html              Main website
├── css/
│   └── styles.css          All styles — tokens, layout, scanlines (no noise)
├── js/
│   ├── ascii.js            Core engine: pure functions, Node-compatible exports
│   └── main.js             DOM wiring: hero canvas, demo pre, controls
├── tests/
│   ├── ascii.test.js       TDD suite — run with Node.js
│   └── runner.html         Browser-based test runner
└── README.md               This file
```

---

## Quick Start

```bash
# Open locally
open index.html

# Run tests (Node.js required)
node tests/ascii.test.js

# Or open the browser test runner
open tests/runner.html
```

---

## TDD — Red · Green · Clean

This project was written **test-first**. Every function in `ascii.js` had a failing test written
before a single line of implementation existed.

### 1 — RED phase  *(tests written, no implementation)*

```js
// ascii.test.js — written first

const { mapBrightnessToChar } = require('../js/ascii.js');
// → ReferenceError: Cannot find module '../js/ascii.js'
//   All tests FAIL. This is the red line.

eq(mapBrightnessToChar(0),   ' ', 'brightness 0 → space');   // FAIL ✗
eq(mapBrightnessToChar(255), '@', 'brightness 255 → @');      // FAIL ✗
```

### 2 — GREEN phase  *(minimum code to pass)*

```js
// js/ascii.js — first working implementation

const CHARSETS = {
  standard: ' .,:;+*=#@'
};

function mapBrightnessToChar(brightness, charset = 'standard') {
  const chars  = CHARSETS[charset];
  if (!chars) throw new Error(`Unknown charset: "${charset}"`);
  const clamped = Math.max(0, Math.min(255, brightness));
  const index   = Math.floor((clamped / 255) * (chars.length - 1));
  return chars[index];
}
```

```
▸ mapBrightnessToChar — standard charset
  ✓ brightness 0 → space
  ✓ brightness 255 → @
  ✓ returns a string
  ✓ returns exactly one character
```

### 3 — CLEAN phase  *(refactor — tests still green)*

- Added input clamping (negative / >255 values handled gracefully).
- Added named charset support (`blocks`, `minimal`).
- Added Node.js / browser dual export pattern.
- All 157 tests remain green.

---

## Animation Modes

All mode functions are **pure** — no side effects, no globals. Each returns a value in `[0, 1]`.

### `computePlasma(col, row, t)`

Four overlapping sine waves. At `(0, 0, 0)` every term is `sin(0) = 0`, so the result is
exactly `(0 + 4) / 8 = 0.5`.

```
value = ( sin(col·0.10 + t)
        + sin(row·0.10 + t·0.70)
        + sin((col+row)·0.07 + t·0.90)
        + sin(√(col²+row²)·0.08 − t)
        + 4 ) / 8
```

### `computeWave(col, row, t)`

Product of two perpendicular waves — creates a grid of crests and troughs.

```
value = ( sin(col·0.15 + t) · cos(row·0.12 − t·0.6) + 1 ) / 2
```

### `computeRadial(col, row, t, cols, rows)`

Concentric rings expanding from the grid centre.

```
nx    = col/cols − 0.5
ny    = row/rows − 0.5
dist  = √(nx² + ny²) · 15
value = ( sin(dist − t·2) + 1 ) / 2
```

---

## Character Sets

| Key        | Characters        | Levels |
|------------|-------------------|--------|
| `standard` | ` .,:;+*=#@`      | 10     |
| `blocks`   | ` ░▒▓█`           | 5      |
| `minimal`  | ` .:@`            | 4      |

Space always represents "background" (transparent / invisible).  
The last character is always the brightest.

---

## Design — No Grain

The original grainrad.com applies a film-grain overlay (likely via an animated `<canvas>` or
SVG `feTurbulence` filter). This project intentionally omits that:

| Effect       | grainrad.com | ascii look v01 |
|--------------|:---:|:---:|
| ASCII render | ✓   | ✓   |
| Phosphor glow (text-shadow) | ✓ | ✓ |
| CRT scanlines (CSS) | ✓ | ✓ |
| Vignette overlay | ✓ | ✓ |
| Film grain / noise | ✓ | **✗** |
| SVG turbulence filter | ✓ | **✗** |

---

## API Reference

```js
// Core engine — ascii.js

mapBrightnessToChar(brightness, charset?)
  // brightness : number  [0–255], clamped
  // charset    : 'standard' | 'blocks' | 'minimal'   (default: 'standard')
  // returns    : string  — one character

computePlasma(col, row, t)   → number [0, 1]
computeWave(col, row, t)     → number [0, 1]
computeRadial(col, row, t, cols, rows) → number [0, 1]

generateAsciiGrid(cols, rows, modeFn, charset?, t?)
  // modeFn : (col, row, t) → number [0, 1]
  // returns: string — newline-separated rows of characters
```

---

## License

MIT — see [LICENSE](LICENSE)
