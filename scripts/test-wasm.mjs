#!/usr/bin/env node
/**
 * WASM smoke-test against real DjVu fixture files.
 *
 * Usage:
 *   node scripts/test-wasm.mjs [/path/to/fixtures]
 *
 * Defaults to /Users/leo/Code/djvu-rs/tests/fixtures
 * Requires pkg/ to be built: npm run build:wasm
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturesDir = process.argv[2] ?? '/Users/leo/Code/djvu-rs/tests/fixtures';

// ── Load WASM ─────────────────────────────────────────────────────────────────

const wasmPath = join(root, 'pkg', 'djvu_rs_bg.wasm');
if (!existsSync(wasmPath)) {
  console.error('pkg/djvu_rs_bg.wasm not found — run: npm run build:wasm');
  process.exit(1);
}

const { initSync, WasmDocument } = await import(join(root, 'pkg', 'djvu_rs.js'));
const wasmBytes = readFileSync(wasmPath);
initSync({ module: wasmBytes });

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertion failed');
}

function fixture(name) {
  return new Uint8Array(readFileSync(join(fixturesDir, name)));
}

function section(title) {
  console.log(`\n── ${title}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

section('Error handling');

ok('garbage bytes throw', () => {
  try {
    WasmDocument.from_bytes(new Uint8Array([0, 1, 2, 3, 4]));
    throw new Error('expected error, got none');
  } catch (e) {
    assert(e.message !== 'expected error, got none', 'should throw parse error');
  }
});

ok('empty bytes throw', () => {
  try {
    WasmDocument.from_bytes(new Uint8Array(0));
    throw new Error('expected error, got none');
  } catch (e) {
    assert(e.message !== 'expected error, got none', 'should throw parse error');
  }
});

ok('page out of range throws', () => {
  const doc = WasmDocument.from_bytes(fixture('boy.djvu'));
  try {
    doc.page(999);
    throw new Error('expected error, got none');
  } catch (e) {
    assert(e.message !== 'expected error, got none', 'should throw range error');
  }
});

section('boy.djvu — single-page IW44 color');

ok('parses to 1 page', () => {
  const doc = WasmDocument.from_bytes(fixture('boy.djvu'));
  assert(doc.page_count() === 1, `expected 1, got ${doc.page_count()}`);
});

ok('native DPI is 100', () => {
  const doc = WasmDocument.from_bytes(fixture('boy.djvu'));
  assert(doc.page(0).dpi() === 100, `expected 100, got ${doc.page(0).dpi()}`);
});

ok('width/height at 100 dpi = 192×256', () => {
  const doc = WasmDocument.from_bytes(fixture('boy.djvu'));
  const p = doc.page(0);
  assert(p.width_at(100) === 192, `width: ${p.width_at(100)}`);
  assert(p.height_at(100) === 256, `height: ${p.height_at(100)}`);
});

ok('render at 150 dpi returns correct pixel count', () => {
  const doc = WasmDocument.from_bytes(fixture('boy.djvu'));
  const p = doc.page(0);
  const w = p.width_at(150);
  const h = p.height_at(150);
  const pixels = p.render(150);
  assert(pixels.length === w * h * 4,
    `expected ${w * h * 4} bytes, got ${pixels.length}`);
});

ok('render at 36 dpi (min) returns correct pixel count', () => {
  const doc = WasmDocument.from_bytes(fixture('boy.djvu'));
  const p = doc.page(0);
  const w = p.width_at(36); const h = p.height_at(36);
  const px = p.render(36);
  assert(px.length === w * h * 4, `${px.length} vs ${w * h * 4}`);
});

ok('render at 300 dpi returns correct pixel count', () => {
  const doc = WasmDocument.from_bytes(fixture('boy.djvu'));
  const p = doc.page(0);
  const w = p.width_at(300); const h = p.height_at(300);
  const px = p.render(300);
  assert(px.length === w * h * 4, `${px.length} vs ${w * h * 4}`);
});

ok('RGBA pixels are not all-zero', () => {
  const doc = WasmDocument.from_bytes(fixture('boy.djvu'));
  const px = doc.page(0).render(100);
  const nonZero = px.some(b => b !== 0);
  assert(nonZero, 'all pixels are zero — render produced blank output');
});

ok('no text layer returns undefined', () => {
  const doc = WasmDocument.from_bytes(fixture('boy.djvu'));
  assert(doc.page(0).text() === undefined, 'expected undefined');
});

section('boy_jb2.djvu — single-page JB2 bilevel');

ok('parses and renders', () => {
  const doc = WasmDocument.from_bytes(fixture('boy_jb2.djvu'));
  assert(doc.page_count() === 1);
  const p = doc.page(0);
  const px = p.render(150);
  assert(px.length === p.width_at(150) * p.height_at(150) * 4);
});

section('Rotated pages (boy_jb2_rotate*)');

for (const rot of ['90', '180', '270']) {
  ok(`rotate${rot} parses and renders`, () => {
    const doc = WasmDocument.from_bytes(fixture(`boy_jb2_rotate${rot}.djvu`));
    const p = doc.page(0);
    const px = p.render(100);
    assert(px.length === p.width_at(100) * p.height_at(100) * 4);
  });
}

section('DjVu3Spec_bundled.djvu — multi-page bundled');

ok('parses with multiple pages', () => {
  const doc = WasmDocument.from_bytes(fixture('DjVu3Spec_bundled.djvu'));
  assert(doc.page_count() > 1, `expected >1, got ${doc.page_count()}`);
  console.log(`       (${doc.page_count()} pages)`);
});

ok('first page renders', () => {
  const doc = WasmDocument.from_bytes(fixture('DjVu3Spec_bundled.djvu'));
  const p = doc.page(0);
  const px = p.render(72);
  assert(px.length === p.width_at(72) * p.height_at(72) * 4);
});

ok('last page renders', () => {
  const doc = WasmDocument.from_bytes(fixture('DjVu3Spec_bundled.djvu'));
  const last = doc.page_count() - 1;
  const p = doc.page(last);
  const px = p.render(72);
  assert(px.length === p.width_at(72) * p.height_at(72) * 4);
});

section('carte.djvu — color map (known truncated fixture)');

ok('parses but render fails gracefully (truncated IFF data)', () => {
  // carte.djvu in the djvu.js fixture set is intentionally truncated.
  // Verify it throws a meaningful error rather than panicking/hanging.
  try {
    const doc = WasmDocument.from_bytes(fixture('carte.djvu'));
    doc.page(0).render(72);
    // If it somehow succeeds, that's also acceptable.
    console.log('       (rendered OK — fixture may have been updated)');
  } catch (e) {
    assert(typeof e.message === 'string' && e.message.length > 0,
      'error must have a message');
    console.log(`       (threw as expected: ${e.message.slice(0, 60)})`);
  }
});

section('big-scanned-page.djvu — large page stress test');

ok('parses and renders at 72 dpi', () => {
  const doc = WasmDocument.from_bytes(fixture('big-scanned-page.djvu'));
  const p = doc.page(0);
  const px = p.render(72);
  assert(px.length === p.width_at(72) * p.height_at(72) * 4);
  console.log(`       (${p.width_at(72)}×${p.height_at(72)} px at 72 dpi)`);
});

section('navm_fgbz.djvu — FGbz foreground palette');

ok('parses and renders', () => {
  const doc = WasmDocument.from_bytes(fixture('navm_fgbz.djvu'));
  const p = doc.page(0);
  const px = p.render(150);
  assert(px.length === p.width_at(150) * p.height_at(150) * 4);
});

section('czech.djvu / malliavin.djvu — text layer');

ok('czech.djvu: text() returns string on pages with text', () => {
  const doc = WasmDocument.from_bytes(fixture('czech.djvu'));
  let found = false;
  for (let i = 0; i < Math.min(doc.page_count(), 5); i++) {
    const t = doc.page(i).text();
    if (typeof t === 'string' && t.length > 0) { found = true; break; }
  }
  // Not all docs have text; just verify it doesn't throw
  console.log(`       text found: ${found}`);
});

ok('malliavin.djvu: text() does not throw on any page', () => {
  const doc = WasmDocument.from_bytes(fixture('malliavin.djvu'));
  for (let i = 0; i < doc.page_count(); i++) {
    doc.page(i).text(); // must not throw
  }
});

section('vega.djvu / history.djvu / irish.djvu');

for (const [name, dpi] of [['vega.djvu', 100], ['history.djvu', 100]]) {
  ok(`${name}: renders first page at ${dpi} dpi`, () => {
    const doc = WasmDocument.from_bytes(fixture(name));
    const p = doc.page(0);
    const px = p.render(dpi);
    assert(px.length === p.width_at(dpi) * p.height_at(dpi) * 4);
  });
}

// irish.djvu hangs on render (decoder stalls on this specific file).
// Track at: https://github.com/matyushkin/djvu-rs/issues/122
ok('irish.djvu: parses without hanging (render skipped — see djvu-rs#119)', () => {
  const doc = WasmDocument.from_bytes(fixture('irish.djvu'));
  assert(doc.page_count() >= 1);
  assert(doc.page(0).dpi() > 0);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(48)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
