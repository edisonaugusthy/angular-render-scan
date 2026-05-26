# Angular Render Scan

Angular Render Scan is a visual debugging overlay for Angular change detection. It is inspired by the React Scan experience: install it, run your app, interact with the UI, and see which Angular components are updating, how often they update, and how long they take.

![Angular Render Scan demo](docs/assets/angular-render-scan-demo.png)

## Features

- Automatic Angular instrumentation through Angular dev-mode profiler hooks where available.
- Provider-based setup for Angular apps.
- Floating shadow-DOM toolbar with scan on/off, FPS, latest cycle time, changed component count, and slowest component.
- Canvas highlights around updated components.
- Compact component labels with component name, count, and latest duration.
- Heatmap colors for fast, medium, and slow updates.
- Optional console reports with `console.table()`.
- Details mode for hover-to-highlight inspection and pinned component recommendation panels.
- Draggable toolbar.
- Noise controls for minimum duration, render count, include/exclude filters, and label caps.
- Configurable fast/slow performance thresholds.
- Copy self-contained AI-ready prompts focused on slow/error components, issue context, and estimated cost.
- Production guard by default.

## Install

```sh
npm install angular-render-scan
```

Angular Render Scan expects Angular 9+ as a peer dependency.

## Quick Start

Add `provideAngularRenderScan()` to your Angular bootstrap providers.

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAngularRenderScan } from 'angular-render-scan';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideAngularRenderScan({
      enabled: true,
      animationSpeed: 'fast',
      slowThresholdMs: 15
    })
  ]
});
```

Open your app in development mode and interact with the UI. Updated components will flash on screen and the toolbar will update live.

## Script Usage

The package also exposes a browser global build for script-tag style usage.

```html
<script src="https://unpkg.com/angular-render-scan/dist/auto.global.js"></script>
```

The global build starts the overlay with default options. For Angular component-level instrumentation, provider mode is still recommended because it has access to Angular app references and dev-mode hooks.

## API

```ts
import {
  copyAIPrompt,
  getAIPrompt,
  getOptions,
  scan,
  setOptions,
  stop
} from 'angular-render-scan';

scan();
setOptions({ enabled: false });
setOptions({ enabled: true, log: true });
console.log(getAIPrompt());
await copyAIPrompt();
console.log(getOptions());
stop();
```

### `scan(options?)`

Starts Angular Render Scan and creates the overlay if it is not already mounted.

```ts
scan({
  enabled: true,
  showToolbar: true,
  animationSpeed: 'fast'
});
```

### `setOptions(options)`

Updates scanner options at runtime.

```ts
setOptions({
  log: true,
  animationSpeed: 'slow'
});
```

### `getOptions()`

Returns the current resolved options.

```ts
const options = getOptions();
```

### `stop()`

Destroys the overlay and clears scanner state.

```ts
stop();
```

## Options

```ts
interface AngularRenderScanOptions {
  enabled?: boolean;
  showToolbar?: boolean;
  animationSpeed?: 'slow' | 'fast' | 'off';
  showFPS?: boolean;
  log?: boolean;
  dangerouslyForceRunInProduction?: boolean;
  minDurationMs?: number;
  minRenderCount?: number;
  include?: Array<string | RegExp>;
  exclude?: Array<string | RegExp>;
  maxLabelCount?: number;
  fastThresholdMs?: number;
  slowThresholdMs?: number;
  maxRecordedCycles?: number;
  showCopyPrompt?: boolean;
  promptContext?: string;
  theme?: Partial<AngularRenderScanTheme>;
  onCycleStart?: () => void;
  onRender?: (entry: AngularRenderEntry) => void;
  onCycleFinish?: (cycle: AngularRenderCycle) => void;
}
```

### Common Options

```ts
provideAngularRenderScan({
  enabled: true,
  showToolbar: true,
  showFPS: true,
  animationSpeed: 'fast',
  fastThresholdMs: 5,
  slowThresholdMs: 15,
  maxLabelCount: 20,
  maxRecordedCycles: 30,
  showCopyPrompt: true,
  log: false
});
```

- `enabled`: turns scanning on or off.
- `showToolbar`: shows or hides the floating toolbar.
- `animationSpeed`: controls highlight readability. `'fast'` keeps borders visible for about 1.2s, `'slow'` keeps them visible for about 2.4s, and `'off'` disables visual flashes.
- `showFPS`: shows FPS in the toolbar.
- `log`: prints cycle summaries to the console.
- `dangerouslyForceRunInProduction`: allows the scanner to run outside Angular dev mode.
- `minDurationMs`, `minRenderCount`, `include`, `exclude`: filter low-signal render entries.
- `maxLabelCount`: limits how many highlighted components receive labels.
- `fastThresholdMs`, `slowThresholdMs`: tune heatmap thresholds.
- `maxRecordedCycles`: controls how many recent cycles are included in the copied AI prompt.
- `showCopyPrompt`, `promptContext`: control the copyable AI performance prompt.

### Basic Debug Config

```ts
provideAngularRenderScan({
  enabled: true,
  showToolbar: true,
  animationSpeed: 'slow',
  fastThresholdMs: 5,
  slowThresholdMs: 15,
  maxLabelCount: 12,
  maxRecordedCycles: 20,
  promptContext: 'Angular app using signals and OnPush components'
});
```

Use `animationSpeed: 'slow'` when you want more time to read the borders and labels while interacting with the page.

## Callbacks

```ts
provideAngularRenderScan({
  onCycleStart() {
    console.log('cycle started');
  },
  onRender(entry) {
    console.log(entry.name, entry.latestDuration);
  },
  onCycleFinish(cycle) {
    console.log(cycle.renderedCount, cycle.slowest?.name);
  }
});
```

```ts
interface AngularRenderEntry {
  id: string;
  name: string;
  element: Element;
  rect: DOMRect;
  count: number;
  latestDuration: number;
  averageDuration: number;
  latestCycleId: number;
  reason?: 'input' | 'event' | 'tick' | 'dom' | 'unknown';
  changedInputs?: Array<{ name: string; previous: string; current: string }>;
  selector?: string;
}

