# obsidian-djvu

Obsidian community plugin that opens `.djvu` files natively in the editor, powered by [djvu-rs](https://github.com/matyushkin/djvu-rs) compiled to WebAssembly.

## Architecture

- `src/main.ts` — `DjVuPlugin extends Plugin` + `DjVuView extends FileView`
- `styles.css` — Obsidian CSS variable-aware styling
- `manifest.json` — Obsidian plugin manifest
- `package.json` — esbuild build + wasm-pack script
- `pkg/` — WASM output from djvu-rs (gitignored, built locally)

## WASM dependency

The plugin depends on `pkg/` built from djvu-rs. Build order:

```sh
# 1. Build WASM (--target web generates async init compatible with the embed approach)
npm run build:wasm

# 2. Embed WASM bytes as base64 TS constant → src/wasm_inline.ts (gitignored)
npm run embed:wasm

# 3. Bundle plugin
npm run build
```

Or just `npm run build` (calls embed:wasm automatically, but requires pkg/ to exist).

## WASM bundling approach

`--target web` (not `--target bundler`) is used for wasm-pack.
`--target bundler` with esbuild fails because `import * as wasm from '.wasm'`
inside wasm-bindgen's generated `djvu_rs_bg.js` receives a `Uint8Array` from
esbuild's `--loader:.wasm=binary` instead of a WebAssembly module object.

The workaround: `scripts/embed-wasm.mjs` reads `pkg/djvu_rs_bg.wasm` and writes
`src/wasm_inline.ts` with the WASM bytes as a base64 string constant.
`main.ts` decodes it with `atob()` and passes a `Uint8Array` to `init()`.
`src/wasm_inline.ts` is gitignored (generated artifact).

## Install for testing

Copy `main.js`, `manifest.json`, `styles.css` to:
`<vault>/.obsidian/plugins/obsidian-djvu/`

Then enable in Settings → Community plugins.

## Key rules

- `--target web` for wasm-pack + `scripts/embed-wasm.mjs` for WASM inlining
- Use Obsidian CSS variables (`--background-primary`, etc.) — no hardcoded colors
- `registerExtensions(['djvu'], DJVU_VIEW_TYPE)` must be called in `onload()`
- `FileView.onLoadFile()` is the entry point for rendering
- `plugin.wasmReady` is a Promise gating all WASM calls — await it in `onLoadFile`
- `WasmPage.text()` returns `string | undefined` (None = no text layer)
- GitHub issue: https://github.com/matyushkin/djvu-rs/issues/92
