# Feature Spec

## Product Goal

Angular Render Scan gives developers an on-page, React Scan-like view of Angular change detection. Enable the package, interact with a real Angular app, and immediately see which components participated in change detection, how often, and how long the latest checks took using Auto-instrumentation.

## Domain Model (DDD Structure)

The project is structured using Domain-Driven Design (DDD) principles:
- `src/domain/`: Core business models (`AngularRenderScanOptions`, `AngularRenderEntry`, `AngularRenderCycle`, `AngularRenderScanTheme`) and configuration logic (`options.ts`).
- `src/application/`: Application orchestration (`runtime.ts`) and stateful component statistics aggregation (`stats.ts`).
- `src/infrastructure/ui/`: External DOM interaction, canvas drawing (`overlay.ts`), and framerate timing (`fps.ts`).
- `src/infrastructure/angular/`: Framework-specific integrations, providers, directives, and auto-instrumentation (`angular.ts`, `auto-instrumentation.ts`).

## Current Feature Slice

- **Public API:** `scan`, `setOptions`, `getOptions`, `stop`, `getSessionData`, `getWastedStats`, `getLeakedComponents`, `startRenderAudit`, `getOnPushCandidates`, `getReferentialInstability`, `getZonePollutionEvents`, `getCdGraph`.
- **Angular Integration:** Provider mode wraps `ApplicationRef.tick()` for full-cycle timing and uses Angular's internal global `ɵsetProfiler` for zero-setup component auto-instrumentation. Reads `ɵcmp.changeDetection` metadata for CD strategy per component. Supports manual directives as a fallback.
- **Production Safety:** Built-in `isDevMode()` guard entirely shuts down the scanner for production builds unless bypassed via `dangerouslyForceRunInProduction`. Zone tracker is lazy-loaded so it tree-shakes to a 440-byte lazy chunk in production. `angular-render-scan/noop` subpath exports safe no-op stubs for SSR and unit tests.
- **CD Trigger Attribution:** Zone.js hook via `Zone.current.fork()` intercepts task lifecycle and classifies what fired each CD cycle: `zone:click`, `zone:setTimeout`, `zone:xhr`, `zone:fetch`, `signal:write`, `router:navigation`, `manual:markForCheck`, etc. The trigger is attached to `AngularRenderCycle` and displayed in the toolbar.
- **OnPush Candidates Surface:** `analyzeOnPushCandidates()` filters Default CD components by wasted-render percentage and assigns confidence scores. New toolbar chip shows count; panel ranks candidates. `getOnPushCandidates()` exposed on public API and included in session export + AI prompt.
- **Referential Input Stability Detection:** `checkReferentialStability()` deep-serializes `@Input()` values (configurable depth, default 4) and flags new references with identical values as `isReferentiallyUnstable: true`. Reported per input in the inspect panel with an **UNSTABLE REF** badge. `getReferentialInstability()` on public API.
- **Zone Pollution Detector:** Flags cycles with no user interaction, no signal write, and no router navigation as suspected pollution. Dispatches `angular-render-scan:zone-pollution` custom events. Toolbar **⚠ Zone** chip opens a scrollable feed. `onZonePollution` callback + `getZonePollutionEvents()` on public API.
- **Change Detection Graph:** `buildCdGraph()` accumulates parent→child render relationships across the session. `getCdGraph()` returns nodes (cdStrategy, renderCount, wastedChecks, isOnPushCandidate) and edges (parentId→childId trigger counts).
- **npx CLI Installer:** `npx angular-render-scan-cli init` auto-detects `angular.json`, installs the npm package, finds `main.ts` or `app.config.ts`, and patches `provideAngularRenderScan()` into providers. Supports `--dry-run`, `--force`, `--script-tag` (index.html CDN mode).
- **Overlay:** Fixed canvas plus shadow-DOM toolbar. Features include pointer-events passthrough, draggable toolbar, clear stats button, checkbox toggle, sampled FPS, current cycle time, CPU main thread tracking, slowest component, CD trigger badge, OnPush chip + panel, Zone pollution chip + feed.
- **UX & Visuals:** Sleek dark-mode capabilities out of the box, customizable color themes, and inline SVG timeline sparklines.
- **DOM Mutation Heatmap:** Outline border flashes are colored dynamically: **green** for no-ops/wasted renders, **blue** for text/attribute changes, and **red** for structural layout modifications.
- **Performance Budgets & Toast Alerts:** Standardized warning, error, and rendering-rate millisecond limits. Violet/amber/red toasts float above the toolbar live on performance violations.
- **CD Waterfall View:** Expandable timeline panel visualizes rendering duration tree stack offsets and nested child durations.
- **Memory Leak Detector:** Audits zombie components whose DOM host elements have been disconnected but not properly garbage collected.
- **Click-to-Source IDE Integration:** Pinned recommendations details panel has deep links to open files directly in Cursor, VS Code, or WebStorm.
- **Session Export:** Downloadable JSON file profiling reports containing full cycle stats, budget violations, memory leak listings, OnPush candidates, Zone pollution events, and referential instability reports.
- **Headless Audit E2E API:** Playwright-compatible `startRenderAudit` API for continuous integration performance gate-keeping.
- **Demo app:** Cyberpunk storefront dashboard displaying OnPush updates, signal bindings, expensive computations, grid overlays, dark mode, and memory leak sandbox simulations.

## Design Direction

The overlay feels close to React Scan: lightweight, bright, and developer-tool oriented. Highlights use a soft light-blue to violet treatment with red accents for poor performance.

To update the color, change the `theme` option in your `AngularRenderScanOptions` config:

- `fast`: Color for sub-5ms renders.
- `medium`: Color for 5-10ms renders.
- `slow`: Color for >=10ms renders.
- `labelBackground`: Background for fast/medium chips.
- `labelBackgroundSlow`: Background for slow chips.

Alpha values are kept in the paint loop so highlights fade smoothly with `animationSpeed`.

## DDD Implementation Rules

- Keep scanner lifecycle in `application/runtime.ts`; do not call overlay internals directly from the Angular integration.
- Keep Angular-specific patching and auto-instrumentation in `infrastructure/angular/`.
- Keep all aggregation in `application/stats.ts`; the overlay should consume finished cycles and entries only.
- Keep visual rendering in `infrastructure/ui/overlay.ts`; domain modules should not know about the canvas or shadow DOM.
- Prefer explicit fallback behavior over silent best-effort instrumentation.

## Next Feature Candidates

- Visual CD graph panel in the overlay (force-directed or hierarchy layout of `getCdGraph()` output).
- Signal dependency tracking — which signals triggered a specific component re-check.
- Configurable thresholds for the heat map (currently derived from default budgets: 5ms/10ms).
- More robust cycle correlation for async updates.
- Angular 9, 16, and latest compatibility smoke matrix.
- Playwright headless integration for `getZonePollutionEvents()` and `getOnPushCandidates()`.

## Non-Goals For This Slice

- Flame graph.
- Recording export.
- Full Angular DevTools profiler parity.