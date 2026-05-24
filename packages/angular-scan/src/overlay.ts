import { FpsMeter } from './fps';
import type { AngularRenderCycle, AngularRenderEntry, AngularScanResolvedOptions } from './types';

const HIGHLIGHT_STROKE = [147, 197, 253] as const;
const HIGHLIGHT_GLOW = [216, 180, 254] as const;
const LABEL_BACKGROUND = [124, 58, 237] as const;

interface ActiveHighlight {
  entry: AngularRenderEntry;
  expiresAt: number;
  rect: DOMRect;
}

const TOOLBAR_CSS = `
  :host { all: initial; }
  .toolbar {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid rgba(15, 23, 42, 0.14);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
    color: #111827;
    font: 500 12px/1.2 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: auto;
    backdrop-filter: blur(12px);
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 78px;
    cursor: pointer;
    user-select: none;
  }
  .switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .track {
    position: relative;
    width: 34px;
    height: 20px;
    border-radius: 999px;
    background: #cbd5e1;
    transition: background 140ms ease;
  }
  .track::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: #ffffff;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.25);
    transition: transform 140ms ease;
  }
  input:checked + .track {
    background: #7c3aed;
  }
  input:checked + .track::after {
    transform: translateX(14px);
  }
  .switch-text {
    color: #111827;
    font-weight: 700;
  }
  .metric { display: grid; gap: 2px; min-width: 54px; }
  .label { color: #64748b; font-size: 10px; text-transform: uppercase; }
  .value { color: #111827; white-space: nowrap; }
`;

export class AngularScanOverlay {
  private readonly host = document.createElement('angular-scan-overlay');
  private readonly shadow = this.host.attachShadow({ mode: 'open' });
  private readonly canvas = document.createElement('canvas');
  private readonly context = this.canvas.getContext('2d');
  private readonly fps = new FpsMeter();
  private raf = 0;
  private latestFps = 0;
  private lastFpsSampleAt = 0;
  private lastToolbarHtml = '';
  private latestCycle?: AngularRenderCycle;
  private highlights: Array<{ entry: AngularRenderEntry; expiresAt: number }> = [];
  private options: AngularScanResolvedOptions;

