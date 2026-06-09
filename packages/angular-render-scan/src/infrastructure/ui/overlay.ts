import { FpsMeter } from "./fps";
import { CpuMeter } from "./cpu";
import { getAngularDebugSummary } from "./angular-debug";
import { RuntimeTelemetry } from "./runtime-telemetry";
import {
  clearRecording,
  copyAIPrompt,
  getRecording,
  getSessionData,
  getWastedStats,
  getLeakedComponents,
  getRegisteredComponents,
  getOnPushCandidates,
  getReferentialInstability,
  getZonePollutionEvents,
  getCdGraph,
} from "../../application/runtime";
import type {
  AngularRenderCycle,
  AngularRenderEntry,
  AngularRenderScanResolvedOptions,
  BudgetViolation,
  OnPushCandidate,
  ZonePollutionEvent,
  CdTriggerAttribution,
} from "../../domain/entities";

interface ActiveHighlight {
  entry: AngularRenderEntry;
  expiresAt: number;
  rect: DOMRect;
}

const TOOLBAR_POSITION_KEY = "angular-render-scan:toolbar-position";
const TOOLBAR_COMPACT_KEY = "angular-render-scan:toolbar-compact";

const TOOLBAR_CSS = `
  :host {
    all: initial;
    display: block;
    position: fixed;
    z-index: 2147483647;
    pointer-events: none;
    --ars-bg: rgba(255, 255, 255, 0.85);
    --ars-border: rgba(15, 23, 42, 0.08);
    --ars-color: #0f172a;
    --ars-label: #64748b;
    --ars-panel-bg: rgba(255, 255, 255, 0.96);
    --ars-card-bg: #f8fafc;
    --ars-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 10px 30px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255,255,255,0.6);
  }
  
  :host(.dark) {
    --ars-bg: rgba(15, 23, 42, 0.85);
    --ars-border: rgba(255, 255, 255, 0.1);
    --ars-color: #f8fafc;
    --ars-label: #94a3b8;
    --ars-panel-bg: rgba(15, 23, 42, 0.96);
    --ars-card-bg: #1e293b;
    --ars-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
  }

  .toolbar {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    width: auto;
    max-width: calc(100vw - 32px);
    padding: 5px;
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: 13px;
    background:
      linear-gradient(135deg, rgba(255,255,255,0.97), rgba(248,250,252,0.92)),
      var(--ars-bg);
    box-shadow:
      0 14px 36px rgba(15, 23, 42, 0.14),
      0 2px 6px rgba(15, 23, 42, 0.08),
      inset 0 1px 0 rgba(255,255,255,0.78);
    color: var(--ars-color);
    font: 500 11px/1.2 ui-sans-serif, system-ui, -apple-system, sans-serif;
    pointer-events: auto;
    backdrop-filter: blur(18px) saturate(1.25);
    cursor: grab;
    user-select: none;
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }
  :host(.dark) .toolbar {
    border-color: rgba(148, 163, 184, 0.18);
    background:
      linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.9)),
      var(--ars-bg);
    box-shadow:
      0 18px 44px rgba(0,0,0,0.48),
      inset 0 1px 0 rgba(255,255,255,0.08);
  }
  .toolbar:hover {
    border-color: rgba(37, 99, 235, 0.22);
    box-shadow:
      0 16px 40px rgba(15, 23, 42, 0.16),
      0 2px 8px rgba(15, 23, 42, 0.08),
      inset 0 1px 0 rgba(255,255,255,0.78);
  }
  .toolbar:active {
    cursor: grabbing;
  }
  .toolbar.disabled {
    opacity: 0.82;
    pointer-events: auto;
    cursor: grab;
  }
  .toolbar.disabled {
    gap: 0;
    padding: 5px;
    border-radius: 999px;
    box-shadow:
      0 8px 20px rgba(15, 23, 42, 0.12),
      inset 0 1px 0 rgba(255,255,255,0.7);
  }
  .toolbar-switch {
    display: inline-flex;
    align-items: center;
    padding: 4px 7px;
    border-radius: 9px;
    background: rgba(15, 23, 42, 0.045);
    box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.055);
    flex: 0 0 auto;
  }
  :host(.dark) .toolbar-switch {
    background: rgba(255, 255, 255, 0.06);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  }
  .toolbar.disabled .toolbar-switch {
    padding: 5px;
    border-radius: 999px;
    background: transparent;
    box-shadow: none;
    min-width: 0;
    gap: 6px;
  }
  .toolbar-main {
    display: flex;
    align-items: stretch;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
    max-width: calc(100vw - 230px);
    overflow: visible;
  }
  .toolbar.compact .toolbar-main {
    max-width: calc(100vw - 168px);
  }
  .toolbar-extended {
    display: flex;
    align-items: stretch;
    flex-wrap: wrap;
    gap: 4px;
  }
  .toolbar.compact .toolbar-extended {
    display: none;
  }
  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: flex-end;
    min-width: max-content;
    flex: 0 0 auto;
    padding-left: 2px;
    border-left: 1px solid rgba(15, 23, 42, 0.08);
  }
  :host(.dark) .toolbar-actions {
    border-left-color: rgba(255, 255, 255, 0.08);
  }
  .toolbar.compact .toolbar-actions {
    gap: 4px;
  }
  .toolbar-size-toggle {
    min-width: 30px;
    justify-content: center;
  }
  .toolbar-actions .toolbar-size-toggle {
    width: 30px;
    height: 30px;
    min-width: 30px;
    padding: 0;
  }
  .toolbar.compact .toolbar-size-toggle {
    min-width: 30px;
  }
  .toolbar-picker-toggle {
    display: inline-grid;
    place-items: center;
  }
  .toolbar-picker-toggle svg,
  .toolbar-size-toggle svg {
    width: 14px;
    height: 14px;
    display: block;
    stroke: currentColor;
  }
  .switch, .details-toggle, .clear-btn, .action-btn, .panel-close, .panel-copy-btn {
    cursor: pointer;
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 34px;
    user-select: none;
  }
  .details-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border: 1px solid rgba(37, 99, 235, 0.14);
    border-radius: 9px;
    color: var(--ars-label);
    font: inherit;
    font-weight: 600;
    background: rgba(37, 99, 235, 0.045);
    user-select: none;
    transition: all 0.15s ease;
  }
  .details-toggle:hover {
    background: rgba(37, 99, 235, 0.08);
    border-color: rgba(37, 99, 235, 0.24);
    color: #2563eb;
  }
  .details-toggle input {
    width: 13px;
    height: 13px;
    margin: 0;
    accent-color: #2563eb;
  }
  .details-toggle.active {
    border-color: rgba(37, 99, 235, 0.36);
    color: #2563eb;
    background: rgba(37, 99, 235, 0.1);
  }
  .switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .track {
    position: relative;
    width: 28px;
    height: 16px;
    border-radius: 999px;
    background: #e2e8f0;
    transition: background 0.15s ease;
  }
  .track::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.15);
    transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  }
  input:checked + .track {
    background: #2563eb;
  }
  input:checked + .track::after {
    transform: translateX(12px);
  }
  .switch-text {
    display: none;
    color: var(--ars-color);
    font-weight: 700;
  }
  .metric {
    display: grid;
    gap: 3px;
    min-width: 60px;
    flex: 0 0 auto;
    padding: 6px 7px;
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.62);
    box-shadow:
      inset 0 0 0 1px rgba(15, 23, 42, 0.055),
      inset 0 1px 0 rgba(255, 255, 255, 0.55);
    transition: background 0.15s ease, box-shadow 0.15s ease;
  }
  .metric:hover {
    background: rgba(255, 255, 255, 0.9);
    box-shadow:
      inset 0 0 0 1px rgba(37, 99, 235, 0.18),
      0 3px 8px rgba(15, 23, 42, 0.07);
  }
  :host(.dark) .metric {
    background: rgba(255, 255, 255, 0.055);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.075);
  }
  :host(.dark) .metric:hover {
    background: rgba(255, 255, 255, 0.09);
  }
  .metric.slowest-metric {
    min-width: 128px;
    max-width: 160px;
    flex: 0 0 140px;
  }
  .slowest-metric .value {
    display: block;
    width: 100%;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }
  .label { color: var(--ars-label); font-size: 8px; font-weight: 850; text-transform: uppercase; letter-spacing: 0.07em; }
  .value { color: var(--ars-color); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 850; white-space: nowrap; }
  .value.fps-drop { color: #ef4444; }
  .value.cpu-high { color: #ef4444; }
  .value.cpu-medium { color: #f59e0b; }
  .metric.cpu-interactive {
    cursor: pointer;
    transition: background 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
    border-radius: 9px;
    padding: 6px 7px;
    margin: 0;
    user-select: none;
    display: inline-grid;
    flex-direction: column;
    position: relative;
  }
  .metric.cpu-interactive:hover {
    background: rgba(37, 99, 235, 0.08);
    box-shadow:
      inset 0 0 0 1px rgba(37, 99, 235, 0.22),
      0 3px 8px rgba(15, 23, 42, 0.07);
  }
  .metric.cpu-interactive:active {
    transform: scale(0.97);
  }
  .metric.cpu-interactive.active {
    background: rgba(37, 99, 235, 0.08);
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.25);
  }
  .metric.cpu-interactive .value {
    border-bottom: 1.5px dotted rgba(37, 99, 235, 0.4);
    padding-bottom: 0.5px;
  }
  .metric.cpu-interactive:hover .value {
    border-bottom: 1.5px solid rgba(37, 99, 235, 0.8);
    color: #2563eb;
  }
  .cpu-details-panel {
    position: fixed;
    z-index: 2147483647;
    pointer-events: auto;
    width: 160px;
    background: var(--ars-panel-bg);
    border: 1px solid var(--ars-border);
    border-radius: 10px;
    padding: 10px;
    backdrop-filter: blur(16px);
    box-shadow: var(--ars-shadow);
    display: grid;
    gap: 6px;
    font-family: Inter, system-ui, -apple-system, sans-serif;
    color: var(--ars-color);
    transition: all 0.2s ease;
  }
  .cpu-details-panel .title {
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    color: var(--ars-label);
    border-bottom: 1px solid var(--ars-border);
    padding-bottom: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    letter-spacing: 0.05em;
  }
  .cpu-details-panel .row {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    font-weight: 500;
  }
  .cpu-details-panel .row-val {
    font-family: monospace;
    font-weight: 700;
  }
  .cpu-details-panel .row-val.low { color: #10b981; }
  .cpu-details-panel .row-val.medium { color: #f59e0b; }
  .cpu-details-panel .row-val.high { color: #ef4444; }
  
  .cpu-bar-bg {
    width: 100%;
    height: 4px;
    background: #e2e8f0;
    border-radius: 2px;
    overflow: hidden;
    margin: 2px 0;
  }
  .cpu-bar-fill {
    height: 100%;
    transition: width 0.2s ease, background-color 0.2s ease;
  }
  .cpu-bar-fill.low { background: #10b981; }
  .cpu-bar-fill.medium { background: #f59e0b; }
  .cpu-bar-fill.high { background: #ef4444; }

  .sparkline-toggle svg {
    width: 86px;
  }
  .diagnostic-chip .value {
    text-decoration: none !important;
  }
  .diagnostic-chip {
    min-width: 42px;
    padding-left: 7px;
    padding-right: 7px;
  }
  .graph-toggle.active,
  .sparkline-toggle.active,
  .details-toggle.active,
  .action-btn.active {
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.32);
  }
  @media (max-width: 720px) {
    .toolbar {
      width: calc(100vw - 32px);
      align-items: center;
    }
    .toolbar-main {
      max-width: none;
      flex: 1 1 auto;
      overflow: visible;
      padding-bottom: 1px;
    }
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
    background: rgba(15, 23, 42, 0.035);
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 9px;
    padding: 7px 10px;
    font: inherit;
    font-weight: 600;
    color: var(--ars-label);
    transition: all 0.15s ease;
  }
  .toolbar-actions .clear-btn,
  .toolbar-actions .action-btn,
  .toolbar-actions .details-toggle {
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 30px;
    min-width: 30px;
    padding: 0;
    font-size: 13px;
    line-height: 1;
  }
  .toolbar-actions svg {
    width: 14px;
    height: 14px;
    display: block;
    stroke: currentColor;
  }
  .toolbar-actions .details-toggle input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .clear-btn:hover, .action-btn:hover, .panel-close:hover, .panel-copy-btn:hover {
    background: rgba(37, 99, 235, 0.075);
    border-color: rgba(37, 99, 235, 0.2);
    color: #2563eb;
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
    position: absolute;
    bottom: calc(100% + 8px);
    right: 16px;
    z-index: 2147483647;
    color: #ffffff;
    background: #2563eb;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 6px;
    box-shadow: 
      0 1px 3px rgba(0,0,0,0.02),
      0 8px 20px rgba(37, 99, 235, 0.15);
    white-space: nowrap;
    pointer-events: none;
    animation: floatUp 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  @keyframes floatUp {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .inspect-panel {
    position: fixed;
    right: 16px;
    bottom: 72px;
    z-index: 2147483647;
    width: min(280px, calc(100vw - 32px));
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid var(--ars-border);
    border-top: 3px solid #3b82f6;
    border-radius: 10px;
    background: var(--ars-panel-bg);
    box-shadow: var(--ars-shadow);
    color: var(--ars-color);
    font: 500 10px/1.3 Inter, system-ui, -apple-system, sans-serif;
    pointer-events: auto;
    backdrop-filter: blur(16px);
    transition: border-top-color 0.2s ease;
    max-height: calc(100vh - 100px);
    overflow-y: auto;
  }
  .inspect-panel.slow { border-top-color: #ef4444; }
  .inspect-panel.medium { border-top-color: #f59e0b; }
  .inspect-panel.fast { border-top-color: #10b981; }
  .panel-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    border-bottom: 1px solid var(--ars-border);
    padding-bottom: 6px;
  }
  .panel-title {
    font-size: 12px;
    font-weight: 800;
    color: var(--ars-color);
    overflow-wrap: break-word;
    word-break: normal;
  }
  .panel-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-start;
    flex-shrink: 0;
  }
  .severity {
    display: inline-flex;
    width: fit-content;
    padding: 1px 6px;
    border-radius: 20px;
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    margin-top: 2px;
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    margin: 2px 0;
  }
  .panel-grid .panel-field {
    background: var(--ars-card-bg);
    border: 1px solid var(--ars-border);
    border-radius: 6px;
    padding: 4px;
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 36px;
    min-width: 0;
  }
  .panel-grid .panel-label {
    font-size: 8px;
    font-weight: 700;
    color: var(--ars-label);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .panel-grid .panel-value {
    font-size: 10px;
    font-weight: 700;
    color: var(--ars-color);
    margin-top: 1px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .inspect-panel .panel-field:not(.panel-grid .panel-field) {
    border-top: 1px solid var(--ars-border);
    padding-top: 6px;
    display: grid;
    gap: 2px;
  }
  .inspect-panel .panel-label {
    color: var(--ars-label);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .inspect-panel .panel-value {
    color: var(--ars-color);
    font-size: 11px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .panel-list {
    display: grid;
    gap: 6px;
    margin-top: 2px;
  }
  .rec-card {
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--ars-border);
    border-left: 3px solid #3b82f6;
    background: var(--ars-card-bg);
    display: flex;
    flex-direction: column;
    gap: 2px;
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
    font-size: 7.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .rec-card.slow .rec-category { color: #e11d48; }
  .rec-card.medium .rec-category { color: #d97706; }
  .rec-card.fast .rec-category { color: #059669; }
  .rec-action {
    font-size: 10px;
    line-height: 1.35;
    color: var(--ars-color);
    font-weight: 500;
    margin: 0;
  }


`;