interface AngularRenderCycle {
  id: number;
  startedAt: number;
  finishedAt: number;
  duration: number;
  renderedCount: number;
  slowest?: AngularRenderEntry;
  entries: AngularRenderEntry[];
}
```

## Theme

Use `theme` to tune the highlight colors.

```ts
provideAngularRenderScan({
  theme: {
    fast: [147, 197, 253],
    medium: [253, 224, 71],
    slow: [239, 68, 68],
    labelBackground: [124, 58, 237],
    labelBackgroundSlow: [220, 38, 38]
  }
});
```

```ts
interface AngularRenderScanTheme {
  fast: readonly [number, number, number];
  medium: readonly [number, number, number];
  slow: readonly [number, number, number];
  labelBackground: readonly [number, number, number];
  labelBackgroundSlow: readonly [number, number, number];
}
```

## Toolbar

The toolbar shows:

- scan on/off switch
- FPS
- latest cycle time
- changed component count
- slowest component
- copy slow issues prompt
- clear stats button

Drag the toolbar to move it. Use `Details` to inspect one component at a time and pin a recommendation panel.

## Details Mode

Use the `Details` checkbox in the toolbar to inspect individual components without keyboard modifiers.

1. Interact with the page so Angular Render Scan captures a render cycle.
2. Check `Details` in the toolbar.
3. Hover over a captured component to show a dashed highlight.
4. Click the component to pin the recommendation panel.
5. Close the panel when finished.

The recommendation panel shows severity, latest duration, average duration, render count, reason, selector, changed inputs, recent cycles, estimated cost, and component-local Angular recommendations based on the captured issue. For slow components, the panel also shows `Copy Slow Issue Prompt`, which copies a prompt for only that component.

## AI Performance Prompt

Use `Copy Slow Issues Prompt` in the toolbar, or call `getAIPrompt()` / `copyAIPrompt()`, to generate a self-contained prompt for an AI coding assistant. The prompt includes environment details, recent cycle history, the latest cycle, configured thresholds, and an issue list for components over `slowThresholdMs`.

The copied prompt is intentionally focused: it does not copy every render entry. It lists slow components with selector, latest render time, average render time, render count, reason, changed inputs when available, and an estimated cost based on latest duration, cycle share, and observed render count. It does not include raw DOM nodes, component instances, or source code.

```ts
provideAngularRenderScan({
  promptContext: 'Angular 18 app using signals and OnPush components',
  maxRecordedCycles: 20
});
```

## Manual Marking

Automatic instrumentation is preferred. If you need a specific manual target, you can still mark an element with `AngularRenderScanMarkDirective`.

```ts
import { AngularRenderScanMarkDirective } from 'angular-render-scan';

@Component({
  standalone: true,
  imports: [AngularRenderScanMarkDirective],
  template: `
    <section angularRenderScanMark="CartSummaryComponent">
      ...
    </section>
  `
})
export class CartSummaryComponent {}
```

## Production Behavior

Angular Render Scan is intended for development and demo debugging. Provider mode checks Angular `isDevMode()` and does not run in production unless explicitly enabled.

```ts
provideAngularRenderScan({
  dangerouslyForceRunInProduction: true
});
```

Use that option carefully. The scanner adds runtime instrumentation, DOM reads, canvas work, and console/debug behavior.

## Demo

Run the local demo:

```sh
npm install
npm run dev
```

Open:

```txt
http://127.0.0.1:4200/
```

The demo includes signal updates, `OnPush` updates, nested components, and intentionally slow work to show the heatmap behavior.

## Development

```sh
npm run test
npm run build
npm run test:e2e
```

Useful project docs:

- [agent.md](agent.md): DDD rules, domain boundaries, type/style guide, and quality bar.
- [feature.md](feature.md): feature spec, domain model, and roadmap.

## Release

Release runs automatically when changes are pushed to `main`. The workflow bumps
`packages/angular-render-scan/package.json` by one patch version, commits that
version bump back to `main`, publishes the package to npm, and creates a GitHub
release for the new version.

Before the first automated publish, add a valid npm publish token as the GitHub
Actions secret `NPM_TOKEN`. After the package exists on npm, you can instead
configure npm trusted publishing for repository `edisonaugusthy/angular-render-scan`
and workflow filename `release.yml`.

To publish manually:

1. Go to GitHub Actions.
2. Select `Release`.
3. Choose the `main` branch.
4. Click `Run workflow`.
