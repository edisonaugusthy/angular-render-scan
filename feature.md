# Feature Spec

## Product Goal

Angular Scan gives developers an on-page, React Scan-like view of Angular change detection. Enable the package, interact with a real Angular app, and immediately see which components participated in change detection, how often, and how long the latest checks took using Auto-instrumentation.

## Domain Model (DDD Structure)

The project is structured using Domain-Driven Design (DDD) principles:
- `src/domain/`: Core business models (`AngularScanOptions`, `AngularRenderEntry`, `AngularRenderCycle`, `AngularScanTheme`) and configuration logic (`options.ts`).
- `src/application/`: Application orchestration (`runtime.ts`) and stateful component statistics aggregation (`stats.ts`).
- `src/infrastructure/ui/`: External DOM interaction, canvas drawing (`overlay.ts`), and framerate timing (`fps.ts`).
- `src/infrastructure/angular/`: Framework-specific integrations, providers, directives, and auto-instrumentation (`angular.ts`, `auto-instrumentation.ts`).

## Current Feature Slice

- **Public API:** `scan`, `setOptions`, `getOptions`, `stop`.
- **Angular Integration:** Provider mode wraps `ApplicationRef.tick()` for full-cycle timing and uses Angular's internal global `ɵsetProfiler` for zero-setup component auto-instrumentation.
- **Production Safety:** Built-in `isDevMode()` guard entirely shuts down the scanner for production builds unless bypassed via `dangerouslyForceRunInProduction`.
- **Overlay:** Fixed canvas plus shadow-DOM toolbar. Features include pointer-events passthrough, draggable toolbar, clear stats button, checkbox toggle, sampled FPS, current cycle time, changed-component count, and slowest component.
- **UX & Visuals:** Configurable color themes with Heatmap styling: components updating under 5ms are blue, up to 15ms are yellow, and above 15ms display a red error border. 
- **Developer Tools:** Click-to-inspect (Cmd/Ctrl+Click) captures the component instance and logs it. Console reporting (`log: true`) prints a native `console.table()` of cycle data.
- **Demo app:** E-Commerce storefront featuring a layout with `OnPush` components, signal bindings, and mocked expensive operations.

## Design Direction

The overlay feels close to React Scan: lightweight, bright, and developer-tool oriented. Highlights use a soft light-blue to violet treatment with red accents for poor performance.

To update the color, change the `theme` option in your `AngularScanOptions` config:

- `fast`: Color for sub-5ms renders.
- `medium`: Color for 5-15ms renders.
- `slow`: Color for >15ms renders.
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

- "Why did this render?" change-cause analysis via `@Input()` tracking or Angular 18's new change detection signals.
- Configurable thresholds for the heat map (currently hardcoded to 5ms/15ms).
- More robust cycle correlation for async updates.
- Angular 9, 16, and latest compatibility smoke matrix.

## Non-Goals For This Slice

- Flame graph.
- Recording export.
- Source-trigger analysis.
- Deep signal dependency graphs.
- Full Angular DevTools profiler parity.