export class AngularRenderScanOverlay {
  private readonly host = document.createElement("angular-render-scan-overlay");
  private readonly shadow = this.host.attachShadow({ mode: "open" });
  private readonly canvas = document.createElement("canvas");
  private readonly context = this.canvas.getContext("2d");
  private readonly fps = new FpsMeter();
  private readonly cpu = new CpuMeter(() => this.renderToolbar());
  private readonly runtimeTelemetry = new RuntimeTelemetry(() =>
    this.renderToolbar(),
  );
  private showCpuDetails = false;
  private raf = 0;
  private latestFps = 0;
  private lastFpsSampleAt = 0;
  private lastToolbarHtml = "";
  private latestCycle?: AngularRenderCycle;
  private highlights: Array<{ entry: AngularRenderEntry; expiresAt: number }> =
    [];
  private options: AngularRenderScanResolvedOptions;
  private selectedEntry?: AngularRenderEntry;
  private hoveredEntry?: AngularRenderEntry;
  private hoveredRect?: DOMRect;
  private detailsHoverCursorActive = false;
  private detailsMode = false;
  private copyStatus = "";
  private copyStatusTimer = 0;

  private toolbarX = 16;
  private toolbarY = 16;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;

  // New feature state
  private showOnPushPanel = false;
  private showZonePollutionPanel = false;
  private showGraphPanel = false;
  private graphCollapsed = false;
  private lastTrigger?: CdTriggerAttribution;
  private zonePollutionListener?: (e: Event) => void;

  private get slowThresholdMs(): number {
    return this.options.budgets?.warnMs ?? 10;
  }

  private get fastThresholdMs(): number {
    return (this.options.budgets?.warnMs ?? 10) / 2;
  }

  private readonly last30CycleDurations: Array<{
    duration: number;
    isSlow: boolean;
  }> = [];
  private budgetViolations: BudgetViolation[] = [];
  private showAlertsPanel = false;
  private showWaterfallPanel = false;
  private compactToolbar = true;
  private keyListener?: (e: KeyboardEvent) => void;
  private budgetViolationListener?: (e: Event) => void;

  constructor(
    options: AngularRenderScanResolvedOptions,
    private readonly onToggle: (enabled: boolean) => void,
  ) {
    this.options = options;
    this.restoreToolbarPosition();
    this.restoreToolbarCompact();
    const recorded = getRecording();
    if (recorded && recorded.length > 0) {
      this.latestCycle = recorded[recorded.length - 1];
      this.last30CycleDurations.push(
        ...recorded.slice(-30).map((c) => ({
          duration: c.duration,
          isSlow: c.duration >= this.slowThresholdMs,
        })),
      );
    }
    this.host.style.pointerEvents = "none";
    this.canvas.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483646",
      "pointer-events:none",
    ].join(";");
    this.shadow.innerHTML = `<style>${TOOLBAR_CSS}</style><div id="toolbar-container"></div>`;
    document.documentElement.append(this.canvas, this.host);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.loop();
    this.setupDragListeners();
    this.updateDarkMode();

    // Setup budget violation event listener
    this.budgetViolationListener = (e: any) => {
      if (e.detail) {
        this.addBudgetViolation(e.detail);
      }
    };
    window.addEventListener(
      "angular-render-scan:budget-violation",
      this.budgetViolationListener,
    );

    // Setup Zone pollution event listener
    this.zonePollutionListener = (_e: Event) => {
      // Just trigger a toolbar re-render to update the pollution badge count
      this.renderToolbar();
    };
    window.addEventListener(
      "angular-render-scan:zone-pollution",
      this.zonePollutionListener,
    );

