import { Plugin, WorkspaceLeaf, FileView, TFile, addIcon } from 'obsidian';
import init, { WasmDocument, WasmPage } from '../pkg/djvu_rs';

const DJVU_VIEW_TYPE = 'djvu-viewer';

// ── Icon ────────────────────────────────────────────────────────────────────

addIcon('djvu', `<text x="4" y="76" font-size="72" font-family="serif" font-weight="bold"
  fill="currentColor">D</text>`);

// ── DjVu FileView ────────────────────────────────────────────────────────────

class DjVuView extends FileView {
  private doc: WasmDocument | null = null;
  private currentPage = 0;
  private currentDpi = 150;
  private canvas!: HTMLCanvasElement;
  private pageInfo!: HTMLSpanElement;
  private prevBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private dpiRange!: HTMLInputElement;

  getViewType() { return DJVU_VIEW_TYPE; }
  getDisplayText() { return this.file?.basename ?? 'DjVu'; }
  getIcon() { return 'djvu'; }

  async onLoadFile(file: TFile): Promise<void> {
    this.contentEl.empty();
    this.buildUI();

    const bytes = new Uint8Array(await this.app.vault.readBinary(file));
    try {
      this.doc = WasmDocument.from_bytes(bytes);
      this.currentPage = 0;
      this.updateControls();
      await this.renderPage();
    } catch (e) {
      this.contentEl.createEl('p', { text: `Error: ${(e as Error).message}`, cls: 'djvu-error' });
    }
  }

  private buildUI() {
    const toolbar = this.contentEl.createDiv({ cls: 'djvu-toolbar' });

    this.prevBtn = toolbar.createEl('button', { text: '◀' });
    this.prevBtn.onclick = () => this.goPage(-1);

    this.pageInfo = toolbar.createSpan({ cls: 'djvu-page-info', text: '— / —' });

    this.nextBtn = toolbar.createEl('button', { text: '▶' });
    this.nextBtn.onclick = () => this.goPage(1);

    const sep = () => toolbar.createSpan({ cls: 'djvu-sep' });
    sep();

    const dpiLabel = toolbar.createSpan();
    dpiLabel.setText(`DPI: `);
    const dpiVal = dpiLabel.createSpan({ text: String(this.currentDpi) });

    this.dpiRange = toolbar.createEl('input');
    this.dpiRange.type = 'range';
    this.dpiRange.min = '36';
    this.dpiRange.max = '600';
    this.dpiRange.step = '6';
    this.dpiRange.value = String(this.currentDpi);
    this.dpiRange.oninput = () => {
      this.currentDpi = Number(this.dpiRange.value);
      dpiVal.setText(String(this.currentDpi));
      this.renderPage();
    };

    const wrap = this.contentEl.createDiv({ cls: 'djvu-canvas-wrap' });
    this.canvas = wrap.createEl('canvas');

    this.registerDomEvent(document, 'keydown', (e: KeyboardEvent) => {
      if (!this.doc) return;
      if (e.key === 'ArrowLeft')  this.goPage(-1);
      if (e.key === 'ArrowRight') this.goPage(1);
      if (e.key === '+' || e.key === '=') { this.changeDpi(24); }
      if (e.key === '-') { this.changeDpi(-24); }
    });
  }

  private goPage(delta: number) {
    if (!this.doc) return;
    const next = this.currentPage + delta;
    if (next < 0 || next >= this.doc.page_count()) return;
    this.currentPage = next;
    this.updateControls();
    this.renderPage();
  }

  private changeDpi(delta: number) {
    this.currentDpi = Math.max(36, Math.min(600, this.currentDpi + delta));
    this.dpiRange.value = String(this.currentDpi);
    this.renderPage();
  }

  private updateControls() {
    const count = this.doc?.page_count() ?? 0;
    this.pageInfo.setText(`${this.currentPage + 1} / ${count}`);
    this.prevBtn.disabled = this.currentPage === 0;
    this.nextBtn.disabled = this.currentPage >= count - 1;
  }

  private async renderPage() {
    if (!this.doc) return;
    const page: WasmPage = this.doc.page(this.currentPage);
    const w = page.width_at(this.currentDpi);
    const h = page.height_at(this.currentDpi);
    await new Promise(r => setTimeout(r, 0));
    const pixels = page.render(this.currentDpi);
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.getContext('2d')!.putImageData(new ImageData(pixels, w, h), 0, 0);
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export default class DjVuPlugin extends Plugin {
  async onload() {
    await init();

    this.registerView(DJVU_VIEW_TYPE, leaf => new DjVuView(leaf, this.app));
    this.registerExtensions(['djvu'], DJVU_VIEW_TYPE);
  }

  async onunload() {}
}
