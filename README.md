# obsidian-djvu

Obsidian plugin that opens `.djvu` files natively in the editor, powered by [djvu-rs](https://github.com/matyushkin/djvu-rs) compiled to WebAssembly.

Works on desktop and mobile. No external dependencies at runtime.

## Features

- Opens `.djvu` files directly from the vault (click to open)
- Page navigation (◀/▶ buttons or ←/→ keys)
- DPI/zoom slider (+/− keys)
- Light and dark theme support

## Installation

### From Obsidian community plugins *(coming soon)*

Settings → Community plugins → Browse → search "DjVu Viewer"

### Manual

1. Build (see below)
2. Copy `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/obsidian-djvu/`
3. Enable in Settings → Community plugins

## Build

```sh
# 1. Build djvu-rs WASM (from the djvu-rs repo root)
wasm-pack build --target bundler --out-dir ../obsidian-djvu/pkg --features wasm

# 2. Install JS deps and build the plugin
cd ../obsidian-djvu
npm install
npm run build
```

## Related

- [djvu-rs](https://github.com/matyushkin/djvu-rs) — Rust DjVu decoder
- [djvu-viewer-extension](https://github.com/matyushkin/djvu-viewer-extension) — Chrome extension
- Issue [#92](https://github.com/matyushkin/djvu-rs/issues/92) — Obsidian plugin tracking
