import { Plugin, WorkspaceLeaf, FileView, TFile, addIcon, Notice } from 'obsidian';
import init, { WasmDocument } from '../pkg/djvu_rs';
import { WASM_BASE64 } from './wasm_inline';

const DJVU_VIEW_TYPE = 'djvu-viewer';

// ── Icon ──────────────────────────────────────────────────────────────────────

addIcon(
  'djvu',
  `<text x="4" y="76" font-size="72" font-family="serif" font-weight="bold"
  fill="currentColor">D</text>`,
);

// ── Persisted state per file ──────────────────────────────────────────────────

interface DjVuFileState {
  page: number;
  dpi: number;
}

interface PluginData {
  fileStates: Record<string, DjVuFileState>;
}

const DEFAULT_DATA: PluginData = { fileStates: {} };

// ── DjVu FileView ─────────────────────────────────────────────────────────────

class DjVuView extends FileView {
  private readonly plugin: DjVuPlugin;

  private doc: WasmDocument | null = null;
  private currentPage = 0;
  private currentDpi = 150;
  private fitWidth = false;

  // toolbar elements
  private prevBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private pageInput!: HTMLInputElement;
  private pageCount!: HTMLSpanElement;
  private dpiRange!: HTMLInputElement;
  private dpiVal!: HTMLSpanElement;

  // canvas area
  private canvasWrap!: HTMLDivElement;
  private pageContainer!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private textLayer!: HTMLDivElement;
  private spinner!: HTMLDivElement;

  constructor(leaf: WorkspaceLeaf, plugin: DjVuPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return DJVU_VIEW_TYPE; }
  getDisplayText() { return this.file?.basename ?? 'DjVu'; }
  getIcon() { return 'djvu'; }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async onLoadFile(file: TFile): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('djvu-container');
    if (this.doc) { this.doc.free(); this.doc = null; }
    this.buildUI();
    this.setSpinner(true);

    await this.plugin.wasmReady;