  constructor(options: AngularScanResolvedOptions, private readonly onToggle: (enabled: boolean) => void) {
    this.options = options;
    this.host.style.pointerEvents = 'none';
    this.canvas.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483646',
      'pointer-events:none'
    ].join(';');
    this.shadow.innerHTML = `<style>${TOOLBAR_CSS}</style><div id="toolbar"></div>`;
    document.documentElement.append(this.canvas, this.host);
    this.resize();
    window.addEventListener('resize', this.resize);
    this.loop();
  }

  updateOptions(options: AngularScanResolvedOptions): void {
    this.options = options;
    this.renderToolbar();
  }

  showCycle(cycle: AngularRenderCycle): void {
    this.latestCycle = cycle;
    const ttl = this.options.animationSpeed === 'slow' ? 1200 : this.options.animationSpeed === 'fast' ? 520 : 0;
    if (ttl > 0 && this.options.enabled) {
      const expiresAt = performance.now() + ttl;
      this.highlights.push(...cycle.entries.map((entry) => ({ entry, expiresAt })));
    }
    this.renderToolbar();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.host.remove();
    this.canvas.remove();
  }

  private readonly resize = (): void => {
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(window.innerWidth * ratio);
    this.canvas.height = Math.floor(window.innerHeight * ratio);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  private readonly loop = (): void => {
    this.fps.mark();
    const now = performance.now();
    if (now - this.lastFpsSampleAt >= 500) {
      this.latestFps = this.fps.value;
      this.lastFpsSampleAt = now;
      this.renderToolbar();
    }
    this.paint();
    this.raf = requestAnimationFrame(this.loop);
  };

  private paint(): void {
    if (!this.context) {
      return;
    }

    this.context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (!this.options.enabled || this.options.animationSpeed === 'off') {
      this.highlights = [];
      return;
    }

    const now = performance.now();
    const activeHighlights = this.getActiveHighlights(now);
    const labelledIds = this.getLabelledEntryIds(activeHighlights);

    for (const { entry, expiresAt, rect } of activeHighlights) {
      const alpha = Math.max(0.18, Math.min(1, (expiresAt - now) / 520));
      this.drawOutline(rect, alpha);

      if (labelledIds.has(entry.id)) {
        this.drawLabel(entry, rect, alpha);
      }
    }
  }

  private getActiveHighlights(now: number): ActiveHighlight[] {
    this.highlights = this.highlights.filter((highlight) => highlight.expiresAt > now && highlight.entry.element.isConnected);

    return this.highlights.flatMap((highlight) => {
      const rect = highlight.entry.element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return [];
      }

      return [{ ...highlight, rect }];
    }).sort((a, b) => area(b.rect) - area(a.rect));
  }

  private getLabelledEntryIds(highlights: ActiveHighlight[]): Set<string> {
    const labelled = new Set<string>();

    for (const highlight of highlights) {
      const containsAnotherUpdatedComponent = highlights.some((candidate) => {
        return candidate.entry.id !== highlight.entry.id && containsRect(highlight.rect, candidate.rect);
      });

      if (!containsAnotherUpdatedComponent) {
        labelled.add(highlight.entry.id);
      }
    }

    return labelled;
  }

  private drawOutline(rect: DOMRect, alpha: number): void {
    if (!this.context) {
      return;
    }

    this.context.shadowColor = rgba(HIGHLIGHT_GLOW, Math.min(0.45, alpha));
    this.context.shadowBlur = 16;
    this.context.strokeStyle = rgba(HIGHLIGHT_STROKE, alpha);
    this.context.lineWidth = 2;
    this.context.strokeRect(rect.left, rect.top, rect.width, rect.height);
    this.context.shadowBlur = 0;
  }

  private drawLabel(entry: AngularRenderEntry, rect: DOMRect, alpha: number): void {
    if (!this.context) {
      return;
    }

    this.context.fillStyle = rgba(LABEL_BACKGROUND, Math.min(0.9, alpha + 0.1));
    this.context.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    const maxLabelWidth = Math.max(56, Math.min(rect.width, window.innerWidth - rect.left - 8));
    const label = truncateText(
      this.context,
      `${entry.name}  #${entry.count}  ${entry.latestDuration.toFixed(1)}ms`,
      maxLabelWidth - 10
    );
    const labelWidth = Math.min(this.context.measureText(label).width + 14, maxLabelWidth);
    const labelX = Math.max(4, Math.min(rect.left + 4, window.innerWidth - labelWidth - 4));
    const labelY = Math.max(6, rect.top + 4);
    this.context.fillRect(labelX, labelY, labelWidth, 18);
    this.context.fillStyle = '#ffffff';
    this.context.fillText(label, labelX + 7, labelY + 13, labelWidth - 10);
  }

  private renderToolbar(): void {
    const toolbar = this.shadow.getElementById('toolbar');
    if (!toolbar) {
      return;
    }

    if (!this.options.showToolbar) {
      this.replaceToolbarHtml(toolbar, '');
      return;
    }

    const cycle = this.latestCycle;
    const displayedFps = this.latestFps || this.fps.value;
    this.replaceToolbarHtml(toolbar, `
      <div class="toolbar">
        <label class="switch">
          <input type="checkbox" ${this.options.enabled ? 'checked' : ''} aria-label="Angular Scan enabled" />
          <span class="track" aria-hidden="true"></span>
          <span class="switch-text">${this.options.enabled ? 'On' : 'Off'}</span>
        </label>
        ${this.metric('FPS', this.options.showFPS ? String(displayedFps) : '-')}
        ${this.metric('Cycle', cycle ? `${cycle.duration.toFixed(1)}ms` : '-')}
        ${this.metric('Count', cycle ? String(cycle.renderedCount) : '0')}
        ${this.metric('Slowest', cycle?.slowest ? cycle.slowest.name : '-')}
      </div>
    `);
    toolbar.querySelector('input')?.addEventListener('change', (event) => {
      this.onToggle((event.target as HTMLInputElement).checked);
    }, { once: true });
  }

  private metric(label: string, value: string): string {
    return `<span class="metric"><span class="label">${label}</span><span class="value">${value}</span></span>`;
  }

  private replaceToolbarHtml(toolbar: HTMLElement, html: string): void {
    if (this.lastToolbarHtml === html) {
      return;
    }

    this.lastToolbarHtml = html;
    toolbar.innerHTML = html;
  }
}

function rgba(color: readonly [number, number, number], alpha: number): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function area(rect: DOMRect): number {
  return rect.width * rect.height;
}

function containsRect(outer: DOMRect, inner: DOMRect): boolean {
  const tolerance = 1;
  return inner.left >= outer.left - tolerance
    && inner.top >= outer.top - tolerance
    && inner.right <= outer.right + tolerance
    && inner.bottom <= outer.bottom + tolerance;
}

function truncateText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) {
    return text;
  }

  const ellipsis = '...';
  let next = text;
  while (next.length > 0 && context.measureText(`${next}${ellipsis}`).width > maxWidth) {
    next = next.slice(0, -1);
  }

  return next ? `${next}${ellipsis}` : ellipsis;
}
