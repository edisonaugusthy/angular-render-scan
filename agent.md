# Agent Guide

This repository should be evolved as a small product-quality Angular instrumentation package, not as a one-off demo. Use domain-driven design for feature work and keep the runtime API typed, narrow, and testable.

## Working Principles

- Treat `angular-render-scan` as the core domain. Demo app code should prove behavior, not contain package logic.
- Keep domain concepts explicit: scan options, render entries, render cycles, component stats, overlay rendering, and Angular integration.
- Prefer small modules with clear ownership over broad utility files.
- Add types before behavior when a feature expands public or internal contracts.
- Preserve the investor-demo path: install package, enable scan, trigger Angular updates, see toolbar and highlights immediately.

## Domain Boundaries

- `packages/angular-render-scan/src/domain/entities.ts`: public and shared domain contracts.
- `packages/angular-render-scan/src/domain/options.ts`: option validation and defaults.
- `packages/angular-render-scan/src/application/stats.ts`: runtime component statistics and cycle aggregation.
- `packages/angular-render-scan/src/application/runtime.ts`: public scanner lifecycle and cycle orchestration.
- `packages/angular-render-scan/src/infrastructure/angular/`: Angular-specific provider, directive, and auto-instrumentation integration.
- `packages/angular-render-scan/src/infrastructure/ui/`: presentation layer for toolbar, canvas outlines, labels, and FPS.
- `demo/`: consumer app only. Do not move package behavior into the demo.

## Style Guide

- Use strict TypeScript and avoid `any`. Prefer exported interfaces for public contracts and local interfaces for implementation details.
- Keep public API compatibility in mind before renaming options, callbacks, or entry fields.
- Keep functions deterministic where possible. DOM and Angular integration should be isolated at the boundary.
- Avoid ad hoc string parsing for Angular runtime behavior. Prefer typed Angular APIs, explicit metadata checks, or documented fallback paths.
- Keep visual changes token-like and easy to adjust. Overlay colors should be declared near the rendering code and documented in `feature.md`.
- Add focused tests for option behavior, timing aggregation, FPS, stats reset, and new public contracts.

## DDD Feature Flow

1. Define the domain language in `feature.md`.
2. Add or update types in `src/domain/entities.ts`.
3. Implement core behavior in the domain module that owns it.
4. Add Angular integration only after the package-level behavior is clear.
5. Update the demo to exercise the feature.
6. Add unit tests and Playwright coverage for user-visible behavior.
7. Update README with usage, limitations, and screenshots when the feature changes the demo.

## Quality Bar

- `npm run test` must pass.
- `npm run build` must pass.
- `npm run test:e2e` should pass for demo-facing behavior.
- New visual behavior should be checked in a browser-sized viewport and a mobile viewport when practical.
- Document known limitations honestly. Do not claim full Ivy or signal dependency tracing until it is implemented and tested.
