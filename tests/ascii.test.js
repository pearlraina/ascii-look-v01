/**
 * ASCII Look v01 — TDD Test Suite
 *
 * RED → GREEN workflow
 * ─────────────────────────────────────────────────────────────────────────
 *  RED   Write tests FIRST; they fail because the code doesn't exist yet.
 *  GREEN Write the minimum code to make every test pass.
 *  CLEAN Refactor without breaking tests.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Run:  node tests/ascii.test.js
 */

'use strict';

const {
  CHARSETS,
  mapBrightnessToChar,
  computePlasma,
  computeWave,
  computeRadial,
  generateAsciiGrid
} = require('../js/ascii.js');

// ---------------------------------------------------------------------------
// Minimal test framework
// ---------------------------------------------------------------------------
const G = '\x1b[32m'; // green
const R = '\x1b[31m'; // red
const C = '\x1b[36m'; // cyan
const D = '\x1b[2m';  // dim
const X = '\x1b[0m';  // reset

let passed = 0;
let failed = 0;

function ok(condition, label) {
  if (condition) {
    console.log(`  ${G}✓${X} ${label}`);
    passed++;
  } else {
    console.error(`  ${R}✗${X} ${label}`);
    failed++;
  }
}

function eq(actual, expected, label) {
  const pass = actual === expected;
  if (pass) {
    console.log(`  ${G}✓${X} ${label}`);
    passed++;
  } else {
    console.error(`  ${R}✗${X} ${label}`);
    console.error(`      ${D}expected${X} ${JSON.stringify(expected)}`);
    console.error(`      ${D}received${X} ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n${C}▸ ${name}${X}`);
}

function throws(fn, label) {
  try {
    fn();
    console.error(`  ${R}✗${X} ${label} (expected an error, got none)`);
    failed++;
  } catch (_) {
    console.log(`  ${G}✓${X} ${label}`);
    passed++;
  }
}

// ===========================================================================
// RED PHASE — tests written before implementation exists
// (If you delete js/ascii.js and run, every test below will fail.)
// ===========================================================================

section('CHARSETS structure');
ok(typeof CHARSETS === 'object',           'CHARSETS is an object');
ok(typeof CHARSETS.standard === 'string',  'CHARSETS.standard is a string');
ok(typeof CHARSETS.blocks   === 'string',  'CHARSETS.blocks is a string');
ok(typeof CHARSETS.minimal  === 'string',  'CHARSETS.minimal is a string');
ok(CHARSETS.standard[0] === ' ',           'standard starts with space (darkest = transparent)');
ok(CHARSETS.blocks[0]   === ' ',           'blocks starts with space');
ok(CHARSETS.minimal[0]  === ' ',           'minimal starts with space');

// ===========================================================================
section('mapBrightnessToChar — standard charset (default)');
eq(mapBrightnessToChar(0),   ' ', 'brightness 0 → space (background)');
eq(mapBrightnessToChar(255), '@', 'brightness 255 → @ (brightest)');
ok(typeof mapBrightnessToChar(128) === 'string', 'returns a string');
ok(mapBrightnessToChar(128).length === 1,        'returns exactly one character');

section('mapBrightnessToChar — named charsets');
eq(mapBrightnessToChar(0,   'minimal'), ' ', 'minimal: 0 → space');
eq(mapBrightnessToChar(255, 'minimal'), '@', 'minimal: 255 → @');
eq(mapBrightnessToChar(0,   'blocks'),  ' ', 'blocks: 0 → space');
eq(mapBrightnessToChar(255, 'blocks'),  '█', 'blocks: 255 → █');

section('mapBrightnessToChar — edge values and clamping');
eq(mapBrightnessToChar(-10), ' ', 'negative brightness clamped to 0 → space');
eq(mapBrightnessToChar(300), '@', 'brightness > 255 clamped to 255 → @');

section('mapBrightnessToChar — unknown charset');
throws(() => mapBrightnessToChar(128, 'unknown'), 'throws on unknown charset');

// ===========================================================================
section('computePlasma — range');
{
  for (let i = 0; i < 50; i++) {
    const col = Math.random() * 200;
    const row = Math.random() * 80;
    const t   = Math.random() * 100;
    const v   = computePlasma(col, row, t);
    ok(v >= 0 && v <= 1, `computePlasma(${col.toFixed(1)}, ${row.toFixed(1)}, ${t.toFixed(1)}) ∈ [0,1]`);
    if (!(v >= 0 && v <= 1)) break; // stop spamming after first failure
  }
}

section('computePlasma — animation progresses');
{
  const v0 = computePlasma(10, 10, 0);
  const v1 = computePlasma(10, 10, 1);
  ok(v0 !== v1, 'value changes as t advances');
}

section('computePlasma — known value at origin and t=0');
{
  // At (0,0,0): all four sin(0)=0 → (0+4)/8 = 0.5
  const expected = 0.5;
  const actual   = computePlasma(0, 0, 0);
  ok(Math.abs(actual - expected) < 1e-9, `computePlasma(0,0,0) === 0.5 (got ${actual})`);
}

// ===========================================================================
section('computeWave — range');
{
  for (let i = 0; i < 50; i++) {
    const col = Math.random() * 200;
    const row = Math.random() * 80;
    const t   = Math.random() * 100;
    const v   = computeWave(col, row, t);
    ok(v >= 0 && v <= 1, `computeWave ∈ [0,1] at (${col.toFixed(1)},${row.toFixed(1)},${t.toFixed(1)})`);
    if (!(v >= 0 && v <= 1)) break;
  }
}

// ===========================================================================
section('computeRadial — range');
{
  for (let i = 0; i < 30; i++) {
    const col  = Math.random() * 100;
    const row  = Math.random() * 40;
    const t    = Math.random() * 100;
    const v    = computeRadial(col, row, t, 100, 40);
    ok(v >= 0 && v <= 1, `computeRadial ∈ [0,1] at (${col.toFixed(1)},${row.toFixed(1)},${t.toFixed(1)})`);
    if (!(v >= 0 && v <= 1)) break;
  }
}

section('computeRadial — safe with zero dimensions');
{
  const v = computeRadial(0, 0, 0, 0, 0);
  ok(typeof v === 'number', 'returns number when cols=0, rows=0');
}

// ===========================================================================
section('generateAsciiGrid — structure');
{
  const grid  = generateAsciiGrid(10, 5, () => 0);
  const lines = grid.split('\n');
  eq(lines.length, 5,  'generates correct row count');
  eq(lines[0].length, 10, 'generates correct col count');
}

section('generateAsciiGrid — all-dark produces all spaces');
{
  const grid = generateAsciiGrid(10, 5, () => 0);
  eq(grid.replace(/\n/g, ''), ' '.repeat(50), 'modeFn→0 ⇒ all spaces');
}

section('generateAsciiGrid — all-bright produces all @');
{
  const grid = generateAsciiGrid(10, 5, () => 1);
  eq(grid.replace(/\n/g, ''), '@'.repeat(50), 'modeFn→1 ⇒ all @');
}

section('generateAsciiGrid — custom charset');
{
  const grid = generateAsciiGrid(4, 1, () => 1, 'blocks');
  eq(grid, '████', 'blocks charset, full brightness → ████');
}

section('generateAsciiGrid — time parameter affects output');
{
  const fn   = (c, r, t) => computePlasma(c, r, t);
  const g0   = generateAsciiGrid(20, 8, fn, 'standard', 0);
  const g1   = generateAsciiGrid(20, 8, fn, 'standard', 10);
  ok(g0 !== g1, 'grid changes when t changes');
}

// ===========================================================================
// Summary
// ===========================================================================
const bar = '─'.repeat(50);
console.log(`\n${bar}`);
if (failed === 0) {
  console.log(`${G}  ALL ${passed} TESTS PASSED ✓${X}`);
} else {
  console.log(`${R}  ${failed} TEST(S) FAILED ✗${X}  (${passed} passed)`);
  process.exitCode = 1;
}
console.log(bar);
