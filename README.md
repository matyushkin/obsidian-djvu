# obsidian-djvu

Obsidian community plugin that opens `.djvu` files natively in the editor, powered by [djvu-rs](https://github.com/matyushkin/djvu-rs) compiled to WebAssembly.

Works on desktop (Windows, macOS, Linux) and mobile. No external dependencies at runtime — the decoder is embedded in the plugin.

## Features

- Opens `.djvu` files directly from the vault with a single click
- Multi-page navigation (◀ / ▶ buttons, ← / → arrow keys, touch swipe)
- Jump to any page by typing the page number
- DPI / zoom slider (+ / − keys), range 36–600 dpi
- Fit-width mode that auto-adjusts on pane resize
- Copy page text (when a text layer is present)
- Light and dark theme support via Obsidian CSS variables
- Persists zoom level and current page per file across sessions

## Installation

### Community plugin browser *(pending approval)*

Settings → Community plugins → Browse → search **"DjVu Viewer"**

### Manual (from release)

1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/matyushkin/obsidian-djvu/releases/latest).
2. Copy the three files to `<your-vault>/.obsidian/plugins/obsidian-djvu/`.
3. Enable **DjVu Viewer** in Settings → Community plugins.

## Build from source

Requires [Rust](https://rustup.rs) and [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/).

```sh
git clone https://github.com/matyushkin/obsidian-djvu
cd obsidian-djvu

# Build djvu-rs WASM (set DJVU_RS_PATH to your local djvu-rs checkout)
DJVU_RS_PATH=/path/to/djvu-rs npm run build:wasm

# Install JS deps and bundle the plugin
npm install
npm run build   # outputs main.js
```

## Development

```sh
npm run dev    # watch mode, rebuilds main.js on save
npm test       # WASM integration test suite (requires pkg/ to be built)
```

## Related

- [djvu-rs](https://github.com/matyushkin/djvu-rs) — Rust DjVu decoder powering this plugin
- [djvu-viewer-extension](https://github.com/matyushkin/djvu-viewer-extension) — Chrome/Firefox extension using the same WASM
- djvu-rs issue [#92](https://github.com/matyushkin/djvu-rs/issues/92) — original Obsidian plugin tracking issue