    const bytes = new Uint8Array(await this.app.vault.readBinary(file));
    try {
      this.doc = WasmDocument.from_bytes(bytes);
      const saved = this.plugin.getFileState(file.path);
      this.currentPage = Math.min(saved?.page ?? 0, this.doc.page_count() - 1);
      this.currentDpi = saved?.dpi ?? 150;
      this.dpiRange.value = String(this.currentDpi);
      this.dpiVal.setText(String(this.currentDpi));
      this.updateControls();
      await this.renderPage();
    } catch (e) {
      this.setSpinner(false);
      this.contentEl.createEl('p', {
        text: `Error: ${(e as Error).message}`,
        cls: 'djvu-error',
      });
    }
  }

  async onUnloadFile(file: TFile): Promise<void> {
    this.plugin.saveFileState(file.path, {
      page: this.currentPage,
      dpi: this.currentDpi,
    });
    if (this.doc) { this.doc.free(); this.doc = null; }
  }

  // ── Build UI ────────────────────────────────────────────────────────────────

  private buildUI() {
    const toolbar = this.contentEl.createDiv({ cls: 'djvu-toolbar' });

    // navigation
    this.prevBtn = toolbar.createEl('button', {
      cls: 'djvu-btn',
      text: '◀',
      attr: { 'aria-label': 'Previous page' },
    });
    this.prevBtn.onclick = () => this.goPage(-1);

    this.pageInput = toolbar.createEl('input', {
      cls: 'djvu-page-input',
      attr: { type: 'number', min: '1', 'aria-label': 'Current page' },
    });
    this.pageInput.onchange = () =>
      this.jumpToPage(Number(this.pageInput.value) - 1);
    this.pageInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.jumpToPage(Number(this.pageInput.value) - 1);
      e.stopPropagation(); // don't fire global ArrowLeft/Right
    });

    toolbar.createSpan({ cls: 'djvu-sep-text', text: '/' });
    this.pageCount = toolbar.createSpan({ cls: 'djvu-page-count', text: '—' });

    this.nextBtn = toolbar.createEl('button', {
      cls: 'djvu-btn',
      text: '▶',
      attr: { 'aria-label': 'Next page' },
    });
    this.nextBtn.onclick = () => this.goPage(1);

    toolbar.createSpan({ cls: 'djvu-sep' });

    // zoom
    const fitBtn = toolbar.createEl('button', {
      cls: 'djvu-btn',
      text: '⟷',
      attr: { 'aria-label': 'Fit width' },
    });
    fitBtn.onclick = () => this.applyFitWidth();

    this.dpiVal = toolbar.createSpan({ cls: 'djvu-dpi-val', text: String(this.currentDpi) });

    this.dpiRange = toolbar.createEl('input', { cls: 'djvu-dpi-range' });
    this.dpiRange.type = 'range';
    this.dpiRange.min = '36';
    this.dpiRange.max = '600';
    this.dpiRange.step = '6';
    this.dpiRange.value = String(this.currentDpi);
    this.dpiRange.oninput = () => {
      this.fitWidth = false;
      this.currentDpi = Number(this.dpiRange.value);
      this.dpiVal.setText(String(this.currentDpi));
      this.renderPage();
    };

    toolbar.createSpan({ cls: 'djvu-sep' });

    // copy text
    const copyBtn = toolbar.createEl('button', {
      cls: 'djvu-btn',
      text: '📋',
      attr: { 'aria-label': 'Copy page text' },
    });
    copyBtn.onclick = () => this.copyPageText();

    // canvas area
    this.canvasWrap = this.contentEl.createDiv({ cls: 'djvu-canvas-wrap' });

    this.spinner = this.canvasWrap.createDiv({ cls: 'djvu-spinner' });
    this.spinner.createDiv({ cls: 'djvu-spinner-ring' });

    this.pageContainer = this.canvasWrap.createDiv({ cls: 'djvu-page-container' });
    this.canvas = this.pageContainer.createEl('canvas', { cls: 'djvu-canvas' });
    this.textLayer = this.pageContainer.createDiv({ cls: 'djvu-text-layer' });

    // keyboard
    this.registerDomEvent(document, 'keydown', (e: KeyboardEvent) => {
      if (!this.doc) return;
      if (e.key === 'ArrowLeft')         this.goPage(-1);
      if (e.key === 'ArrowRight')        this.goPage(1);
      if (e.key === '+' || e.key === '=') this.changeDpi(24);
      if (e.key === '-')                 this.changeDpi(-24);
    });

    // touch swipe
    let touchStartX = 0;
    this.registerDomEvent(
      this.canvasWrap,
      'touchstart',
      (e: TouchEvent) => { touchStartX = e.touches[0].clientX; },
      { passive: true },
    );
    this.registerDomEvent(
      this.canvasWrap,
      'touchend',
      (e: TouchEvent) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 50) this.goPage(dx < 0 ? 1 : -1);
      },
      { passive: true },
    );

    // re-fit on resize
    const ro = new ResizeObserver(() => {
      if (this.fitWidth) this.applyFitWidth();
    });
    ro.observe(this.canvasWrap);
    this.register(() => ro.disconnect());
  }

  // ── Controls ────────────────────────────────────────────────────────────────

  private setSpinner(visible: boolean) {
    this.spinner.toggleClass('djvu-spinner--visible', visible);
    this.canvas.toggleClass('djvu-canvas--hidden', visible);
  }

  private updateControls() {
    const count = this.doc?.page_count() ?? 0;
    this.pageInput.value = String(this.currentPage + 1);
    this.pageInput.max = String(count);
    this.pageCount.setText(String(count));
    this.prevBtn.disabled = this.currentPage === 0;
    this.nextBtn.disabled = this.currentPage >= count - 1;
  }

  private goPage(delta: number) {
    if (!this.doc) return;
    const next = this.currentPage + delta;
    if (next < 0 || next >= this.doc.page_count()) return;
    this.currentPage = next;
    this.updateControls();
    this.renderPage();
    this.persistState();
  }

  private jumpToPage(index: number) {
    if (!this.doc) return;
    const clamped = Math.max(0, Math.min(index, this.doc.page_count() - 1));
    if (clamped === this.currentPage) return;
    this.currentPage = clamped;
    this.updateControls();
    this.renderPage();
    this.persistState();
  }

  private changeDpi(delta: number) {
    this.fitWidth = false;
    this.currentDpi = Math.max(36, Math.min(600, this.currentDpi + delta));
    this.dpiRange.value = String(this.currentDpi);
    this.dpiVal.setText(String(this.currentDpi));
    this.renderPage();
    this.persistState();
  }

  private applyFitWidth() {
    if (!this.doc) return;
    this.fitWidth = true;
    try {
      const page = this.doc.page(this.currentPage);
      const containerWidth = this.canvasWrap.clientWidth - 32;
      const nativeDpi = page.dpi();
      const nativeWidth = page.width_at(nativeDpi);
      page.free();
      this.currentDpi = Math.max(
        36,
        Math.min(600, Math.round((containerWidth / nativeWidth) * nativeDpi)),
      );
      this.dpiRange.value = String(this.currentDpi);
      this.dpiVal.setText(String(this.currentDpi));
      this.renderPage();
      this.persistState();
    } catch (e) {
      new Notice(`DjVu: ${(e as Error).message}`);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  private async renderPage() {
    if (!this.doc) return;
    this.setSpinner(true);
    const page = this.doc.page(this.currentPage);
    try {
      await new Promise<void>(r => setTimeout(r, 0)); // let spinner paint
      const w = page.width_at(this.currentDpi);
      const h = page.height_at(this.currentDpi);
      const pixels = page.render(this.currentDpi);
      this.canvas.width = w;
      this.canvas.height = h;
      const ctx = this.canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context unavailable');
      ctx.putImageData(new ImageData(pixels, w, h), 0, 0);
      pixels.free();
      this.pageContainer.style.width  = `${w}px`;
      this.pageContainer.style.height = `${h}px`;
      this.renderTextLayer(page, w, h);
    } catch (e) {
      console.error('[djvu] renderPage error', e);
      new Notice(`DjVu render error: ${(e as Error).message}`);
    } finally {
      page.free();
      this.setSpinner(false);
    }
  }

  // ── Text layer ─────────────────────────────────────────────────────────────

  private renderTextLayer(page: import('../pkg/djvu_rs').WasmPage, w: number, h: number) {
    this.textLayer.empty();
    this.textLayer.style.width  = `${w}px`;
    this.textLayer.style.height = `${h}px`;

    let json: string | null | undefined;
    try { json = page.text_zones_json(this.currentDpi); } catch { return; }
    if (!json) return;

    const zones: Array<{ t: string; x: number; y: number; w: number; h: number }> =
      JSON.parse(json);

    for (const z of zones) {
      if (!z.w || !z.h || !z.t) continue;
      const span = this.textLayer.createEl('span');
      span.textContent = z.t;
      span.style.left     = `${z.x}px`;
      span.style.top      = `${z.y}px`;
      span.style.width    = `${z.w}px`;
      span.style.height   = `${z.h}px`;
      span.style.fontSize = `${z.h}px`;
    }

    // Scale each span horizontally to fit its zone width
    for (const span of Array.from(this.textLayer.children) as HTMLElement[]) {
      const nw = span.scrollWidth;
      if (nw > 0) span.style.transform = `scaleX(${parseInt(span.style.width) / nw})`;
    }
  }

  // ── Text layer ──────────────────────────────────────────────────────────────

  private async copyPageText() {
    if (!this.doc) return;
    const page = this.doc.page(this.currentPage);
    try {
      const text = page.text();
      if (!text) {
        new Notice('No text layer on this page');
        return;
      }
      await navigator.clipboard.writeText(text);
      new Notice('Page text copied');
    } catch (e) {
      new Notice(`Could not copy text: ${(e as Error).message}`);
    } finally {
      page.free();
    }
  }

  // ── State persistence ───────────────────────────────────────────────────────

  private persistState() {
    if (this.file) {
      this.plugin.saveFileState(this.file.path, {
        page: this.currentPage,
        dpi: this.currentDpi,
      });
    }
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export default class DjVuPlugin extends Plugin {
  wasmReady!: Promise<void>;
  private data: PluginData = { ...DEFAULT_DATA };

  async onload() {
    this.data = Object.assign({}, DEFAULT_DATA, await this.loadData());

    this.wasmReady = (async () => {
      const bytes = Uint8Array.from(atob(WASM_BASE64), c => c.charCodeAt(0));
      await init(bytes);
    })();

    this.registerView(DJVU_VIEW_TYPE, leaf => new DjVuView(leaf, this));
    this.registerExtensions(['djvu'], DJVU_VIEW_TYPE);
  }

  async onunload() {
    await this.saveData(this.data);
  }

  getFileState(path: string): DjVuFileState | undefined {
    return this.data.fileStates[path];
  }

  saveFileState(path: string, state: DjVuFileState): void {
    this.data.fileStates[path] = state;
    this.saveData(this.data); // fire-and-forget
  }
}
