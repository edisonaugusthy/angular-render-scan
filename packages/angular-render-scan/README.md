# Angular Render Scan

Angular Render Scan is a visual debugging overlay for Angular change detection. It helps you see which components update, how often they update, and how long those updates take.

![Angular Render Scan demo](https://raw.githubusercontent.com/edisonaugusthy/angular-render-scan/main/docs/assets/angular-render-scan-demo.gif)

## Install

```sh
npm install angular-render-scan
```

Angular Render Scan expects Angular 9+ as a peer dependency.

## Quick Start

Add `provideAngularRenderScan()` to your Angular bootstrap providers.

```ts
import { bootstrapApplication } from "@angular/platform-browser";
import { provideAngularRenderScan } from "angular-render-scan";
import { AppComponent } from "./app/app.component";

bootstrapApplication(AppComponent, {
  providers: [
    provideAngularRenderScan({
      enabled: true,
      animationSpeed: "fast",
    }),
  ],
});
```

Open your app in development mode and interact with the UI. Updated components flash on screen, and the floating toolbar shows FPS, cycle time, changed component count, the slowest component, and a copyable AI performance prompt focused on slow/error components.

## Script Usage

The package also exposes a browser global build for script-tag usage.

```html
<script src="https://unpkg.com/angular-render-scan/dist/auto.global.js"></script>
```

Provider mode is recommended for Angular component-level instrumentation because it has access to Angular app references and dev-mode hooks.

## API

```ts
import {
  copyAIPrompt,
  getAIPrompt,
  getOptions,
  scan,
  setOptions,
  stop,
} from "angular-render-scan";

scan();
setOptions({ enabled: false });
setOptions({ enabled: true, log: true });
console.log(getAIPrompt());
await copyAIPrompt();
console.log(getOptions());
stop();
```

## Options

```ts
provideAngularRenderScan({
  enabled: true,
  showToolbar: true,
  showFPS: true,
  animationSpeed: "fast",
  log: false,
  maxLabelCount: 20,
  maxRecordedCycles: 30,
  showCopyPrompt: true,
});
```

- `enabled`: turns scanning on or off.
- `showToolbar`: shows or hides the floating toolbar.
- `animationSpeed`: controls highlight readability. `'fast'` keeps borders visible for about 1.2s, `'slow'` keeps them visible for about 2.4s, and `'off'` disables visual flashes.
- `showFPS`: shows FPS in the toolbar.
- `log`: prints cycle summaries to the console.
- `minDurationMs`, `minRenderCount`, `include`, `exclude`: hide low-signal entries.
- `maxLabelCount`: caps visible component labels.
- `maxRecordedCycles`: controls how many recent cycles are included in the copied AI prompt.
- `showCopyPrompt`, `promptContext`: control the copyable AI performance prompt.
- `dangerouslyForceRunInProduction`: allows the scanner to run outside Angular dev mode.

## Basic Debug Config

```ts
provideAngularRenderScan({
  enabled: true,
  showToolbar: true,
  animationSpeed: "slow",
  maxLabelCount: 12,
  maxRecordedCycles: 20,
  promptContext: "Angular app using signals and OnPush components",
});
```

Use `animationSpeed: 'slow'` when you want more time to read the borders and labels while interacting with the page.

## AI Performance Prompt

Click `Copy Slow Issues Prompt` in the toolbar, or call `copyAIPrompt()`, to copy a self-contained prompt for an AI coding assistant. It includes environment details, recent cycle history, Angular render-cycle evidence, thresholds, and an issue list for components exceeding the performance warning threshold (10ms by default).

The copied prompt is intentionally focused: it does not copy every render entry. It lists slow components with selector, latest render time, average render time, render count, reason, changed inputs when available, and an estimated cost based on latest duration, cycle share, and observed render count. It does not include raw DOM nodes, component instances, source code, or large object values.

## Component Detail Panel

Check `Details` in the toolbar to turn on component inspection. Hover over a captured component to show a dashed highlight, then click it to pin the recommendation panel. The panel stays open until you close it.

The panel shows severity, latest duration, average duration, render count, reason, selector, changed inputs, recent cycles, estimated cost, and component-local Angular recommendations based on the captured issue. For slow components, it also shows `Copy Slow Issue Prompt`, which copies a prompt for only that component with the details needed by an AI coding assistant.

## Production Behavior

Angular Render Scan is intended for development and demo debugging. Provider mode checks Angular `isDevMode()` and does not run in production unless explicitly enabled.

```ts
provideAngularRenderScan({
  dangerouslyForceRunInProduction: true,
});
```

Use that option carefully. The scanner adds runtime instrumentation, DOM reads, canvas work, and console/debug behavior.

## Repository

Source, issues, and full documentation are available at:

https://github.com/edisonaugusthy/angular-render-scan