    // Setup keyboard shortcuts
    this.keyListener = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey) {
        const key = e.key.toLowerCase();
        if (key === "s") {
          e.preventDefault();
          this.onToggle(!this.options.enabled);
        } else if (key === "d") {
          e.preventDefault();
          this.detailsMode = !this.detailsMode;
          this.hoveredEntry = undefined;
          this.hoveredRect = undefined;
          this.setDetailsHoverCursor(false);
          if (!this.detailsMode) this.selectedEntry = undefined;
          this.renderToolbar();
        } else if (key === "c") {
          e.preventDefault();
          copyAIPrompt(this.latestFps || this.fps.value).then((copied) => {
            this.setCopyStatus(copied ? "Copied" : "No render data");
          });
        } else if (key === "x") {
          e.preventDefault();
          import("../../application/stats").then((m) => {
            m.clearStats();
            clearRecording();
            this.latestCycle = undefined;
            this.highlights = [];
            this.selectedEntry = undefined;
            this.hoveredEntry = undefined;
            this.hoveredRect = undefined;
            this.last30CycleDurations.length = 0;
            this.showWaterfallPanel = false;
            this.renderToolbar();
          });
        } else if (key === "t") {
          e.preventDefault();
          this.options.showToolbar = !this.options.showToolbar;
          this.renderToolbar();
        }
      } else if (e.key === "Escape") {
        if (
          this.selectedEntry ||
          this.showCpuDetails ||
          this.showWaterfallPanel ||
          this.showAlertsPanel ||
          this.showOnPushPanel ||
          this.showZonePollutionPanel
        ) {
          this.selectedEntry = undefined;
          this.showCpuDetails = false;
          this.showWaterfallPanel = false;
          this.showAlertsPanel = false;
          this.showOnPushPanel = false;
          this.showZonePollutionPanel = false;
          this.renderToolbar();
        }
      }
    };
    window.addEventListener("keydown", this.keyListener);
  }

  private setupDragListeners(): void {
    this.globalMoveListener = (e: MouseEvent) => {
      if (!this.detailsMode || !this.options.enabled) {
        this.hoveredEntry = undefined;
        this.hoveredRect = undefined;
        this.setDetailsHoverCursor(false);
        return;
      }

      if (this.isOverlayTarget(e.target)) {
        this.setDetailsHoverCursor(false);
        return;
      }

      const previousHoveredId = this.hoveredEntry?.id;
      const hovered = this.findPickerEntry(e.clientX, e.clientY);
      this.hoveredEntry = hovered?.entry;
      this.hoveredRect = hovered?.rect;
      this.setDetailsHoverCursor(Boolean(hovered));
      if (previousHoveredId !== this.hoveredEntry?.id) {
        this.renderToolbar();
      }
    };

    this.globalClickListener = (e: MouseEvent) => {
      if (!this.detailsMode || !this.options.enabled) return;
      if (this.isOverlayTarget(e.target)) return;
      this.hoveredEntry = undefined;
      this.hoveredRect = undefined;
      this.setDetailsHoverCursor(false);
      this.renderToolbar();
    };

    document.addEventListener("mousemove", this.globalMoveListener, {
      passive: true,
      capture: true,
    });
    document.addEventListener("click", this.globalClickListener, {
      capture: true,
    });

    // Add cleanup to destroy method later...

    const handleDragStart = (e: Event) => {
      const event = e as MouseEvent | TouchEvent;
      const target = event.target as HTMLElement;
      if (
        this.options.enabled &&
        (target.closest(".switch") ||
          target.closest(".clear-btn") ||
          target.closest(".action-btn") ||
          target.closest(".panel-close"))
      ) {
        return; // Don't drag if clicking buttons
      }
      const toolbar = this.shadow.querySelector(".toolbar");
      if (target.closest(".toolbar")) {
        this.isDragging = true;
        const clientX =
          "touches" in event ? event.touches[0].clientX : event.clientX;
        const clientY =
          "touches" in event ? event.touches[0].clientY : event.clientY;
        this.dragStartX = clientX - (window.innerWidth - this.toolbarX);
        this.dragStartY = clientY - (window.innerHeight - this.toolbarY);
      }
    };

    const handleDragMove = (e: MouseEvent | TouchEvent) => {
      if (!this.isDragging) return;
      e.preventDefault();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const toolbar = this.shadow.querySelector(".toolbar") as HTMLElement;
      if (toolbar) {
        const rect = toolbar.getBoundingClientRect();
        this.toolbarX = window.innerWidth - (clientX - this.dragStartX);
        this.toolbarY = window.innerHeight - (clientY - this.dragStartY);

        // Bounds checking
        this.toolbarX = Math.max(
          16,
          Math.min(this.toolbarX, window.innerWidth - rect.width - 16),
        );
        this.toolbarY = Math.max(
          16,
          Math.min(this.toolbarY, window.innerHeight - rect.height - 16),
        );

        toolbar.style.right = `${this.toolbarX}px`;
        toolbar.style.bottom = `${this.toolbarY}px`;
      }
    };

    const handleDragEnd = () => {
      if (this.isDragging) {
        this.saveToolbarPosition();
      }
      this.isDragging = false;
    };

    this.shadow.addEventListener("mousedown", handleDragStart);
    window.addEventListener("mousemove", handleDragMove, { passive: false });
    window.addEventListener("mouseup", handleDragEnd);

    this.shadow.addEventListener("touchstart", handleDragStart, {
      passive: true,
    });
    window.addEventListener("touchmove", handleDragMove, { passive: false });
    window.addEventListener("touchend", handleDragEnd);
  }

  updateOptions(options: AngularRenderScanResolvedOptions): void {
    this.options = options;
    this.updateDarkMode();
    this.renderToolbar();
  }

  showCycle(cycle: AngularRenderCycle): void {
    this.latestCycle = cycle;
    if (cycle.trigger) {
      this.lastTrigger = cycle.trigger;
    }

    // Track sparkline durations
    this.last30CycleDurations.push({
      duration: cycle.duration,
      isSlow: cycle.duration >= this.slowThresholdMs,
    });
    if (this.last30CycleDurations.length > 30) {
      this.last30CycleDurations.shift();
    }

    const ttl = this.highlightTtl();
    if (ttl > 0 && this.options.enabled) {
      const expiresAt = performance.now() + ttl;
      this.highlights.push(
        ...cycle.entries.map((entry) => ({ entry, expiresAt })),
      );
    }
    this.renderToolbar();
  }

  private globalClickListener?: (e: MouseEvent) => void;
  private globalMoveListener?: (e: MouseEvent) => void;

  destroy(): void {
    this.cpu.destroy();
    this.runtimeTelemetry.destroy();
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    if (this.globalClickListener) {
      document.removeEventListener("click", this.globalClickListener, {
        capture: true,
      });
    }
    if (this.globalMoveListener) {
      document.removeEventListener("mousemove", this.globalMoveListener, {
        capture: true,
      });
    }
    if (this.keyListener) {
      window.removeEventListener("keydown", this.keyListener);
    }
    if (this.budgetViolationListener) {
      window.removeEventListener(
        "angular-render-scan:budget-violation",
        this.budgetViolationListener,
      );
    }
    if (this.zonePollutionListener) {
      window.removeEventListener(
        "angular-render-scan:zone-pollution",
        this.zonePollutionListener,
      );
    }
    window.clearTimeout(this.copyStatusTimer);
    this.setDetailsHoverCursor(false);
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
    this.clampToolbarPosition();
  };

  private restoreToolbarPosition(): void {
    try {
      const raw = globalThis.localStorage?.getItem(TOOLBAR_POSITION_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as { right?: unknown; bottom?: unknown };
      if (
        typeof parsed.right === "number" &&
        Number.isFinite(parsed.right) &&
        typeof parsed.bottom === "number" &&
        Number.isFinite(parsed.bottom)
      ) {
        this.toolbarX = parsed.right;
        this.toolbarY = parsed.bottom;
      }
    } catch {
      // Persisted position is a convenience; invalid storage should not break rendering.
    }
  }

  private restoreToolbarCompact(): void {
    const raw = globalThis.localStorage?.getItem(TOOLBAR_COMPACT_KEY);
    if (raw === null) return;
    this.compactToolbar = raw !== "false";
  }

  private saveToolbarCompact(): void {
    try {
      globalThis.localStorage?.setItem(
        TOOLBAR_COMPACT_KEY,
        String(this.compactToolbar),
      );
    } catch {
      // Ignore storage failures.
    }
  }

  private saveToolbarPosition(): void {
    try {
      globalThis.localStorage?.setItem(
        TOOLBAR_POSITION_KEY,
        JSON.stringify({ right: this.toolbarX, bottom: this.toolbarY }),
      );
    } catch {
      // Ignore storage failures in restricted host apps.
    }
  }

  private clampToolbarPosition(): void {
    const toolbar = this.shadow.querySelector(".toolbar") as HTMLElement | null;
    const rect = toolbar?.getBoundingClientRect();
    const width = rect?.width ?? 0;
    const height = rect?.height ?? 0;

    this.toolbarX = Math.max(
      16,
      Math.min(this.toolbarX, Math.max(16, window.innerWidth - width - 16)),
    );
    this.toolbarY = Math.max(
      16,
      Math.min(this.toolbarY, Math.max(16, window.innerHeight - height - 16)),
    );

    if (toolbar) {
      toolbar.style.right = `${this.toolbarX}px`;
      toolbar.style.bottom = `${this.toolbarY}px`;
    }
  }

  private readonly loop = (): void => {
    this.fps.mark();
    this.cpu.markFrame();
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
    if (!this.options.enabled || this.options.animationSpeed === "off") {
      this.highlights = [];
      return;
    }

    const now = performance.now();
    const activeHighlights = this.getActiveHighlights(now);
    const labelledIds = this.getLabelledEntryIds(activeHighlights).slice(
      0,
      this.options.maxLabelCount,
    );

    const fadeDuration = this.highlightTtl() || 1;
    for (const { entry, expiresAt, rect } of activeHighlights) {
      const alpha = Math.max(
        0.18,
        Math.min(1, (expiresAt - now) / fadeDuration),
      );

      this.drawOutline(rect, alpha, entry);

      if (this.detailsMode) {
        this.drawDetailsAffordance(rect, entry, alpha);
      }

      if (labelledIds.includes(entry.id)) {
        this.drawLabel(entry, rect, alpha, entry.latestDuration);
      }
    }

    if (this.detailsMode && this.hoveredEntry && this.hoveredRect) {
      this.drawHoverTarget(this.hoveredRect, this.hoveredEntry);
    }
  }

  private getActiveHighlights(now: number): ActiveHighlight[] {
    this.highlights = this.highlights.filter(
      (highlight) =>
        highlight.expiresAt > now && highlight.entry.element.isConnected,
    );

    return this.highlights
      .flatMap((highlight) => {
        const rect = highlight.entry.element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return [];
        }

        return [{ ...highlight, rect }];
      })
      .sort((a, b) => area(b.rect) - area(a.rect));
  }

  private findClickedEntry(x: number, y: number): ActiveHighlight | undefined {
    const activeHighlights = this.getActiveHighlights(performance.now());
    const activeMatch = this.smallestContainingHighlight(
      activeHighlights,
      x,
      y,
    );
    if (activeMatch) {
      return activeMatch;
    }

    const latestHighlights =
      this.latestCycle?.entries.flatMap((entry) => {
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

  private findPickerEntry(x: number, y: number): ActiveHighlight | undefined {
    const hitElement = document.elementFromPoint(x, y);
    if (!hitElement || this.isOverlayTarget(hitElement)) {
      return undefined;
    }

    const matches = getRegisteredComponents()
      .flatMap((entry) => {
        if (!entry.element.isConnected || !entry.element.contains(hitElement)) {
          return [];
        }

        const rect = entry.element.getBoundingClientRect();
        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          x < rect.left ||
          x > rect.right ||
          y < rect.top ||
          y > rect.bottom
        ) {
          return [];
        }

        return [{ entry, rect, expiresAt: 0 }];
      })
      .sort((a, b) => area(a.rect) - area(b.rect));

    if (
      matches.length === 1 &&
      matches[0].entry.parentId === null &&
      hitElement !== matches[0].entry.element
    ) {
      return undefined;
    }

    return matches[0] ?? this.findClickedEntry(x, y);
  }

  private smallestContainingHighlight(
    highlights: ActiveHighlight[],
    x: number,
    y: number,
  ): ActiveHighlight | undefined {
    return highlights
      .filter(
        (highlight) =>
          x >= highlight.rect.left &&
          x <= highlight.rect.right &&
          y >= highlight.rect.top &&
          y <= highlight.rect.bottom,
      )
      .sort((a, b) => area(a.rect) - area(b.rect))[0];
  }

  private highlightTtl(): number {
    if (this.options.animationSpeed === "slow") {
      return 2400;
    }
    if (this.options.animationSpeed === "fast") {
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

  private getColorForDuration(
    duration: number,
    type: "stroke" | "bg",
  ): readonly [number, number, number] {
    const { theme } = this.options;
    if (duration >= this.slowThresholdMs)
      return type === "bg" ? theme.labelBackgroundSlow! : theme.slow!;
    if (duration > this.fastThresholdMs)
      return type === "bg" ? theme.labelBackground! : theme.medium!;
    return type === "bg" ? theme.labelBackground! : theme.fast!;
  }

  private getStrokeColorForMutation(
    entry: AngularRenderEntry,
  ): readonly [number, number, number] {
    if (entry.element && !entry.element.isConnected) {
      return this.options.theme.slow; // Red for leaked/disconnected components!
    }
    const maxDuration = Math.max(entry.latestDuration, entry.averageDuration);
    if (maxDuration >= this.slowThresholdMs) {
      return this.options.theme.slow; // Red for expensive/slow renders!
    }
    if (maxDuration > this.fastThresholdMs) {
      return this.options.theme.medium; // Yellow/Warning for moderately expensive renders!
    }
    const type = entry.mutationType || "none";
    if (type === "none") {
      return [34, 197, 94]; // Green for wasted no-ops!
    }
    if (type === "structural") {
      return [239, 68, 68]; // Red for structural template/DOM mutations
    }
    return [59, 130, 246]; // Blue for text/attribute mutations
  }

  private drawOutline(
    rect: DOMRect,
    alpha: number,
    entry: AngularRenderEntry,
  ): void {
    if (!this.context) return;
    const ctx = this.context;
    const strokeColor = this.getStrokeColorForMutation(entry);
    const r = 3; // corner radius

    ctx.save();
    ctx.strokeStyle = rgba(strokeColor, Math.min(0.85, alpha));
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.roundRect(rect.left, rect.top, rect.width, rect.height, r);
    ctx.stroke();
    ctx.restore();
  }

  private drawHoverTarget(rect: DOMRect, entry: AngularRenderEntry): void {
    if (!this.context) return;
    const ctx = this.context;
    const color = this.getStrokeColorForMutation(entry);
    ctx.save();
    ctx.strokeStyle = rgba(color, 0.9);
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.roundRect(rect.left, rect.top, rect.width, rect.height, 3);
    ctx.stroke();
    ctx.restore();
  }

  private setDetailsHoverCursor(active: boolean): void {
    if (this.detailsHoverCursorActive === active) {
      return;
    }

    this.detailsHoverCursorActive = active;
    document.body.style.cursor = active ? "pointer" : "";
  }

  private closeInteractivePanels(): void {
    this.selectedEntry = undefined;
    this.hoveredEntry = undefined;
    this.hoveredRect = undefined;
    this.detailsMode = false;
    this.showCpuDetails = false;
    this.showWaterfallPanel = false;
    this.showAlertsPanel = false;
    this.showOnPushPanel = false;
    this.showZonePollutionPanel = false;
    this.showGraphPanel = false;
    this.setDetailsHoverCursor(false);
  }

  private drawDetailsAffordance(
    rect: DOMRect,
    entry: AngularRenderEntry,
    alpha: number,
  ): void {
    if (!this.context) return;
    const ctx = this.context;
    const color = this.getStrokeColorForMutation(entry);
    ctx.save();
    ctx.strokeStyle = rgba(color, Math.min(0.22, alpha * 0.28));
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.roundRect(rect.left - 1, rect.top - 1, rect.width + 2, rect.height + 2, 4);
    ctx.stroke();
    ctx.restore();
  }

  private drawLabel(
    entry: AngularRenderEntry,
    rect: DOMRect,
    alpha: number,
    _duration: number,
  ): void {
    if (!this.context) return;
    const ctx = this.context;

    const maxDuration = Math.max(entry.latestDuration, entry.averageDuration);
    const strokeColor = this.getStrokeColorForMutation(entry);
    const isLeak = entry.element && !entry.element.isConnected;

    ctx.save();
    ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";

    // Build pill text: "ComponentName · 12ms · ×4"
    const durationText = `${entry.latestDuration.toFixed(1)}ms`;
    const label = truncateText(
      ctx,
      `${entry.name} · ${durationText} · ×${entry.count}`,
      Math.max(56, Math.min(rect.width - 4, 200)),
    );

    const textW = ctx.measureText(label).width;
    const pillW = textW + 14;
    const pillH = 17;
    const pillR = 4;
    const pillX = Math.max(
      4,
      Math.min(rect.left + 4, window.innerWidth - pillW - 4),
    );
    const pillY = Math.max(4, rect.top + 4);

    // Pill background — use stroke color with opacity
    const pillAlpha = Math.min(0.92, alpha + 0.15);
    ctx.fillStyle = isLeak
      ? `rgba(239,68,68,${pillAlpha})`
      : rgba(strokeColor, pillAlpha);

    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, pillR);
    ctx.fill();

    // Pill text — white
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, alpha + 0.3)})`;
    ctx.fillText(label, pillX + 7, pillY + pillH - 4, pillW - 10);
    ctx.restore();
  }

  private renderToolbar(): void {
    const container = this.shadow.getElementById("toolbar-container");
    if (!container) {
      return;
    }

    if (!this.options.showToolbar) {
      this.replaceToolbarHtml(container, "");
      return;
    }

    const cycle = this.latestCycle;
    const displayedFps = this.latestFps || this.fps.value;
    const compactToolbar = this.compactToolbar || !this.options.enabled;
    const cpuVal = this.cpu.value;
    const cpuClass = cpuVal > 50 ? "cpu-high" : cpuVal > 20 ? "cpu-medium" : "";

    const wasted = getWastedStats();
    const leaks = getLeakedComponents();
    const onPushCandidates = getOnPushCandidates();
    const pollutionEvents = getZonePollutionEvents();

    // Generate timeline sparkline SVG
    let sparklineSvg = "";
    if (this.last30CycleDurations.length > 0) {
      const maxDuration = Math.max(
        ...this.last30CycleDurations.map((d) => d.duration),
        1,
      );
      const bars = this.last30CycleDurations
        .map((d, index) => {
          const height = Math.max(
            2,
            Math.round((d.duration / maxDuration) * 16),
          );
          const y = 16 - height;
          const x = index * 3;
          const color =
            d.duration >= this.slowThresholdMs
              ? "#ef4444"
              : d.duration > this.fastThresholdMs
                ? "#f59e0b"
                : "#3b82f6";
          return `<rect x="${x}" y="${y}" width="2" height="${height}" fill="${color}" rx="0.5" />`;
        })
        .join("");
      sparklineSvg = `
        <span class="metric sparkline-toggle ${this.showWaterfallPanel ? "active" : ""}" style="min-width: 104px; cursor: pointer;" data-tooltip="Render timeline sparkline (last 30 cycles). Click to toggle CD waterfall view.">
          <span class="label">Timeline</span>
          <svg width="90" height="16" style="display: block; margin-top: 2px;">${bars}</svg>
        </span>
      `;
    } else {
      sparklineSvg = `<span class="metric"><span class="label">Timeline</span><span class="value">-</span></span>`;
    }

    // Leaks metric chip
    const leaksChip =
      leaks.length > 0
        ? `<span class="metric diagnostic-chip leak-toggle" style="cursor: pointer;" data-tooltip="Memory Leak Warning: detected ${leaks.length} components whose elements were disconnected but not destroyed. Click to inspect first leak.">
          <span class="label" style="color: #ef4444;">Leaks</span>
          <span class="value" style="color: #ef4444; font-weight: bold;">${leaks.length}</span>
        </span>`
        : "";

    // Alerts metric chip
    const hasError = this.budgetViolations.some(
      (v) => v.type === "error" || v.type === "render-rate",
    );
    const alertsChip =
      this.budgetViolations.length > 0
        ? `<span class="metric diagnostic-chip alerts-toggle ${this.showAlertsPanel ? "active" : ""}" style="cursor: pointer; position: relative;" data-tooltip="Performance Budget Violations: detected ${this.budgetViolations.length} violations. Click to toggle alerts feed.">
          <span class="label" style="color: ${hasError ? "#ef4444" : "#f59e0b"}; font-weight: bold;">Alerts</span>
          <span class="value" style="color: ${hasError ? "#ef4444" : "#f59e0b"}; font-weight: bold;">
            ${this.budgetViolations.length}
          </span>
        </span>`
        : "";

    // CD Trigger badge
    const triggerBadge = this.lastTrigger
      ? this.triggerBadgeHtml(this.lastTrigger)
      : "";

    // OnPush candidates chip
    const onPushChip =
      onPushCandidates.length > 0
        ? `<span class="metric diagnostic-chip onpush-toggle" style="cursor: pointer;" data-tooltip="OnPush Candidates: ${onPushCandidates.length} component(s) using Default CD could save renders by switching to OnPush. Click to view.">
          <span class="label" style="color: #7c3aed;">OnPush</span>
          <span class="value" style="color: #7c3aed; font-weight: bold;">${onPushCandidates.length}</span>
        </span>`
        : "";

    // Zone pollution chip
    const pollutionChip =
      pollutionEvents.length > 0
        ? `<span class="metric diagnostic-chip pollution-toggle" style="cursor: pointer;" data-tooltip="Zone Pollution: ${pollutionEvents.length} CD cycles were triggered by async operations with no user interaction. Click to inspect.">
          <span class="label" style="color: #f59e0b;">Zone</span>
          <span class="value" style="color: #f59e0b; font-weight: bold;">${pollutionEvents.length}</span>
        </span>`
        : "";

    const cycleWasteText = cycle?.wastedCdStats ? ` (${cycle.wastedCdStats.wasteScore}% waste)` : '';

    const htmlChanged = this.replaceToolbarHtml(
      container,
      `
      ${this.options.enabled ? this.inspectPanelHtml() : ""}
      ${this.options.enabled ? this.cpuDetailsHtml() : ""}
      ${this.options.enabled ? this.waterfallPanelHtml() : ""}
      ${this.options.enabled ? this.alertsPanelHtml() : ""}
      ${this.options.enabled ? this.onPushPanelHtml(onPushCandidates) : ""}
      ${this.options.enabled ? this.zonePollutionPanelHtml(pollutionEvents) : ""}
      ${this.options.enabled ? this.cdGraphPanelHtml() : ""}
      <div class="toolbar ${this.options.enabled ? (compactToolbar ? "compact" : "expanded") : "disabled"}" style="right: ${this.toolbarX}px; bottom: ${this.toolbarY}px;">
        <div class="toolbar-switch">
          <label class="switch" data-tooltip="Enable or pause render scanning.">
            <input type="checkbox" ${this.options.enabled ? "checked" : ""} aria-label="Angular Render Scan enabled" />
            <span class="track" aria-hidden="true"></span>
            <span class="switch-text">${this.options.enabled ? "On" : "Off"}</span>
          </label>
        </div>
        ${this.options.enabled ? `
        <div class="toolbar-main">
          ${this.metric("FPS", this.options.showFPS ? String(displayedFps) + " fps" : "-", this.getFpsClass(displayedFps))}
          <span class="metric cpu-interactive ${this.showCpuDetails ? "active" : ""}" data-tooltip="Main-thread busy %. High values mean JS is blocking the render pipeline. Click for details.">
            <span class="label">CPU</span>
            <span class="value ${cpuClass}">${cpuVal}%</span>
          </span>
          ${sparklineSvg}
        </div>
        ${compactToolbar ? "" : `
        <div class="toolbar-extended">
          ${this.metric("Last cycle", cycle ? `${cycle.duration.toFixed(1)}ms${cycleWasteText}` : "-")}
          <span class="metric graph-toggle ${this.showGraphPanel ? "active" : ""}" style="cursor:pointer;" data-tooltip="Live CD render graph — shows how change detection propagates through the component tree. Click to toggle.">
            <span class="label">CD Graph</span>
            <span class="value" style="color:#06b6d4;">Graph</span>
          </span>
          ${this.metric("Slowest", cycle?.slowest ? cycle.slowest.name : "-", "", "slowest-metric")}
          ${triggerBadge}
          ${leaksChip}
          ${alertsChip}
          ${onPushChip}
          ${pollutionChip}
        </div>
        `}
        <span class="toolbar-actions">
          ${compactToolbar ? "" : `
          ${this.options.showCopyPrompt ? '<button class="action-btn copy-prompt-btn" aria-label="Copy prompt for slow render issues" data-tooltip="Copy an AI-ready prompt with only the captured slow/error component issues and their runtime evidence."><span aria-hidden="true">✦</span></button>' : ""}
          <button class="action-btn export-btn" aria-label="Export session data" data-tooltip="Download the current profiling session data as a .json file."><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"></path><path d="m7 9 5 5 5-5"></path><path d="M5 19h14"></path></svg></button>
          <button class="clear-btn" aria-label="Clear stats" data-tooltip="Clear current render stats."><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 19 5-5"></path><path d="m9 15 5 5"></path><path d="M15 4 4 15"></path><path d="m14 5 5 5"></path><path d="m18 11-7-7"></path></svg></button>
          `}
          <button class="action-btn details-toggle toolbar-picker-toggle ${this.detailsMode ? "active" : ""}" aria-pressed="${this.detailsMode}" aria-label="Enable component details panel" data-tooltip="Use the picker to inspect a component on hover. Clicks continue to the app.">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l7 16 2.8-6.2L20 11 4 4z"></path><path d="M13.8 13.8 20 20"></path></svg>
          </button>
          <button class="action-btn toolbar-size-toggle" aria-pressed="${compactToolbar ? "false" : "true"}" aria-label="${compactToolbar ? "Show extended view" : "Show compact view"}" data-tooltip="${compactToolbar ? "Show extended view" : "Show small view"}">
            ${compactToolbar ? '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"></path></svg>' : '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>'}
          </button>
        </span>
        ` : ""}
        ${this.copyStatus ? `<span class="status" aria-live="polite">${escapeHtml(this.copyStatus)}</span>` : ""}
      </div>
    `,
    );

    if (!htmlChanged) {
      return;
    }

    const toolbarEl = container.querySelector(".toolbar");

    toolbarEl?.querySelector("input")?.addEventListener(
      "change",
      (event) => {
        const enabled = (event.target as HTMLInputElement).checked;
        if (!enabled) {
          this.closeInteractivePanels();
        }
        this.onToggle(enabled);
      },
      { once: true },
    );

    toolbarEl?.querySelector(".cpu-interactive")?.addEventListener(
      "click",
      () => {
        this.showCpuDetails = !this.showCpuDetails;
        this.renderToolbar();
      },
      { once: true },
    );

    toolbarEl?.querySelector(".toolbar-size-toggle")?.addEventListener(
      "click",
      () => {
        this.compactToolbar = !this.compactToolbar;
        this.saveToolbarCompact();
        this.renderToolbar();
        this.clampToolbarPosition();
        this.saveToolbarPosition();
      },
      { once: true },
    );

    toolbarEl?.querySelector(".toolbar-picker-toggle")?.addEventListener(
      "click",
      () => {
        this.detailsMode = !this.detailsMode;
        this.selectedEntry = undefined;
        this.hoveredEntry = undefined;
        this.hoveredRect = undefined;
        this.setDetailsHoverCursor(false);
        this.renderToolbar();
      },
      { once: true },
    );

    toolbarEl?.querySelector(".sparkline-toggle")?.addEventListener(
      "click",
      () => {
        this.showWaterfallPanel = !this.showWaterfallPanel;
        this.renderToolbar();
      },
      { once: true },
    );

    toolbarEl?.querySelector(".alerts-toggle")?.addEventListener(
      "click",
      () => {
        this.showAlertsPanel = !this.showAlertsPanel;
        this.renderToolbar();
      },
      { once: true },
    );

    toolbarEl?.querySelector(".leak-toggle")?.addEventListener(
      "click",
      () => {
        this.detailsMode = true;
        if (leaks.length > 0) {
          this.selectedEntry = leaks[0];
        }
        this.renderToolbar();
      },
      { once: true },
    );

    toolbarEl?.querySelector(".clear-btn")?.addEventListener(
      "click",
      () => {
        import("../../application/stats").then((m) => {
          m.clearStats();
          clearRecording();
          this.latestCycle = undefined;
          this.highlights = [];
          this.selectedEntry = undefined;
          this.hoveredEntry = undefined;
          this.hoveredRect = undefined;
          this.last30CycleDurations.length = 0;
          this.showWaterfallPanel = false;
          this.showCpuDetails = false;
          this.showAlertsPanel = false;
          this.budgetViolations = [];
          this.renderToolbar();
        });
      },
      { once: true },
    );

    toolbarEl?.querySelector(".copy-prompt-btn")?.addEventListener(
      "click",
      async () => {
        const copied = await copyAIPrompt(this.latestFps || this.fps.value);
        this.setCopyStatus(
          copied
            ? "Copied"
            : this.latestCycle
              ? "Copy failed"
              : "No render data",
        );
      },
      { once: true },
    );

    toolbarEl?.querySelector(".export-btn")?.addEventListener(
      "click",
      () => {
        const data = getSessionData();
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `angular-render-scan-session-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.setCopyStatus("Exported JSON");
      },
      { once: true },
    );

    container.querySelector(".panel-close")?.addEventListener(
      "click",
      () => {
        this.detailsMode = false;
        this.selectedEntry = undefined;
        this.hoveredEntry = undefined;
        this.hoveredRect = undefined;
        this.setDetailsHoverCursor(false);
        this.renderToolbar();
      },
      { once: true },
    );

    container.querySelector(".waterfall-close-btn")?.addEventListener(
      "click",
      () => {
        this.showWaterfallPanel = false;
        this.renderToolbar();
      },
      { once: true },
    );

    container.querySelector(".panel-copy-btn")?.addEventListener(
      "click",
      async () => {
        const entry = this.currentDetailsEntry();
        if (!entry) {
          return;
        }
        const copied = await this.copyComponentPrompt(
          entry,
          this.latestFps || this.fps.value,
        );
        this.setCopyStatus(copied ? "Copied" : "Copy failed");
      },
      { once: true },
    );

    container.querySelector(".open-editor-btn")?.addEventListener(
      "click",
      async () => {
        const entry = this.currentDetailsEntry();
        if (!entry) {
          return;
        }
        const query = `class ${entry.name}`;

        try {
          await navigator.clipboard.writeText(query);
        } catch (err) {
          console.warn("[angular-render-scan] Clipboard copy failed", err);
        }

        const openInEditorUrl = this.getEditorUrl(entry);
        if (openInEditorUrl) {
          const w = window.open(openInEditorUrl, "_blank");
          if (w) {
            setTimeout(() => w.close(), 500);
          }
        }

        this.setCopyStatus("Copied class search query!");
      },
      { once: true },
    );

    container.querySelector(".alerts-close-btn")?.addEventListener(
      "click",
      () => {
        this.showAlertsPanel = false;
        this.renderToolbar();
      },
      { once: true },
    );

    container.querySelector(".clear-alerts-btn")?.addEventListener(
      "click",
      () => {
        this.budgetViolations = [];
        this.showAlertsPanel = false;
        this.renderToolbar();
      },
      { once: true },
    );

    toolbarEl?.querySelector(".onpush-toggle")?.addEventListener(
      "click",
      () => {
        this.showOnPushPanel = !this.showOnPushPanel;
        this.renderToolbar();
      },
      { once: true },
    );

    toolbarEl?.querySelector(".pollution-toggle")?.addEventListener(
      "click",
      () => {
        this.showZonePollutionPanel = !this.showZonePollutionPanel;
        this.renderToolbar();
      },
      { once: true },
    );

    container.querySelector(".onpush-close-btn")?.addEventListener(
      "click",
      () => {
        this.showOnPushPanel = false;
        this.renderToolbar();
      },
      { once: true },
    );

    container.querySelector(".zone-pollution-close-btn")?.addEventListener(
      "click",
      () => {
        this.showZonePollutionPanel = false;
        this.renderToolbar();
      },
      { once: true },
    );

    toolbarEl?.querySelector(".graph-toggle")?.addEventListener(
      "click",
      () => {
        this.showGraphPanel = !this.showGraphPanel;
        this.graphCollapsed = false;
        this.renderToolbar();
      },
      { once: true },
    );

    container.querySelector(".graph-close-btn")?.addEventListener(
      "click",
      () => {
        this.showGraphPanel = false;
        this.renderToolbar();
      },
      { once: true },
    );

    container.querySelector(".graph-collapse-btn")?.addEventListener(
      "click",
      () => {
        this.graphCollapsed = !this.graphCollapsed;
        this.renderToolbar();
      },
      { once: true },
    );

    container.querySelector(".graph-refresh-btn")?.addEventListener(
      "click",
      () => {
        this.renderToolbar();
      },
      { once: true },
    );
  }

  private metric(
    label: string,
    value: string,
    extraClass = "",
    containerClass = "",
  ): string {
    const cls = containerClass ? `metric ${containerClass}` : "metric";
    const escapedValue = escapeHtml(value);
    return `<span class="${cls}"><span class="label">${label}</span><span class="value ${extraClass}" title="${escapedValue}">${escapedValue}</span></span>`;
  }

  private getFpsClass(fps: number): string {
    if (!this.options.showFPS || fps === 0) {
      return "";
    }
    return fps < 50 ? "fps-drop" : "";
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
    const entry = this.currentDetailsEntry();
    if (!entry) {
      return "";
    }

    const recentCycles = getRecording()
      .filter((cycle) =>
        cycle.entries.some((candidate) => candidate.id === entry.id),
      )
      .slice(-5)
      .map(
        (cycle) =>
          `#${cycle.id} ${cycle.entries.find((candidate) => candidate.id === entry.id)?.latestDuration.toFixed(1)}ms`,
      );
    const isSlow = entry.latestDuration >= this.slowThresholdMs;
    const severity = this.severityFor(entry);
    const cost = this.costFor(entry);
    const recommendations = this.recommendationsFor(entry);
    const changedInputs = entry.changedInputs?.length
      ? entry.changedInputs
          .map((input) => {
            const unstableTag = input.isReferentiallyUnstable
              ? ` <span style="color: #f59e0b; font-size: 8px; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); padding: 1px 4px; border-radius: 3px;">UNSTABLE REF</span>`
              : "";
            return `${escapeHtml(input.name)}: ${escapeHtml(input.previous)} → ${escapeHtml(input.current)}${unstableTag}`;
          })
          .join("<br>")
      : "-";

    const openInEditorUrl = this.getEditorUrl(entry);
    const openLinkHtml = openInEditorUrl
      ? `<button class="open-editor-btn" style="background: none; border: none; padding: 0; cursor: pointer; color: #2563eb; text-decoration: none; font-size: 10px; font-weight: 700; margin-top: 4px; display: inline-flex; align-items: center; gap: 4px; font-family: inherit;">
           <span>Open in Editor</span>
           <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
         </button>`
      : "";

    const leakWarningHtml = !entry.element?.isConnected
      ? `<div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; padding: 6px 10px; color: #ef4444; font-weight: bold; font-size: 10px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 14px;">⚠️</span>
          <span>Memory Leak Warning: Element is disconnected from the DOM but was not destroyed!</span>
         </div>`
      : "";

    return `
      <section class="inspect-panel ${severity.kind}" style="right: ${this.toolbarX}px; bottom: ${this.toolbarY + 60}px; max-width: 300px;" aria-label="Component recommendation panel">
        ${leakWarningHtml}
        <div class="panel-head">
          <div>
            <div class="panel-title">${escapeHtml(entry.name)}</div>
            ${openLinkHtml}
            <div><span class="severity ${severity.kind}">${escapeHtml(severity.label)}</span></div>
          </div>
          <div class="panel-actions">
            ${isSlow ? '<button class="panel-copy-btn" aria-label="Copy prompt for this slow component issue" data-tooltip="Copy an AI-ready prompt scoped only to this slow component and its local evidence.">Copy AI Fix Prompt</button>' : ""}
            <button class="panel-close" aria-label="Close component details">Close</button>
          </div>
        </div>
        <div class="panel-grid">
          ${this.panelField("Last render", `${entry.latestDuration.toFixed(1)}ms`)}
          ${this.panelField("Avg render", `${entry.averageDuration.toFixed(1)}ms`)}
          ${this.panelField("Total renders", String(entry.count))}
          ${this.panelField("Trigger reason", entry.reason ?? "unknown")}
          ${this.panelField("Change detection", entry.cdStrategy ?? "unknown")}
          ${this.panelField("Cycle #", String(entry.latestCycleId))}
        </div>
        <div class="panel-field">
          <span class="panel-label">DOM Mutation Type</span>
          <span class="panel-value" style="text-transform: capitalize;">${escapeHtml(entry.mutationType ?? "none")}</span>
        </div>
        ${
          entry.renderCause
            ? `
        <div class="panel-field" style="grid-column: span 2; background: rgba(59, 130, 246, 0.05); border: 1px dashed rgba(59, 130, 246, 0.2); border-radius: 6px; padding: 6px 10px; margin-bottom: 6px;">
          <span class="panel-label" style="color: #3b82f6; font-weight: 600;">Render Cause Chain</span>
          <span class="panel-value" style="font-family: inherit; font-size: 9px; line-height: 1.4; margin-top: 2px;">
            <strong>${escapeHtml(entry.renderCause.trigger.replace("signal:", "signal ").replace("zone:", "zone "))}</strong>${entry.renderCause.source ? ` &rarr; ${escapeHtml(entry.renderCause.source)}` : ""}
            ${
              entry.renderCause.stack && entry.renderCause.stack.length > 0
                ? `<div style="margin-top: 4px; padding-left: 10px;">
                    ${entry.renderCause.stack.slice(0, 3).map(f => `<div style="font-family: monospace; font-size: 8px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">└─ ${escapeHtml(f)}</div>`).join("")}
                   </div>`
                : ""
            }
          </span>
        </div>`
            : ""
        }
        ${
          entry.isOnPushCandidate
            ? `
        <div style="background: rgba(124, 58, 237, 0.08); border: 1px solid rgba(124, 58, 237, 0.2); border-radius: 6px; padding: 6px 10px; font-size: 9px; line-height: 1.4; color: #7c3aed; display: flex; gap: 6px; align-items: flex-start; margin-bottom: 2px;">
          <span style="font-size: 12px; flex-shrink: 0;">⚡</span>
          <span><strong>OnPush candidate:</strong> This component has ${entry.wastedPercentage}% wasted renders and uses Default CD. Adding <code style="background: rgba(0,0,0,0.06); padding: 1px 3px; border-radius: 2px;">ChangeDetectionStrategy.OnPush</code> could eliminate most unnecessary checks.</span>
        </div>`
            : ""
        }
        <div class="panel-field">
          <span class="panel-label">Skipped renders (no-ops)</span>
          <span class="panel-value">
            ${entry.wastedChecks} of ${entry.count} were skipped — ${entry.wastedPercentage}% waste
            <div style="width: 100%; height: 3px; background: #e2e8f0; border-radius: 2px; overflow: hidden; margin-top: 3px;">
              <div style="width: ${entry.wastedPercentage}%; height: 100%; background: ${entry.wastedPercentage > 60 ? "#ef4444" : "#10b981"};"></div>
            </div>
          </span>
        </div>
        <div class="panel-field">
          <span class="panel-label">Render cost estimate</span>
          <span class="panel-value">${escapeHtml(cost)}</span>
        </div>
        ${this.runtimeSignalsHtml(entry)}
        ${
          entry.changedInputs?.length
            ? `<div class="panel-field">
          <span class="panel-label">Inputs that changed</span>
          <span class="panel-value">${changedInputs}</span>
        </div>`
            : ""
        }
        ${
          recentCycles.length > 0
            ? `<div class="panel-field">
          <span class="panel-label">Last 5 cycle durations</span>
          <span class="panel-value">${escapeHtml(recentCycles.join(" · "))}</span>
        </div>`
            : ""
        }
        ${
          recommendations.length > 0
            ? `<div class="panel-field">
          <span class="panel-label">Recommendations</span>
          <span class="panel-list">
            ${recommendations
              .map(
                (rec) => `
              <div class="rec-card ${rec.severity}">
                <span class="rec-category">${escapeHtml(rec.category)}</span>
                <p class="rec-action">${escapeHtml(rec.action)}</p>
              </div>
            `,
              )
              .join("")}
          </span>
        </div>`
            : ""
        }
      </section>
    `;
  }

  private currentDetailsEntry(): AngularRenderEntry | undefined {
    return this.hoveredEntry ?? this.selectedEntry;
  }

  private panelField(label: string, value: string): string {
    return `<span class="panel-field"><span class="panel-label">${escapeHtml(label)}</span><span class="panel-value">${escapeHtml(value)}</span></span>`;
  }

  private panelFieldHtml(label: string, value: string): string {
    return `<span class="panel-field"><span class="panel-label">${escapeHtml(label)}</span><span class="panel-value">${value}</span></span>`;
  }

  private runtimeSignalsHtml(entry: AngularRenderEntry): string {
    const angular = getAngularDebugSummary(entry.element);
    const runtime = this.runtimeTelemetry.getSummary(
      this.latestComponentWindowStart(entry),
    );
    const signalFields: string[] = [];
    const hierarchy = this.componentHierarchy(entry, angular);
    const browserWarnings = this.browserSignalSummary(runtime);

    if (hierarchy) {
      signalFields.push(this.panelFieldHtml("Hierarchy", hierarchy));
    }
    if (angular.directiveNames.length > 0) {
      signalFields.push(
        this.panelFieldHtml(
          "Directives",
          escapeHtml(angular.directiveNames.slice(0, 3).join(", ")),
        ),
      );
    }
    if (angular.listenerNames.length > 0) {
      signalFields.push(
        this.panelFieldHtml(
          "Listeners",
          escapeHtml(angular.listenerNames.slice(0, 4).join(", ")),
        ),
      );
    }
    if (browserWarnings) {
      signalFields.push(this.panelFieldHtml("Browser", browserWarnings));
    }

    if (signalFields.length === 0) {
      return "";
    }

    return `<div class="panel-field">
      <span class="panel-label">Runtime signals</span>
      <span class="panel-list">${signalFields.join("")}</span>
    </div>`;
  }

  private componentHierarchy(
    entry: AngularRenderEntry,
    angular: ReturnType<typeof getAngularDebugSummary>,
  ): string {
    const names = [
      angular.rootName,
      angular.ownerName,
      angular.componentName || entry.name,
    ]
      .filter((name): name is string => Boolean(name))
      .filter((name, index, list) => list.indexOf(name) === index);

    return names.length > 1 ? escapeHtml(names.join(" -> ")) : "";
  }

  private browserSignalSummary(
    runtime: ReturnType<RuntimeTelemetry["getSummary"]>,
  ): string {
    const warnings: string[] = [];
    if (runtime.longTasks.count > 0) {
      warnings.push(`${runtime.longTasks.maxDuration}ms long task`);
    }
    if (runtime.interaction && runtime.interaction.duration >= 100) {
      warnings.push(`${runtime.interaction.duration}ms ${runtime.interaction.name}`);
    }
    if (runtime.layoutShift.score >= 0.01) {
      warnings.push(`${runtime.layoutShift.score} layout shift`);
    }
    if (runtime.resources.slowCount > 0) {
      warnings.push(`${runtime.resources.slowCount} slow resource(s)`);
    }

    return warnings.length ? escapeHtml(warnings.slice(0, 3).join(" · ")) : "";
  }

  private latestComponentWindowStart(entry: AngularRenderEntry): number {
    const matchingCycle = getRecording()
      .slice()
      .reverse()
      .find((cycle) =>
        cycle.entries.some((candidate) => candidate.id === entry.id),
      );

    return matchingCycle?.startedAt ?? Math.max(0, performance.now() - 2000);
  }

  private cpuDetailsHtml(): string {
    if (!this.showCpuDetails) {
      return "";
    }
    const details = this.cpu.getDetails();
    const fillClass =
      details.percentage > 50
        ? "high"
        : details.percentage > 20
          ? "medium"
          : "low";

    return `
      <div class="cpu-details-panel" style="right: ${this.toolbarX + 120}px; bottom: ${this.toolbarY + 60}px;" aria-label="CPU details breakdown">
        <div class="title">
          <span>CPU Usage</span>
          <span style="font-size: 8px; font-weight: normal; color: #94a3b8;">Main Thread</span>
        </div>
        <div class="cpu-bar-bg">
          <div class="cpu-bar-fill ${fillClass}" style="width: ${details.percentage}%;"></div>
        </div>
        <div class="row">
          <span style="color: #64748b;">Busy Rate</span>
          <span class="row-val ${fillClass}">${details.percentage}%</span>
        </div>
        <div class="row">
          <span style="color: #64748b;">Blocking Tasks</span>
          <span class="row-val">${details.longTaskCount}</span>
        </div>
        <div class="row">
          <span style="color: #64748b;">Max Task Delay</span>
          <span class="row-val">${details.maxDuration}ms</span>
        </div>
        <div class="row" data-tooltip="Total time tasks spent blocking the main thread beyond a 50ms budget in the last 2s">
          <span style="color: #64748b;">Total Block Time</span>
          <span class="row-val">${details.totalBlockingTime}ms</span>
        </div>
      </div>
    `;
  }

  private setCopyStatus(status: string): void {
    this.copyStatus = status;
    window.clearTimeout(this.copyStatusTimer);
    this.renderToolbar();
    this.copyStatusTimer = window.setTimeout(() => {
      this.copyStatus = "";
      this.renderToolbar();
    }, 1800);
  }

  private isOverlayTarget(target: EventTarget | null): boolean {
    return target instanceof Node && this.host.contains(target);
  }

  private severityFor(entry: AngularRenderEntry): {
    kind: "slow" | "medium" | "fast";
    label: string;
  } {
    if (entry.element && !entry.element.isConnected) {
      return { kind: "slow", label: "Memory Leak" };
    }
    const maxDuration = Math.max(entry.latestDuration, entry.averageDuration);
    if (maxDuration >= this.slowThresholdMs) {
      return { kind: "slow", label: "Slow issue" };
    }
    if (maxDuration > this.fastThresholdMs) {
      return { kind: "medium", label: "Watch" };
    }
    return { kind: "fast", label: "Healthy" };
  }

  private costFor(entry: AngularRenderEntry): string {
    const cycleDuration = this.latestCycle?.duration ?? 0;
    const cycleShare =
      cycleDuration > 0
        ? Math.round((entry.latestDuration / cycleDuration) * 100)
        : 0;
    const totalCost = entry.averageDuration * entry.count;
    return `${entry.latestDuration.toFixed(1)}ms latest, ${cycleShare}% of latest cycle, about ${totalCost.toFixed(1)}ms observed across ${entry.count} renders`;
  }

  private recommendationsFor(
    entry: AngularRenderEntry,
  ): Array<{
    category: string;
    action: string;
    severity: "slow" | "medium" | "fast";
  }> {
    const recommendations: Array<{
      category: string;
      action: string;
      severity: "slow" | "medium" | "fast";
    }> = [];

    if (entry.element && !entry.element.isConnected) {
      recommendations.push({
        category: "Memory Leak",
        action: `Component element is disconnected from the DOM but was not destroyed. Make sure subscriptions and global events are cleanly unsubscribed (e.g. takeUntilDestroyed).`,
        severity: "slow",
      });
    }

    const maxDuration = Math.max(entry.latestDuration, entry.averageDuration);
    if (maxDuration >= this.slowThresholdMs) {
      recommendations.push({
        category: "Threshold Spike",
        action: `Exceeded the slow threshold (max: ${maxDuration.toFixed(1)}ms). Audit template calculations, expensive computed values, or blocking synchronous logic in this component.`,
        severity: "slow",
      });
    }
    if (entry.reason === "input" || entry.changedInputs?.length) {
      const inputNames =
        entry.changedInputs?.map((input) => input.name).join(", ") ||
        "unspecified inputs";
      recommendations.push({
        category: "Unstable Inputs",
        action: `Re-rendered due to input changes: [${inputNames}]. Check if parent passes new object/array/function references during change detection; use stable signals or memoization.`,
        severity: "medium",
      });
    }
    if (entry.count > 5) {
      recommendations.push({
        category: "Render Fatigue",
        action: `Checked ${entry.count} times. Audit local subscriptions, interval timers, or event bindings triggering frequent CD ticks.`,
        severity: "medium",
      });
    }
    // OnPush candidate recommendation
    if (entry.isOnPushCandidate) {
      recommendations.push({
        category: "OnPush Candidate",
        action: `${entry.wastedPercentage}% of this component's renders are no-ops. Add ChangeDetectionStrategy.OnPush to prevent unnecessary checks triggered by parent CD cycles.`,
        severity: "medium",
      });
    }

    // Referential instability recommendation
    const unstableInputs =
      entry.changedInputs?.filter((i) => i.isReferentiallyUnstable) ?? [];
    if (unstableInputs.length > 0) {
      recommendations.push({
        category: "Referential Instability",
        action: `Input(s) [${unstableInputs.map((i) => i.name).join(", ")}] received new object references with the same value. Use stable factories, pure pipes, or signals to avoid reference churn that bypasses OnPush.`,
        severity: "medium",
      });
    }

    return recommendations;
  }

  private async copyComponentPrompt(
    entry: AngularRenderEntry,
    fps?: number,
  ): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
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
      .filter((cycle) =>
        cycle.entries.some((candidate) => candidate.id === entry.id),
      )
      .slice(-8)
      .map((cycle) => {
        const match = cycle.entries.find(
          (candidate) => candidate.id === entry.id,
        );
        return `- **Cycle #${cycle.id}**: Component rendered in \`${match?.latestDuration.toFixed(1)}ms\`, total cycle time \`${cycle.duration.toFixed(1)}ms\`, total rendered components: \`${cycle.renderedCount}\``;
      });
    const changedInputs = entry.changedInputs?.length
      ? entry.changedInputs
          .map(
            (input) =>
              `- \`${input.name}\`: \`${input.previous}\` -> \`${input.current}\``,
          )
          .join("\n")
      : "- none captured";
    const runtimeSignals = this.runtimeSignalPromptLines(entry);

    return [
      "# ⚡️ Component Performance Optimization Request (via angular-render-scan)",
      "I need help fixing one slow/error Angular component found by angular-render-scan. This prompt is scoped to only this component and its local evidence.",
      "",
      "---",
      "",
      "## 📊 Telemetry Diagnostics",
      "Below is the diagnostic telemetry data captured for this component:",
      `* **Component Class:** \`${entry.name}\``,
      `* **Selector:** \`${entry.selector ?? "-"}\``,
      `* **Performance Severity:** **${this.severityFor(entry).label}**`,
      `* **Trigger / Reason for Render:** \`${entry.reason ?? "unknown"}\``,
      `* **Latest render duration:** \`${entry.latestDuration.toFixed(1)}ms\``,
      `* **Average render duration:** \`${entry.averageDuration.toFixed(1)}ms\``,
      `* **Total captured renders:** ${entry.count}`,
      `* **Configured Thresholds:** Fast <= \`${this.fastThresholdMs.toFixed(1)}ms\` | Slow >= \`${this.slowThresholdMs.toFixed(1)}ms\``,
      `* **Estimated cost:** ${this.costFor(entry)}`,
      typeof fps === "number" && Number.isFinite(fps)
        ? `* **FPS during performance spike:** \`${fps} FPS\``
        : "",
      "",
      "---",
      "",
      "## 📈 Input Mutations & Changed Properties",
      "The scanner detected the following property/input changes triggering change detection:",
      "Changed inputs:",
      changedInputs,
      "",
      "Recent cycles for this component:",
      ...(recentCycles.length > 0 ? recentCycles : ["- none captured"]),
      "",
      ...(runtimeSignals.length > 0
        ? [
            "---",
            "",
            "## Runtime signals near this render",
            ...runtimeSignals,
          ]
        : []),
      "",
      "---",
      "",
      "## 🧠 Component-local recommendations from the scanner:",
      "The scanner automatically analyzed this component and surfaced the following optimization recommendations:",
      ...this.recommendationsFor(entry).map(
        (rec) => `- **[${rec.category}]** ${rec.action}`,
      ),
      "",
      "---",
      "",
      "## 🛠️ Requested Refactoring Instructions",
      "You are a senior Angular performance engineer. Please suggest concrete optimization and refactoring steps for this component. Your goal is to drastically reduce its rendering cost and avoid redundant change detection cycles.",
      "Focus on the following modern Angular practices:",
      "1. **OnPush Change Detection Strategy:** Implement OnPush change detection to stop automatic parent-to-child render propagation.",
      "2. **Angular Signals Migration:** Convert class inputs (`@Input`), output emitters (`@Output`), and component states to reactive signals and derived `computed()` selectors.",
      "3. **Optimizing Templates:** Ensure templates do not execute expensive helper methods or getters by moving them to computed signals or component lifecycle caching.",
      "4. **Stable Object/Array References:** Avoid instantiating array or object literals inside templates or parent component templates that feed into this component's inputs.",
      "5. **Proper List Tracking:** Leverage optimized track expressions in `@for` control flow blocks.",
      "",
      "Please return highly descriptive explanations along with complete TypeScript and HTML code blocks illustrating the **Before (Current)** and **After (Optimized)** states of the component. Make all refactored code clean, robust, and ready for production!",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private runtimeSignalPromptLines(entry: AngularRenderEntry): string[] {
    const angular = getAngularDebugSummary(entry.element);
    const runtime = this.runtimeTelemetry.getSummary(
      this.latestComponentWindowStart(entry),
    );
    const lines: string[] = [];

    if (angular.listenerNames.length > 0) {
      lines.push(
        `- Angular listeners on element: ${angular.listenerNames.join(", ")}`,
      );
    }
    if (angular.directiveNames.length > 0) {
      lines.push(
        `- Angular directives on element: ${angular.directiveNames.join(", ")}`,
      );
    }
    if (runtime.longTasks.count > 0) {
      lines.push(
        `- Long task overlap: ${runtime.longTasks.count} task(s), max ${runtime.longTasks.maxDuration}ms, total blocking ${runtime.longTasks.totalBlockingTime}ms.`,
      );
    }
    if (runtime.interaction) {
      lines.push(
        `- Slow interaction near render: ${runtime.interaction.name} took ${runtime.interaction.duration}ms with ${runtime.interaction.inputDelay}ms input delay.`,
      );
    }
    if (runtime.layoutShift.count > 0) {
      lines.push(
        `- Layout shift near render: ${runtime.layoutShift.score} across ${runtime.layoutShift.count} shift(s).`,
      );
    }
    if (runtime.resources.slowCount > 0) {
      lines.push(
        `- Resource activity near render: ${runtime.resources.slowCount} slow request(s), max ${runtime.resources.maxDuration}ms${runtime.resources.slowestName ? ` (${runtime.resources.slowestName})` : ""}.`,
      );
    }

    return lines;
  }

  private getEditorUrl(entry: AngularRenderEntry): string {
    const protocol = this.options.editorProtocol || "vscode";
    const query = encodeURIComponent(`class ${entry.name}`);
    if (protocol === "vscode") {
      return `vscode://vscode.code-search/search?query=${query}`;
    }
    if (protocol === "cursor") {
      return `cursor://vscode.code-search/search?query=${query}`;
    }
    if (protocol === "webstorm") {
      return `webstorm://search?query=${query}`;
    }
    return `${protocol}://search?query=${query}`;
  }

  private triggerBadgeHtml(trigger: CdTriggerAttribution): string {
    const isUserInteraction = trigger.isUserInteraction;
    const isPollution = trigger.isZonePollution;
    const color = isPollution
      ? "#f59e0b"
      : isUserInteraction
        ? "#10b981"
        : "#94a3b8";
    const icon = isPollution ? "⚠" : isUserInteraction ? "●" : "○";
    const label = trigger.source
      .replace("zone:", "")
      .replace("manual:", "")
      .replace("signal:", "signal")
      .replace("router:", "nav");
    const tooltip = `Last CD trigger: ${trigger.source}${trigger.detail ? ` (${trigger.detail})` : ""}${isPollution ? " — Zone pollution suspected" : ""}`;
    return `
      <span class="metric" data-tooltip="${escapeHtml(tooltip)}" style="min-width: 64px;">
        <span class="label">CD trigger</span>
        <span class="value" style="color: ${color}; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px; display: block;">
          ${icon} ${escapeHtml(label)}
        </span>
      </span>
    `;
  }

  private onPushPanelHtml(candidates: OnPushCandidate[]): string {
    if (!this.showOnPushPanel || candidates.length === 0) return "";
    const panelRight = this.toolbarX;
    const items = candidates
      .slice(0, 10)
      .map((c) => {
        const confColor =
          c.confidence === "high"
            ? "#10b981"
            : c.confidence === "medium"
              ? "#f59e0b"
              : "#94a3b8";
        const confLabel =
          c.confidence === "high"
            ? "HIGH"
            : c.confidence === "medium"
              ? "MED"
              : "LOW";
        return `
        <div style="padding: 8px; border-radius: 6px; border: 1px solid var(--ars-border); background: var(--ars-card-bg); display: flex; flex-direction: column; gap: 4px; font-size: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div>
              <div style="font-weight: 800; color: var(--ars-color); overflow-wrap: anywhere;">${escapeHtml(c.name)}</div>
              <div style="font-size: 8px; color: var(--ars-label); margin-top: 1px;">${escapeHtml(c.selector)}</div>
            </div>
            <span style="font-size: 8px; font-weight: 800; color: ${confColor}; border: 1px solid ${confColor}; padding: 1px 4px; border-radius: 4px; white-space: nowrap; flex-shrink: 0;">${confLabel}</span>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <span style="color: #ef4444; font-weight: 700;">${c.wastedPercentage}% wasted</span>
            <span style="color: var(--ars-label);">→</span>
            <span style="color: #10b981; font-weight: 700;">~${c.estimatedSavingPct}% saving</span>
          </div>
          <div style="color: var(--ars-label); line-height: 1.35; font-size: 9px;">${escapeHtml(c.reason)}</div>
          <div style="width: 100%; height: 3px; background: #e2e8f0; border-radius: 2px; overflow: hidden; margin-top: 2px;">
            <div style="width: ${c.wastedPercentage}%; height: 100%; background: #ef4444; opacity: 0.6;"></div>
          </div>
        </div>
      `;
      })
      .join("");

    return `
      <div class="onpush-panel" style="position: fixed; right: ${panelRight}px; bottom: ${this.toolbarY + 60}px; width: 280px; max-height: 360px; display: flex; flex-direction: column; gap: 8px; background: var(--ars-panel-bg); border: 1px solid var(--ars-border); border-top: 4px solid #7c3aed; border-radius: 12px; padding: 12px; z-index: 2147483647; box-shadow: var(--ars-shadow); pointer-events: auto; backdrop-filter: blur(16px);">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--ars-color); border-bottom: 1px solid var(--ars-border); padding-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span>⚡ OnPush Candidates</span>
          <button class="onpush-close-btn" style="background: none; border: none; color: var(--ars-label); cursor: pointer; font-size: 14px; font-weight: bold; line-height: 1;">×</button>
        </div>
        <div style="font-size: 9px; color: var(--ars-label); line-height: 1.4; padding-bottom: 4px;">
          These components use Default CD with high wasted render rates. Adding <code style="background: rgba(0,0,0,0.06); padding: 1px 3px; border-radius: 3px;">ChangeDetectionStrategy.OnPush</code> could significantly reduce unnecessary checks.
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px; overflow-y: auto; flex: 1;">
          ${items}
        </div>
      </div>
    `;
  }

  private zonePollutionPanelHtml(events: ZonePollutionEvent[]): string {
    if (!this.showZonePollutionPanel || events.length === 0) return "";
    const panelRight = this.showOnPushPanel
      ? this.toolbarX + 298
      : this.toolbarX;
    const items = events
      .slice()
      .reverse()
      .slice(0, 15)
      .map((e) => {
        const timeStr = new Date(e.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        const sourceLabel = e.source
          .replace("zone:", "")
          .replace("manual:", "")
          .replace("signal:", "signal");
        return `
        <div style="padding: 8px; border-radius: 6px; border: 1px solid var(--ars-border); background: var(--ars-card-bg); display: flex; flex-direction: column; gap: 4px; font-size: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 800; color: #f59e0b; font-size: 9px; text-transform: uppercase; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); padding: 1px 5px; border-radius: 4px;">${escapeHtml(sourceLabel)}</span>
            <span style="color: var(--ars-label); font-size: 8px;">${timeStr}</span>
          </div>
          ${e.detail ? `<div style="color: var(--ars-label); font-size: 9px; overflow-wrap: anywhere;">${escapeHtml(e.detail)}</div>` : ""}
          <div style="display: flex; gap: 8px; color: var(--ars-label);">
            <span>${e.componentCount} components</span>
            <span style="color: ${e.cycleDuration > 10 ? "#ef4444" : "#94a3b8"};">${e.cycleDuration.toFixed(1)}ms</span>
          </div>
          ${e.callSite ? `<div style="font-size: 8px; color: var(--ars-label); opacity: 0.7; overflow-wrap: anywhere; font-family: monospace;">${escapeHtml(e.callSite)}</div>` : ""}
        </div>
      `;
      })
      .join("");

    return `
      <div class="zone-pollution-panel" style="position: fixed; right: ${panelRight}px; bottom: ${this.toolbarY + 60}px; width: 270px; max-height: 360px; display: flex; flex-direction: column; gap: 8px; background: var(--ars-panel-bg); border: 1px solid var(--ars-border); border-top: 4px solid #f59e0b; border-radius: 12px; padding: 12px; z-index: 2147483647; box-shadow: var(--ars-shadow); pointer-events: auto; backdrop-filter: blur(16px);">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--ars-color); border-bottom: 1px solid var(--ars-border); padding-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span>⚠ Zone Pollution</span>
          <button class="zone-pollution-close-btn" style="background: none; border: none; color: var(--ars-label); cursor: pointer; font-size: 14px; font-weight: bold; line-height: 1;">×</button>
        </div>
        <div style="font-size: 9px; color: var(--ars-label); line-height: 1.4; padding-bottom: 4px;">
          These CD cycles were triggered by async operations with no user interaction — suspected Zone.js pollution. Use <code style="background: rgba(0,0,0,0.06); padding: 1px 3px; border-radius: 3px;">NgZone.runOutsideAngular()</code> to escape Zone.
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px; overflow-y: auto; flex: 1;">
          ${items}
        </div>
      </div>
    `;
  }

  private addBudgetViolation(violation: BudgetViolation): void {
    if (
      this.budgetViolations.some(
        (v) =>
          v.componentName === violation.componentName &&
          v.timestamp === violation.timestamp &&
          v.type === violation.type,
      )
    ) {
      return;
    }
    this.budgetViolations.push(violation);
    if (this.budgetViolations.length > 50) {
      this.budgetViolations.shift();
    }
    this.renderToolbar();
  }

  private updateDarkMode(): void {
    const mode = this.options.darkMode;
    let isDark = false;
    if (mode === "dark") {
      isDark = true;
    } else if (mode === "light") {
      isDark = false;
    } else {
      isDark =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    }
    if (isDark) {
      this.host.classList.add("dark");
    } else {
      this.host.classList.remove("dark");
    }
  }

  private cdGraphPanelHtml(): string {
    if (!this.showGraphPanel) return "";
    const graph = getCdGraph();
    const nodes = graph.nodes;
    const panelRight = this.toolbarX;

    // Build child map for tree rendering
    const childMap = new Map<string | null, typeof nodes>();
    for (const n of nodes) {
      const pid = n.parentId ?? null;
      if (!childMap.has(pid)) childMap.set(pid, []);
      childMap.get(pid)!.push(n);
    }

    const renderNode = (node: (typeof nodes)[0], depth: number): string => {
      const children = childMap.get(node.id) ?? [];
      const stratColor = node.cdStrategy === "OnPush" ? "#10b981" : "#f59e0b";
      const countColor = node.wastedChecks > 0 ? "#ef4444" : "#94a3b8";
      const indent = depth * 12;
      const childRows = children.map((c) => renderNode(c, depth + 1)).join("");
      const edgeCount =
        graph.edges.find((e) => e.toId === node.id)?.triggerCount ?? 0;
      return `
        <div style="display:flex;flex-direction:column;">
          <div style="display:flex;align-items:center;gap:5px;padding:3px 6px 3px ${indent + 6}px;border-radius:4px;transition:background .1s;" onmouseover="this.style.background='rgba(0,0,0,.04)'" onmouseout="this.style.background=''">
            ${depth > 0 ? `<span style="color:#cbd5e1;font-size:9px;flex-shrink:0;">↳</span>` : ""}
            <span style="font-size:10px;font-weight:600;color:var(--ars-color);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(node.name)}">${escapeHtml(node.name)}</span>
            ${edgeCount > 0 ? `<span style="font-size:8px;color:#94a3b8;flex-shrink:0;">${edgeCount}×</span>` : ""}
            <span style="font-size:8px;font-weight:700;color:${stratColor};flex-shrink:0;border:1px solid ${stratColor};padding:0 3px;border-radius:3px;">${node.cdStrategy === "OnPush" ? "OP" : "D"}</span>
            <span style="font-size:9px;font-family:monospace;color:${countColor};flex-shrink:0;">${node.renderCount}r${node.wastedChecks > 0 ? ` ${node.wastedChecks}w` : ""}</span>
          </div>
          ${childRows}
        </div>
      `;
    };

    const roots = childMap.get(null) ?? nodes.filter((n) => !n.parentId);
    const treeHtml = this.graphCollapsed
      ? ""
      : roots.length > 0
        ? roots.map((n) => renderNode(n, 0)).join("")
        : `<div style="padding:12px;text-align:center;font-size:10px;color:var(--ars-label);">No component data yet — interact with the app.</div>`;

    const onPushCount = nodes.filter((n) => n.cdStrategy === "OnPush").length;
    const defaultCount = nodes.filter((n) => n.cdStrategy !== "OnPush").length;
    const wastedTotal = nodes.reduce((s, n) => s + n.wastedChecks, 0);

    return `
      <div class="cd-graph-panel" style="position:fixed;right:${this.toolbarX}px;bottom:${this.toolbarY + 60}px;width:280px;max-height:${this.graphCollapsed ? "auto" : "400px"};display:flex;flex-direction:column;background:var(--ars-panel-bg);border:1px solid var(--ars-border);border-top:3px solid #06b6d4;border-radius:10px;z-index:2147483647;box-shadow:var(--ars-shadow);pointer-events:auto;backdrop-filter:blur(16px);overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:${this.graphCollapsed ? "none" : "1px solid var(--ars-border)"}>">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:11px;font-weight:800;color:var(--ars-color);">⬡ CD Render Graph</span>
            ${nodes.length > 0 ? `<span style="font-size:9px;color:var(--ars-label);">${nodes.length} components</span>` : ""}
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <button class="graph-collapse-btn" style="background:none;border:none;color:var(--ars-label);cursor:pointer;font-size:12px;line-height:1;padding:2px 4px;">${this.graphCollapsed ? "▼" : "▲"}</button>
            <button class="graph-close-btn" style="background:none;border:none;color:var(--ars-label);cursor:pointer;font-size:14px;line-height:1;padding:2px 4px;">×</button>
          </div>
        </div>
        ${
          !this.graphCollapsed
            ? `
        <div style="display:flex;gap:6px;padding:6px 10px;border-bottom:1px solid var(--ars-border);flex-shrink:0;">
          <span style="font-size:9px;font-weight:700;color:#10b981;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);padding:2px 6px;border-radius:4px;">OnPush: ${onPushCount}</span>
          <span style="font-size:9px;font-weight:700;color:#f59e0b;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);padding:2px 6px;border-radius:4px;">Default: ${defaultCount}</span>
          ${wastedTotal > 0 ? `<span style="font-size:9px;font-weight:700;color:#ef4444;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);padding:2px 6px;border-radius:4px;">Wasted: ${wastedTotal}</span>` : ""}
        </div>
        <div style="overflow-y:auto;flex:1;padding:4px 4px 8px;">
          ${treeHtml}
        </div>
        <div style="padding:6px 10px;border-top:1px solid var(--ars-border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
          <span style="font-size:9px;color:var(--ars-label);">OP=OnPush D=Default · r=renders w=wasted</span>
          <button class="graph-refresh-btn" style="font-size:9px;font-weight:700;background:rgba(6,182,212,.1);border:1px solid rgba(6,182,212,.2);color:#06b6d4;border-radius:4px;padding:2px 6px;cursor:pointer;">↺ Refresh</button>
        </div>
        `
            : ""
        }
      </div>
    `;
  }

  private waterfallPanelHtml(): string {
    if (!this.showWaterfallPanel || !this.latestCycle) return "";
    const cycle = this.latestCycle;
    const waterfall = cycle.waterfall || [];
    const rightOffset = this.showCpuDetails
      ? this.toolbarX + 290
      : this.toolbarX + 120;
    if (waterfall.length === 0) {
      return `
        <div class="waterfall-panel" style="position: fixed; right: ${rightOffset}px; bottom: ${this.toolbarY + 60}px; width: 300px; background: var(--ars-panel-bg); border: 1px solid var(--ars-border); border-radius: 12px; padding: 12px; z-index: 2147483647; box-shadow: var(--ars-shadow); pointer-events: auto;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--ars-label); border-bottom: 1px solid var(--ars-border); padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <span>CD Waterfall</span>
            <button class="waterfall-close-btn" style="background: none; border: none; color: var(--ars-label); cursor: pointer; font-size: 12px;">×</button>
          </div>
          <div style="font-size: 10px; color: var(--ars-label); padding: 12px; text-align: center;">No waterfall data for this cycle</div>
        </div>
      `;
    }

    const maxOffset = Math.max(
      ...waterfall.map((w) => w.startOffset + w.totalDuration),
      1,
    );
    const items = waterfall
      .map((w) => {
        const leftPct = (w.startOffset / maxOffset) * 100;
        const widthPct = Math.max(2, (w.totalDuration / maxOffset) * 100);
        const indent = w.depth * 8;
        const color =
          w.selfDuration >= this.slowThresholdMs
            ? "#ef4444"
            : w.selfDuration > this.fastThresholdMs
              ? "#f59e0b"
              : "#3b82f6";
        return `
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 9px; margin-bottom: 4px;">
          <span style="display: block; width: 100px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; padding-left: ${indent}px; color: var(--ars-color); font-weight: ${w.depth === 1 ? "700" : "normal"}">
            ${escapeHtml(w.name)}
          </span>
          <div style="flex: 1; height: 8px; background: rgba(0,0,0,0.05); border-radius: 4px; position: relative; margin: 0 8px;">
            <div style="position: absolute; left: ${leftPct}%; width: ${widthPct}%; height: 100%; background: ${color}; border-radius: 4px;" title="Total: ${w.totalDuration.toFixed(1)}ms (Self: ${w.selfDuration.toFixed(1)}ms)"></div>
          </div>
          <span style="font-family: monospace; color: var(--ars-label); min-width: 36px; text-align: right;">${w.selfDuration.toFixed(1)}ms</span>
        </div>
      `;
      })
      .join("");

    return `
      <div class="waterfall-panel" style="position: fixed; right: ${rightOffset}px; bottom: ${this.toolbarY + 60}px; width: 300px; max-height: 240px; overflow-y: auto; background: var(--ars-panel-bg); border: 1px solid var(--ars-border); border-radius: 12px; padding: 12px; z-index: 2147483647; box-shadow: var(--ars-shadow); pointer-events: auto;">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--ars-label); border-bottom: 1px solid var(--ars-border); padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span>Waterfall (Cycle #${cycle.id})</span>
          <button class="waterfall-close-btn" style="background: none; border: none; color: var(--ars-label); cursor: pointer; font-size: 12px;">×</button>
        </div>
        <div style="display: flex; flex-direction: column;">
          ${items}
        </div>
      </div>
    `;
  }

  private alertsPanelHtml(): string {
    if (!this.showAlertsPanel || this.budgetViolations.length === 0) return "";

    const itemsHtml = this.budgetViolations
      .slice()
      .reverse()
      .map((v) => {
        const typeLabel =
          v.type === "error"
            ? "ERROR"
            : v.type === "render-rate"
              ? "RATE"
              : "WARN";
        const typeColor =
          v.type === "error"
            ? "#ef4444"
            : v.type === "render-rate"
              ? "#3b82f6"
              : "#f59e0b";
        const timeStr = new Date(v.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        return `
        <div style="padding: 8px; border-radius: 6px; border: 1px solid var(--ars-border); background: var(--ars-card-bg); display: flex; flex-direction: column; gap: 4px; font-size: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 800; color: ${typeColor}; font-size: 8px; text-transform: uppercase; border: 1px solid ${typeColor}; padding: 1px 4px; border-radius: 4px;">
              ${typeLabel}
            </span>
            <span style="color: var(--ars-label); font-size: 8px;">${timeStr}</span>
          </div>
          <div style="font-weight: 700; color: var(--ars-color); overflow-wrap: anywhere;">${escapeHtml(v.componentName)}</div>
          <div style="color: var(--ars-label); line-height: 1.35;">${escapeHtml(v.message)}</div>
        </div>
      `;
      })
      .join("");

    let alertsRight = this.toolbarX + 120;
    if (this.showCpuDetails) {
      alertsRight += 170;
    }
    if (this.showWaterfallPanel) {
      alertsRight += 310;
    }

    return `
      <div class="alerts-panel" style="position: fixed; right: ${alertsRight}px; bottom: ${this.toolbarY + 60}px; width: 280px; max-height: 300px; display: flex; flex-direction: column; gap: 8px; background: var(--ars-panel-bg); border: 1px solid var(--ars-border); border-top: 4px solid #ef4444; border-radius: 12px; padding: 12px; z-index: 2147483647; box-shadow: var(--ars-shadow); pointer-events: auto; backdrop-filter: blur(16px);">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--ars-color); border-bottom: 1px solid var(--ars-border); padding-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span style="display: inline-flex; align-items: center; gap: 4px;">
            <span>⚠️ Budget Violations</span>
          </span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="clear-alerts-btn" style="background: none; border: none; color: #ef4444; font-size: 9px; font-weight: 700; cursor: pointer; text-transform: uppercase; padding: 2px 6px; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 4px;">Clear All</button>
            <button class="alerts-close-btn" style="background: none; border: none; color: var(--ars-label); cursor: pointer; font-size: 14px; font-weight: bold; line-height: 1;">×</button>
          </div>
        </div>
        <div class="alerts-list" style="display: flex; flex-direction: column; gap: 6px; overflow-y: auto; flex: 1; padding-right: 2px;">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  private signalsPanelHtml(): string {
    return "";
  }

  private costPanelHtml(): string {
    return "";
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
  return (
    inner.left >= outer.left - tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.right <= outer.right + tolerance &&
    inner.bottom <= outer.bottom + tolerance
  );
}

function truncateText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (context.measureText(text).width <= maxWidth) {
    return text;
  }

  const ellipsis = "...";
  let next = text;
  while (
    next.length > 0 &&
    context.measureText(`${next}${ellipsis}`).width > maxWidth
  ) {
    next = next.slice(0, -1);
  }

  return next ? `${next}${ellipsis}` : ellipsis;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
