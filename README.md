# Angular Scan

Angular Scan is a developer tool visual overlay for tracking and debugging Angular change detection. It mirrors the React Scan style of experience: a floating toolbar, component outlines, performance heatmaps, compact labels, FPS, latest cycle timing, checked component count, and slowest component tracking.

![Angular Scan demo](docs/assets/angular-scan-demo.png)

## Project Docs

- [agent.md](agent.md): Repo rules for DDD, type quality, style, and verification.
- [feature.md](feature.md): Feature spec, domain model, and completed roadmap.

## Features

- **Auto-instrumentation**: Completely tracks every component automatically utilizing Angular's native internal `ɵsetProfiler` - no need to wrap elements or pollute your templates.
- **Render Heatmap**: Visually distinguish performant components (Blue/Green) from slow components (Yellow/Red borders and labels) dynamically on the fly based on configurable MS thresholds.
- **Draggable Toolbar**: A clean shadow-DOM toolbar that you can click and drag anywhere on your screen.
- **Click-to-Inspect**: Hold `Cmd` (Mac) or `Ctrl` (Windows) and click on any highlighted component box. It automatically intercepts the click, fetches the actual underlying Angular component instance, and logs it to your console.
- **Rich Console Logging**: Enable `log: true` to get beautifully collapsed `console.table()` reports after every render cycle detailing exact names, counts, and ms durations.
- **Production Guard**: Uses Angular's native `isDevMode()` to ensure the scanner automatically shuts off in production environments.

## Public API

```ts
import { getOptions, scan, setOptions, stop } from 'angular-scan';

scan({ enabled: true, showToolbar: true });
setOptions({ log: true });
console.log(getOptions());
stop();
```

```ts
interface AngularScanOptions {
  enabled?: boolean;
  showToolbar?: boolean;
  animationSpeed?: 'slow' | 'fast' | 'off';
  showFPS?: boolean;
  log?: boolean;
  dangerouslyForceRunInProduction?: boolean;
  theme?: Partial<AngularScanTheme>;
  onCycleStart?: () => void;
  onRender?: (entry: AngularRenderEntry) => void;
  onCycleFinish?: (cycle: AngularRenderCycle) => void;
}
```

## Angular Usage

Provider mode hooks into Angular automatically. Simply drop it into your application bootstrap logic:

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAngularScan } from 'angular-scan';

bootstrapApplication(AppComponent, {
  providers: [
    provideAngularScan({
      enabled: true,
      showToolbar: true,
      animationSpeed: 'fast',
      log: true
    })
  ]
});
```

*(Legacy Mode: You can optionally still add `AngularScanMarkDirective` and `angularScanMark="Name"` to component host elements if you prefer manual tracking for highly specific elements.)*

## Demo

The demo runs an interactive E-Commerce Developer Store to showcase real-world data flows, `OnPush` components, signal updates, and simulated expensive operations.

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:4200/`. The toolbar switch turns scanning on or off. You can drag the toolbar around, view dynamic updates on "Add to Cart", and test the Red Heatmap styling using the "AI Recommendations" recalculate button.

## Highlight Colors / Themes

The overlay highlight palette is completely configurable via the `theme` object. You can pass in custom RGB values via `setOptions` or `provideAngularScan`.

The default theme is:
```ts
const defaultTheme: AngularScanTheme = {
  fast: [147, 197, 253],               // blue-300
  medium: [253, 224, 71],              // yellow-300
  slow: [239, 68, 68],                 // red-500
  labelBackground: [124, 58, 237],     // violet-600
  labelBackgroundSlow: [220, 38, 38],  // red-600
};
```

## Verification

```sh
npm run test
npm run build
npm run test:e2e
```
