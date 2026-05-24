# Feature Spec

## Product Goal

Angular Scan gives developers an on-page, React Scan-like view of Angular change detection. The first product slice is an investor-demo workflow: enable the package, interact with a real Angular app, and immediately see which components participated in change detection, how often, and how long the latest checks took.

## Domain Model

- `AngularScanOptions`: user-controlled scanner configuration.
- `AngularRenderEntry`: one component's latest check/render observation.
- `AngularRenderCycle`: one Angular change-detection cycle with timing, count, entries, and slowest component.
- Component stats: accumulated checks, latest duration, average duration, host element, and latest cycle id.
- Overlay: visual projection of domain state through toolbar metrics, canvas outlines, and compact labels.

## Current Feature Slice

- Public API: `scan`, `setOptions`, `getOptions`, `stop`.
- Angular provider mode: wraps `ApplicationRef.tick()` for full-cycle timing.
- Component marker directive: `angularScanMark` gives reliable v1 component names, elements, counts, and durations. Marked checks create a microtask-batched cycle when Angular updates outside the patched `tick()` path, then report only components whose rendered text or position changed.
- Overlay: fixed canvas plus shadow-DOM toolbar with no pointer blocking outside the toolbar, an on/off checkbox switch, sampled FPS, current cycle time, current changed-component count, and current slowest component.
- Demo app: counter, nested parent, nested item components, slow component, OnPush component, and signal component.
- Tests: options, FPS, stats aggregation, toolbar behavior, scanner toggle, and slowest component visibility.

## Design Direction

The overlay should feel close to React Scan: lightweight, bright, and developer-tool oriented. Highlights use a soft light-blue to violet treatment instead of a heavy dark outline.

Current highlight tokens live in `packages/angular-scan/src/overlay.ts`:

```ts
const HIGHLIGHT_STROKE = [147, 197, 253];
const HIGHLIGHT_GLOW = [216, 180, 254];
const LABEL_BACKGROUND = [124, 58, 237];
```

To update the color, change these tokens first:

- `HIGHLIGHT_STROKE`: primary component outline color.
- `HIGHLIGHT_GLOW`: secondary glow/shadow color.
- `LABEL_BACKGROUND`: label chip background.

Keep alpha values in the paint loop so highlights fade smoothly with `animationSpeed`.

## DDD Implementation Rules

- Keep scanner lifecycle in `runtime.ts`; do not call overlay internals from Angular integration.
- Keep Angular-specific patching and directives in `angular.ts`.
- Keep visible-update filtering in the Angular integration boundary. Stats should receive already-qualified render entries, not every checked component.
- Keep all aggregation in `stats.ts`; overlay should consume finished cycles and entries only.
- Keep visual rendering in `overlay.ts`; domain modules should not know about canvas or shadow DOM. Labels should favor the most specific updated component to avoid nested label overlap.
- Add a public type only when external consumers need it.
- Prefer explicit fallback behavior over silent best-effort instrumentation.

## Next Feature Candidates

- Automatic component discovery through safe Angular dev-mode metadata.
- Production guard that only runs when `dangerouslyForceRunInProduction` is true.
- Configurable overlay theme with typed color options.
- More robust cycle correlation for async updates.
- Angular 9, 16, and latest compatibility smoke matrix.
- Optional console event format with stable names for external tooling.
- Signal-aware labels only after the basic change-detection story is reliable.

## Non-Goals For This Slice

- Flame graph.
- Recording export.
- Source-trigger analysis.
- Deep signal dependency graphs.
- Full Angular DevTools profiler parity.
