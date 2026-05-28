import { FpsMeter } from './fps';
import { clearRecording, copyAIPrompt, getRecording } from '../../application/runtime';
import type { AngularRenderCycle, AngularRenderEntry, AngularRenderScanResolvedOptions } from '../../domain/entities';

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
    gap: 12px;
    padding: 8px 16px;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.85);
    box-shadow: 
      0 1px 3px rgba(0,0,0,0.02),
      0 10px 30px rgba(15, 23, 42, 0.08),
      inset 0 1px 0 rgba(255,255,255,0.6);
    color: #0f172a;
    font: 500 11px/1.2 Inter, system-ui, -apple-system, sans-serif;
    pointer-events: auto;
    backdrop-filter: blur(16px);
    cursor: grab;
    user-select: none;
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .toolbar:hover {
    border-color: rgba(15, 23, 42, 0.12);
    box-shadow: 
      0 2px 6px rgba(0,0,0,0.03),
      0 16px 40px rgba(15, 23, 42, 0.12);
  }
  .toolbar:active {
    cursor: grabbing;
  }
  .switch, .details-toggle, .clear-btn, .action-btn, .panel-close, .panel-copy-btn {
    cursor: pointer;
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 72px;
    user-select: none;
  }
  .details-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 8px;
    color: #475569;
    font: inherit;
    font-weight: 600;
    background: #f8fafc;
    user-select: none;
    transition: all 0.15s ease;
  }
  .details-toggle:hover {
    background: #f1f5f9;
    border-color: rgba(15, 23, 42, 0.15);
    color: #0f172a;
  }
  .details-toggle input {
    width: 13px;
    height: 13px;
    margin: 0;
    accent-color: #2563eb;
  }
  .details-toggle.active {
    border-color: rgba(37, 99, 235, 0.2);
    color: #2563eb;
    background: rgba(37, 99, 235, 0.05);
  }
  .switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .track {
    position: relative;
    width: 32px;
    height: 18px;
    border-radius: 999px;
    background: #e2e8f0;
    transition: background 0.15s ease;
  }
  .track::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.15);
    transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  }
  input:checked + .track {
    background: #2563eb;
  }
  input:checked + .track::after {
    transform: translateX(14px);
  }
  .switch-text {
    color: #0f172a;
    font-weight: 700;
  }
  .metric { display: grid; gap: 3px; min-width: 50px; }
  .label { color: #64748b; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
  .value { color: #0f172a; font-family: monospace; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .value.fps-drop { color: #ef4444; }
  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  [data-tooltip] {
    position: relative;
  }
  [data-tooltip]::after {
    content: attr(data-tooltip);
    position: absolute;
    left: 50%;
    bottom: calc(100% + 8px);
    z-index: 2147483647;
    width: max-content;
    max-width: 240px;
    transform: translateX(-50%) translateY(4px);
    padding: 6px 10px;
    border-radius: 8px;
    background: #0f172a;
    color: #ffffff;
    box-shadow: 0 10px 25px rgba(15, 23, 42, 0.12);
    font: 500 10px/1.35 Inter, system-ui, -apple-system, sans-serif;
    opacity: 0;
    pointer-events: none;
    white-space: normal;
    transition: opacity 120ms ease, transform 120ms ease;
  }
  [data-tooltip]::before {
    content: "";
    position: absolute;
    left: 50%;
    bottom: calc(100% + 3px);
    z-index: 2147483647;
    transform: translateX(-50%) translateY(4px);
    border: 5px solid transparent;
    border-top-color: #0f172a;
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease, transform 120ms ease;
  }
  [data-tooltip]:hover::after,
  [data-tooltip]:hover::before,
  [data-tooltip]:focus-within::after,
  [data-tooltip]:focus-within::before {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  .panel-actions [data-tooltip]::after {
    left: auto;
    right: 0;
    transform: translateY(4px);
  }
  .panel-actions [data-tooltip]::before {
    left: auto;
    right: 16px;
    transform: translateY(4px);
  }
  .panel-actions [data-tooltip]:hover::after,
  .panel-actions [data-tooltip]:hover::before,
  .panel-actions [data-tooltip]:focus-within::after,
  .panel-actions [data-tooltip]:focus-within::before {
    transform: translateY(0);
  }
  .clear-btn, .action-btn, .panel-close, .panel-copy-btn {
    background: #f8fafc;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 8px;
    padding: 6px 10px;
    font: inherit;
    font-weight: 600;
    color: #475569;
    transition: all 0.15s ease;
  }
  .clear-btn:hover, .action-btn:hover, .panel-close:hover, .panel-copy-btn:hover {
    background: #f1f5f9;
    border-color: rgba(15, 23, 42, 0.15);
    color: #0f172a;
    transform: translateY(-0.5px);
  }
  .clear-btn:active, .action-btn:active, .panel-close:active, .panel-copy-btn:active {
    transform: translateY(0);
  }
  .action-btn.active {
    border-color: rgba(37, 99, 235, 0.2);
    color: #2563eb;
    background: rgba(37, 99, 235, 0.05);
  }
  .status {
    color: #2563eb;
    font-size: 11px;
    font-weight: 700;
    min-width: 56px;
  }
  .inspect-panel {
    position: fixed;
    right: 16px;
    bottom: 72px;
    z-index: 2147483647;
    width: min(340px, calc(100vw - 32px));
    display: grid;
    gap: 12px;
    padding: 18px;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-top: 4px solid #3b82f6;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 
      0 1px 3px rgba(0,0,0,0.02),
      0 16px 40px rgba(15, 23, 42, 0.12),
      inset 0 1px 0 rgba(255,255,255,0.6);
    color: #0f172a;
    font: 500 11px/1.4 Inter, system-ui, -apple-system, sans-serif;
    pointer-events: auto;
    backdrop-filter: blur(16px);
    transition: border-top-color 0.2s ease;
  }
  .inspect-panel.slow { border-top-color: #ef4444; }
  .inspect-panel.medium { border-top-color: #f59e0b; }
  .inspect-panel.fast { border-top-color: #10b981; }
  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.04);
    padding-bottom: 10px;
  }
  .panel-title {
    font-size: 13px;
    font-weight: 800;
    color: #0f172a;
    overflow-wrap: anywhere;
  }
  .panel-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .severity {
    display: inline-flex;
    width: fit-content;
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    margin-top: 4px;
  }
  .severity.slow {
    color: #e11d48;
    background: rgba(225, 29, 72, 0.08);
    border: 1px solid rgba(225, 29, 72, 0.15);
  }
  .severity.medium {
    color: #d97706;
    background: rgba(217, 119, 6, 0.08);
    border: 1px solid rgba(217, 119, 6, 0.15);
  }
  .severity.fast {
    color: #059669;
    background: rgba(5, 150, 105, 0.08);
    border: 1px solid rgba(5, 150, 105, 0.15);
  }
  .panel-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    margin: 4px 0;
  }
  .panel-grid .panel-field {
    background: #f8fafc;
    border: 1px solid rgba(15, 23, 42, 0.05);
    border-radius: 8px;
    padding: 8px;
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 48px;
  }
  .panel-grid .panel-label {
    font-size: 8px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .panel-grid .panel-value {
    font-size: 11px;
    font-weight: 700;
    color: #0f172a;
    margin-top: 2px;
  }
  .inspect-panel .panel-field:not(.panel-grid .panel-field) {
    border-top: 1px solid rgba(15, 23, 42, 0.04);
    padding-top: 10px;
    display: grid;
    gap: 4px;
  }
  .inspect-panel .panel-label {
    color: #64748b;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .inspect-panel .panel-value {
    color: #0f172a;
    font-size: 11px;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .panel-list {
    display: grid;
    gap: 8px;
    margin-top: 4px;
  }
  .rec-card {
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid rgba(15, 23, 42, 0.05);
    border-left: 3px solid #3b82f6;
    background: #f8fafc;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: all 0.15s ease;
  }
  .rec-card:hover {
    border-color: rgba(15, 23, 42, 0.1);
    transform: translateY(-0.5px);
  }
  .rec-card.slow {
    border-left-color: #ef4444;
    background: rgba(239, 68, 68, 0.015);
  }
  .rec-card.medium {
    border-left-color: #f59e0b;
    background: rgba(245, 158, 11, 0.015);
  }
  .rec-card.fast {
    border-left-color: #10b981;
    background: rgba(16, 185, 129, 0.015);
  }
  .rec-category {
    font-size: 8px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .rec-card.slow .rec-category { color: #e11d48; }
  .rec-card.medium .rec-category { color: #d97706; }
  .rec-card.fast .rec-category { color: #059669; }
  .rec-action {
    font-size: 11px;
    line-height: 1.45;
    color: #334155;
    font-weight: 500;
    margin: 0;
  }
`;

export class AngularRenderScanOverlay {
  private readonly host = document.createElement('angular-render-scan-overlay');
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
  private options: AngularRenderScanResolvedOptions;
  private selectedEntry?: AngularRenderEntry;
  private hoveredEntry?: AngularRenderEntry;
  private hoveredRect?: DOMRect;
  private detailsMode = false;
  private copyStatus = '';
  private copyStatusTimer = 0;

  private toolbarX = 16;
  private toolbarY = 16;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;

  constructor(options: AngularRenderScanResolvedOptions, private readonly onToggle: (enabled: boolean) => void) {
    this.options = options;
    this.host.style.pointerEvents = 'none';
    this.canvas.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483646',
      'pointer-events:none'
    ].join(';');
    this.shadow.innerHTML = `<style>${TOOLBAR_CSS}</style><div id="toolbar-container"></div>`;
    document.documentElement.append(this.canvas, this.host);
    this.resize();
    window.addEventListener('resize', this.resize);
    this.loop();
    this.setupDragListeners();
  }

  private setupDragListeners(): void {
    this.globalMoveListener = (e: MouseEvent) => {
      if (!this.detailsMode || !this.options.enabled) {
        this.hoveredEntry = undefined;
        this.hoveredRect = undefined;
        return;
      }

      if (this.isOverlayTarget(e.target)) {
        return;
      }

      const hovered = this.findClickedEntry(e.clientX, e.clientY);
      this.hoveredEntry = hovered?.entry;
      this.hoveredRect = hovered?.rect;
    };

    this.globalClickListener = (e: MouseEvent) => {
      if (!this.detailsMode && !e.metaKey && !e.ctrlKey) return;
      if (!this.options.enabled) return;
      if (this.isOverlayTarget(e.target)) return;

      const x = e.clientX;
      const y = e.clientY;
      const clicked = this.findClickedEntry(x, y) ?? (this.hoveredEntry && this.hoveredRect ? {
        entry: this.hoveredEntry,
        rect: this.hoveredRect,
        expiresAt: 0
      } : undefined);

      if (clicked) {
        e.preventDefault();
        e.stopPropagation();
        this.selectedEntry = clicked.entry;
        this.renderToolbar();
        
        const globalNg = (window as any).ng;
        if (globalNg && globalNg.getComponent) {
          const component = globalNg.getComponent(clicked.entry.element);
          console.info(`[angular-render-scan] Inspecting <${clicked.entry.name}>:`, component || clicked.entry.element);
        } else {
          console.info(`[angular-render-scan] Inspecting <${clicked.entry.name}> element:`, clicked.entry.element);
        }
      }
    };
    
    document.addEventListener('mousemove', this.globalMoveListener, { passive: true, capture: true });
    document.addEventListener('click', this.globalClickListener, { capture: true });
    
    // Add cleanup to destroy method later...
    
    const handleDragStart = (e: Event) => {
      const event = e as MouseEvent | TouchEvent;
      const target = event.target as HTMLElement;
      if (target.closest('.switch') || target.closest('.clear-btn') || target.closest('.action-btn') || target.closest('.panel-close')) {
        return; // Don't drag if clicking buttons
      }
      const toolbar = this.shadow.querySelector('.toolbar');
      if (target.closest('.toolbar')) {
        this.isDragging = true;
        const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
        const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
        this.dragStartX = clientX - (window.innerWidth - this.toolbarX);
        this.dragStartY = clientY - (window.innerHeight - this.toolbarY);
      }
    };

    const handleDragMove = (e: MouseEvent | TouchEvent) => {
      if (!this.isDragging) return;
      e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      const toolbar = this.shadow.querySelector('.toolbar') as HTMLElement;
      if (toolbar) {
        const rect = toolbar.getBoundingClientRect();
        this.toolbarX = window.innerWidth - (clientX - this.dragStartX);
        this.toolbarY = window.innerHeight - (clientY - this.dragStartY);
        
        // Bounds checking
        this.toolbarX = Math.max(16, Math.min(this.toolbarX, window.innerWidth - rect.width - 16));
        this.toolbarY = Math.max(16, Math.min(this.toolbarY, window.innerHeight - rect.height - 16));
        
        toolbar.style.right = `${this.toolbarX}px`;
        toolbar.style.bottom = `${this.toolbarY}px`;
      }
    };

    const handleDragEnd = () => {
      this.isDragging = false;
    };

    this.shadow.addEventListener('mousedown', handleDragStart);
    window.addEventListener('mousemove', handleDragMove, { passive: false });
    window.addEventListener('mouseup', handleDragEnd);
    
    this.shadow.addEventListener('touchstart', handleDragStart, { passive: true });
    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('touchend', handleDragEnd);
  }

  updateOptions(options: AngularRenderScanResolvedOptions): void {
    this.options = options;
    this.renderToolbar();
  }

  showCycle(cycle: AngularRenderCycle): void {
    this.latestCycle = cycle;
    const ttl = this.highlightTtl();
    if (ttl > 0 && this.options.enabled) {
      const expiresAt = performance.now() + ttl;
      this.highlights.push(...cycle.entries.map((entry) => ({ entry, expiresAt })));
    }
    this.renderToolbar();
  }

  private globalClickListener?: (e: MouseEvent) => void;
  private globalMoveListener?: (e: MouseEvent) => void;

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    if (this.globalClickListener) {
      document.removeEventListener('click', this.globalClickListener, { capture: true });
    }
    if (this.globalMoveListener) {
      document.removeEventListener('mousemove', this.globalMoveListener, { capture: true });
    }
    window.clearTimeout(this.copyStatusTimer);
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
    const labelledIds = this.getLabelledEntryIds(activeHighlights).slice(0, this.options.maxLabelCount);

    // Sort activeHighlights so parents are drawn first, then children, ensuring child labels stay on top if overlapping
    // We already sort by area descending in getActiveHighlights, which is good.

    const fadeDuration = this.highlightTtl() || 1;
    for (const { entry, expiresAt, rect } of activeHighlights) {
      const alpha = Math.max(0.18, Math.min(1, (expiresAt - now) / fadeDuration));
      
      this.drawOutline(rect, alpha, entry.latestDuration);

      if (labelledIds.includes(entry.id)) {
        this.drawLabel(entry, rect, alpha, entry.latestDuration);
      }
    }

    if (this.detailsMode && this.hoveredEntry && this.hoveredRect) {
      this.drawHoverTarget(this.hoveredRect, this.hoveredEntry.latestDuration);
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

  private findClickedEntry(x: number, y: number): ActiveHighlight | undefined {
    const activeHighlights = this.getActiveHighlights(performance.now());
    const activeMatch = this.smallestContainingHighlight(activeHighlights, x, y);
    if (activeMatch) {
      return activeMatch;
    }

    const latestHighlights = this.latestCycle?.entries.flatMap((entry) => {
      if (!entry.element.isConnected) {
        return [];
      }
      const rect = entry.element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return [];
      }
      return [{ entry, rect, expiresAt: 0 }];
    }) ?? [];

    return this.smallestContainingHighlight(latestHighlights, x, y);
  }

  private smallestContainingHighlight(highlights: ActiveHighlight[], x: number, y: number): ActiveHighlight | undefined {
    return highlights
      .filter((highlight) => x >= highlight.rect.left && x <= highlight.rect.right && y >= highlight.rect.top && y <= highlight.rect.bottom)
      .sort((a, b) => area(a.rect) - area(b.rect))[0];
  }

  private highlightTtl(): number {
    if (this.options.animationSpeed === 'slow') {
      return 2400;
    }
    if (this.options.animationSpeed === 'fast') {
      return 1200;
    }
    return 0;
  }

  private getLabelledEntryIds(highlights: ActiveHighlight[]): string[] {
    return highlights
      .slice()
      .sort((a, b) => b.entry.latestDuration - a.entry.latestDuration)
      .map((highlight) => highlight.entry.id);
  }

  private getColorForDuration(duration: number, type: 'stroke' | 'bg'): readonly [number, number, number] {
    const { theme } = this.options;
    if (duration >= this.options.slowThresholdMs) return type === 'bg' ? theme.labelBackgroundSlow! : theme.slow!;
    if (duration > this.options.fastThresholdMs) return type === 'bg' ? theme.labelBackground! : theme.medium!;
    return type === 'bg' ? theme.labelBackground! : theme.fast!;
  }

  private drawOutline(rect: DOMRect, alpha: number, duration: number): void {
    if (!this.context) {
      return;
    }

    const strokeColor = this.getColorForDuration(duration, 'stroke');
    const glowColor = strokeColor; // Use the same color for glow but with alpha

    this.context.shadowColor = rgba(glowColor, Math.min(0.45, alpha));
    this.context.shadowBlur = 16;
    this.context.strokeStyle = rgba(strokeColor, alpha);
    this.context.lineWidth = 2;
    this.context.strokeRect(rect.left, rect.top, rect.width, rect.height);
    this.context.shadowBlur = 0;
  }

  private drawHoverTarget(rect: DOMRect, duration: number): void {
    if (!this.context) {
      return;
    }

    const color = this.getColorForDuration(duration, 'stroke');
    this.context.save();
    this.context.strokeStyle = rgba(color, 0.95);
    this.context.lineWidth = 3;
    this.context.setLineDash([6, 4]);
    this.context.strokeRect(rect.left, rect.top, rect.width, rect.height);
    this.context.restore();
  }

  private drawLabel(entry: AngularRenderEntry, rect: DOMRect, alpha: number, duration: number): void {
    if (!this.context) {
      return;
    }

    const bgColor = this.getColorForDuration(duration, 'bg');

    this.context.fillStyle = rgba(bgColor, Math.min(0.9, alpha + 0.1));
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
    const container = this.shadow.getElementById('toolbar-container');
    if (!container) {
      return;
    }

    if (!this.options.showToolbar) {
      this.replaceToolbarHtml(container, '');
      return;
    }

    const cycle = this.latestCycle;
    const displayedFps = this.latestFps || this.fps.value;
    const htmlChanged = this.replaceToolbarHtml(container, `
      ${this.inspectPanelHtml()}
      <div class="toolbar" style="right: ${this.toolbarX}px; bottom: ${this.toolbarY}px;">
        <label class="switch">
          <input type="checkbox" ${this.options.enabled ? 'checked' : ''} aria-label="Angular Render Scan enabled" />
          <span class="track" aria-hidden="true"></span>
          <span class="switch-text">${this.options.enabled ? 'On' : 'Off'}</span>
        </label>
        ${this.metric('FPS', this.options.showFPS ? String(displayedFps) : '-', this.getFpsClass(displayedFps))}
        ${this.metric('Cycle', cycle ? `${cycle.duration.toFixed(1)}ms` : '-')}
        ${this.metric('Count', cycle ? String(cycle.renderedCount) : '0')}
        ${this.metric('Slowest', cycle?.slowest ? cycle.slowest.name : '-')}
        <span class="toolbar-actions">
          <!-- Recording and export controls are intentionally hidden; the slow-issues prompt carries the needed context. -->
          <label class="details-toggle ${this.detailsMode ? 'active' : ''}" data-tooltip="Check Details, hover a captured component to highlight it, then click to pin its recommendation panel. Uncheck to clear the panel.">
            <input class="details-checkbox" type="checkbox" ${this.detailsMode ? 'checked' : ''} aria-label="Enable component details panel" />
            <span>Details</span>
          </label>
          ${this.options.showCopyPrompt ? '<button class="action-btn copy-prompt-btn" aria-label="Copy prompt for slow render issues" data-tooltip="Copy an AI-ready prompt with only the captured slow/error component issues and their runtime evidence.">Copy AI Fix Prompt</button>' : ''}
          <button class="clear-btn" aria-label="Clear stats">Clear</button>
        </span>
        <span class="status" aria-live="polite">${escapeHtml(this.copyStatus)}</span>
      </div>
    `);
    
    if (!htmlChanged) {
      return;
    }
    
    const toolbarEl = container.querySelector('.toolbar');
    
    toolbarEl?.querySelector('input')?.addEventListener('change', (event) => {
      this.onToggle((event.target as HTMLInputElement).checked);
    }, { once: true });
    
    toolbarEl?.querySelector('.clear-btn')?.addEventListener('click', () => {
      import('../../application/stats').then(m => {
        m.clearStats();
        clearRecording();
        this.latestCycle = undefined;
        this.highlights = [];
        this.selectedEntry = undefined;
        this.hoveredEntry = undefined;
        this.hoveredRect = undefined;
        this.renderToolbar();
      });
    }, { once: true });

    toolbarEl?.querySelector('.details-checkbox')?.addEventListener('change', (event) => {
      this.detailsMode = (event.target as HTMLInputElement).checked;
      this.hoveredEntry = undefined;
      this.hoveredRect = undefined;
      if (!this.detailsMode) {
        this.selectedEntry = undefined;
      }
      this.renderToolbar();
    }, { once: true });

    toolbarEl?.querySelector('.copy-prompt-btn')?.addEventListener('click', async () => {
      const copied = await copyAIPrompt(this.latestFps || this.fps.value);
      this.setCopyStatus(copied ? 'Copied' : this.latestCycle ? 'Copy failed' : 'No render data');
    }, { once: true });

    container.querySelector('.panel-close')?.addEventListener('click', () => {
      this.selectedEntry = undefined;
      this.renderToolbar();
    }, { once: true });

    container.querySelector('.panel-copy-btn')?.addEventListener('click', async () => {
      if (!this.selectedEntry) {
        return;
      }
      const copied = await this.copyComponentPrompt(this.selectedEntry, this.latestFps || this.fps.value);
      this.setCopyStatus(copied ? 'Copied' : 'Copy failed');
    }, { once: true });
  }

  private metric(label: string, value: string, extraClass = ''): string {
    return `<span class="metric"><span class="label">${label}</span><span class="value ${extraClass}">${value}</span></span>`;
  }

  private getFpsClass(fps: number): string {
    if (!this.options.showFPS || fps === 0) {
      return '';
    }
    return fps < 50 ? 'fps-drop' : '';
  }

  private replaceToolbarHtml(toolbar: HTMLElement, html: string): boolean {
    if (this.lastToolbarHtml === html) {
      return false;
    }

    this.lastToolbarHtml = html;
    toolbar.innerHTML = html;
    return true;
  }

  private inspectPanelHtml(): string {
    const entry = this.selectedEntry;
    if (!entry) {
      return '';
    }

    const recentCycles = getRecording()
      .filter((cycle) => cycle.entries.some((candidate) => candidate.id === entry.id))
      .slice(-5)
      .map((cycle) => `#${cycle.id} ${cycle.entries.find((candidate) => candidate.id === entry.id)?.latestDuration.toFixed(1)}ms`);
    const isSlow = entry.latestDuration >= this.options.slowThresholdMs;
    const severity = this.severityFor(entry);
    const cost = this.costFor(entry);
    const recommendations = this.recommendationsFor(entry);
    const changedInputs = entry.changedInputs?.length
      ? entry.changedInputs.map((input) => `${escapeHtml(input.name)}: ${escapeHtml(input.previous)} -> ${escapeHtml(input.current)}`).join('<br>')
      : '-';

    return `
      <section class="inspect-panel ${severity.kind}" style="right: ${this.toolbarX}px; bottom: ${this.toolbarY + 60}px;" aria-label="Component recommendation panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">${escapeHtml(entry.name)}</div>
            <span class="severity ${severity.kind}">${escapeHtml(severity.label)}</span>
          </div>
          <div class="panel-actions">
            ${isSlow ? '<button class="panel-copy-btn" aria-label="Copy prompt for this slow component issue" data-tooltip="Copy an AI-ready prompt scoped only to this slow component and its local evidence.">Copy AI Fix Prompt</button>' : ''}
            <button class="panel-close" aria-label="Close component details">Close</button>
          </div>
        </div>
        <div class="panel-grid">
          ${this.panelField('Latest', `${entry.latestDuration.toFixed(1)}ms`)}
          ${this.panelField('Average', `${entry.averageDuration.toFixed(1)}ms`)}
          ${this.panelField('Count', String(entry.count))}
          ${this.panelField('Reason', entry.reason ?? 'unknown')}
          ${this.panelField('Selector', entry.selector ?? '-')}
          ${this.panelField('Cycle', `#${entry.latestCycleId}`)}
        </div>
        <div class="panel-field">
          <span class="panel-label">Estimated cost</span>
          <span class="panel-value">${escapeHtml(cost)}</span>
        </div>
        <div class="panel-field">
          <span class="panel-label">Changed inputs</span>
          <span class="panel-value">${changedInputs}</span>
        </div>
        <div class="panel-field">
          <span class="panel-label">Recent cycles</span>
          <span class="panel-value">${recentCycles.length > 0 ? escapeHtml(recentCycles.join(', ')) : '-'}</span>
        </div>
        <div class="panel-field">
          <span class="panel-label">Recommendations</span>
          <span class="panel-list">
            ${recommendations.map((rec) => `
              <div class="rec-card ${rec.severity}">
                <span class="rec-category">${escapeHtml(rec.category)}</span>
                <p class="rec-action">${escapeHtml(rec.action)}</p>
              </div>
            `).join('')}
          </span>
        </div>
      </section>
    `;
  }

  private panelField(label: string, value: string): string {
    return `<span class="panel-field"><span class="panel-label">${escapeHtml(label)}</span><span class="panel-value">${escapeHtml(value)}</span></span>`;
  }

  private setCopyStatus(status: string): void {
    this.copyStatus = status;
    window.clearTimeout(this.copyStatusTimer);
    this.renderToolbar();
    this.copyStatusTimer = window.setTimeout(() => {
      this.copyStatus = '';
      this.renderToolbar();
    }, 1800);
  }

  private isOverlayTarget(target: EventTarget | null): boolean {
    return target instanceof Node && this.host.contains(target);
  }

  private severityFor(entry: AngularRenderEntry): { kind: 'slow' | 'medium' | 'fast'; label: string } {
    if (entry.latestDuration >= this.options.slowThresholdMs) {
      return { kind: 'slow', label: 'Slow issue' };
    }
    if (entry.latestDuration > this.options.fastThresholdMs) {
      return { kind: 'medium', label: 'Watch' };
    }
    return { kind: 'fast', label: 'Healthy' };
  }

  private costFor(entry: AngularRenderEntry): string {
    const cycleDuration = this.latestCycle?.duration ?? 0;
    const cycleShare = cycleDuration > 0 ? Math.round((entry.latestDuration / cycleDuration) * 100) : 0;
    const totalCost = entry.averageDuration * entry.count;
    return `${entry.latestDuration.toFixed(1)}ms latest, ${cycleShare}% of latest cycle, about ${totalCost.toFixed(1)}ms observed across ${entry.count} renders`;
  }

  private recommendationsFor(entry: AngularRenderEntry): Array<{ category: string; action: string; severity: 'slow' | 'medium' | 'fast' }> {
    const recommendations: Array<{ category: string; action: string; severity: 'slow' | 'medium' | 'fast' }> = [];
    if (entry.latestDuration >= this.options.slowThresholdMs) {
      recommendations.push({
        category: 'Threshold Spike',
        action: `Exceeded the slow threshold by ${(entry.latestDuration - this.options.slowThresholdMs).toFixed(1)}ms. Audit template calculations, expensive computed values, or blocking synchronous logic in this component.`,
        severity: 'slow'
      });
    }
    if (entry.reason === 'input' || entry.changedInputs?.length) {
      const inputNames = entry.changedInputs?.map((input) => input.name).join(', ') || 'unspecified inputs';
      recommendations.push({
        category: 'Unstable Inputs',
        action: `Re-rendered due to input changes: [${inputNames}]. Check if parent passes new object/array/function references during change detection; use stable signals or memoization.`,
        severity: 'medium'
      });
    }
    if (entry.count > 5) {
      recommendations.push({
        category: 'Render Fatigue',
        action: `Checked ${entry.count} times. Audit local subscriptions, interval timers, or event bindings triggering frequent CD ticks.`,
        severity: 'medium'
      });
    }
    const isRepeated = entry.selector?.includes('item') || entry.selector?.includes('card') || 
                      entry.name.toLowerCase().includes('item') || entry.name.toLowerCase().includes('card');
    if (isRepeated) {
      recommendations.push({
        category: 'Repeated Node',
        action: `Looks like an iterated list node. Verify track expressions in @for blocks and avoid editing unchanged items.`,
        severity: 'fast'
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        category: 'Optimal Performance',
        action: `Component is currently healthy. Verify that it is not checked on unrelated parent events by enforcing ChangeDetectionStrategy.OnPush.`,
        severity: 'fast'
      });
    }
    return recommendations;
  }

  private async copyComponentPrompt(entry: AngularRenderEntry, fps?: number): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(this.componentPrompt(entry, fps));
      return true;
    } catch {
      return false;
    }
  }

  private componentPrompt(entry: AngularRenderEntry, fps?: number): string {
    const recentCycles = getRecording()
      .filter((cycle) => cycle.entries.some((candidate) => candidate.id === entry.id))
      .slice(-8)
      .map((cycle) => {
        const match = cycle.entries.find((candidate) => candidate.id === entry.id);
        return `- **Cycle #${cycle.id}**: Component rendered in \`${match?.latestDuration.toFixed(1)}ms\`, total cycle time \`${cycle.duration.toFixed(1)}ms\`, total rendered components: \`${cycle.renderedCount}\``;
      });
    const changedInputs = entry.changedInputs?.length
      ? entry.changedInputs.map((input) => `- \`${input.name}\`: \`${input.previous}\` -> \`${input.current}\``).join('\n')
      : '- none captured';

    return [
      '# ⚡️ Component Performance Optimization Request (via angular-render-scan)',
      'I need help fixing one slow/error Angular component found by angular-render-scan. This prompt is scoped to only this component and its local evidence.',
      '',
      '---',
      '',
      '## 📊 Telemetry Diagnostics',
      'Below is the diagnostic telemetry data captured for this component:',
      `* **Component Class:** \`${entry.name}\``,
      `* **Selector:** \`${entry.selector ?? '-'}\``,
      `* **Performance Severity:** **${this.severityFor(entry).label}**`,
      `* **Trigger / Reason for Render:** \`${entry.reason ?? 'unknown'}\``,
      `* **Latest render duration:** \`${entry.latestDuration.toFixed(1)}ms\``,
      `* **Average render duration:** \`${entry.averageDuration.toFixed(1)}ms\``,
      `* **Total captured renders:** ${entry.count}`,
      `* **Configured Thresholds:** Fast <= \`${this.options.fastThresholdMs.toFixed(1)}ms\` | Slow >= \`${this.options.slowThresholdMs.toFixed(1)}ms\``,
      `* **Estimated cost:** ${this.costFor(entry)}`,
      typeof fps === 'number' && Number.isFinite(fps) ? `* **FPS during performance spike:** \`${fps} FPS\`` : '',
      '',
      '---',
      '',
      '## 📈 Input Mutations & Changed Properties',
      'The scanner detected the following property/input changes triggering change detection:',
      'Changed inputs:',
      changedInputs,
      '',
      'Recent cycles for this component:',
      ...(recentCycles.length > 0 ? recentCycles : ['- none captured']),
      '',
      '---',
      '',
      '## 🧠 Component-local recommendations from the scanner:',
      'The scanner automatically analyzed this component and surfaced the following optimization recommendations:',
      ...this.recommendationsFor(entry).map((rec) => `- **[${rec.category}]** ${rec.action}`),
      '',
      '---',
      '',
      '## 🛠️ Requested Refactoring Instructions',
      'You are a senior Angular performance engineer. Please suggest concrete optimization and refactoring steps for this component. Your goal is to drastically reduce its rendering cost and avoid redundant change detection cycles.',
      'Focus on the following modern Angular practices:',
      '1. **OnPush Change Detection Strategy:** Implement OnPush change detection to stop automatic parent-to-child render propagation.',
      '2. **Angular Signals Migration:** Convert class inputs (`@Input`), output emitters (`@Output`), and component states to reactive signals and derived `computed()` selectors.',
      '3. **Optimizing Templates:** Ensure templates do not execute expensive helper methods or getters by moving them to computed signals or component lifecycle caching.',
      '4. **Stable Object/Array References:** Avoid instantiating array or object literals inside templates or parent component templates that feed into this component\'s inputs.',
      '5. **Proper List Tracking:** Leverage optimized track expressions in `@for` control flow blocks.',
      '',
      'Please return highly descriptive explanations along with complete TypeScript and HTML code blocks illustrating the **Before (Current)** and **After (Optimized)** states of the component. Make all refactored code clean, robust, and ready for production!'
    ].filter(Boolean).join('\n');
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
