# obsidian-djvu

Obsidian community plugin that opens `.djvu` files natively in the editor, powered by [djvu-rs](https://github.com/matyushkin/djvu-rs) compiled to WebAssembly.

## Architecture

- `src/main.ts` — `DjVuPlugin extends Plugin` + `DjVuView extends FileView`
- `styles.css` — Obsidian CSS variable-aware styling
- `manifest.json` — Obsidian plugin manifest
- `package.json` — esbuild build + wasm-pack script
- `pkg/` — WASM output from djvu-rs (gitignored, built locally)

## WASM dependency

The plugin depends on `pkg/` built from djvu-rs with:

```sh
wasm-pack build --target bundler --out-dir pkg \
  /Users/leo/Code/djvu-rs --features wasm
```

Then build the plugin:

```sh
npm install
npm run build
```

## Install for testing

Copy `main.js`, `manifest.json`, `styles.css` to:
`<vault>/.obsidian/plugins/obsidian-djvu/`

Then enable in Settings → Community plugins.

## Key rules

- `--target bundler` for wasm-pack (esbuild bundles WASM inline)
- Use Obsidian CSS variables (`--background-primary`, etc.) — no hardcoded colors
- `registerExtensions(['djvu'], DJVU_VIEW_TYPE)` must be called in `onload()`
- `FileView.onLoadFile()` is the entry point for rendering
- GitHub issue: https://github.com/matyushkin/djvu-rs/issues/92
