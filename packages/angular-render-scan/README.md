# Angular Render Scan

Angular Render Scan is a visual debugging overlay for Angular change detection. It shows which components update, how often they update, and which checks are slow or wasted.

![Angular Render Scan in Action](https://raw.githubusercontent.com/edisonaugusthy/angular-render-scan/main/docs/assets/angular-render-scan-demo.gif)

[Live Demo](https://edisonaugusthy.github.io/angular-render-scan/) | [npm](https://www.npmjs.com/package/angular-render-scan)

## Versions

| Package | Version |
|---|---|
| Angular | `^22.0.0` |
| `angular-render-scan` | `0.1.8` |
| `angular-render-scan-cli` | `0.1.5` |

## What it shows

- Component render outlines and heatmap colors.
- Slow render and budget violation alerts.
- Change detection trigger labels such as `zone:click`, `signal:write`, and `router:navigation`.
- OnPush candidates, referentially unstable inputs, and suspected Zone pollution.
- A copyable AI performance prompt for slow/error components.
- Session export JSON for deeper debugging.

## Install

```sh
npm install angular-render-scan
```

Angular Render Scan expects Angular 9+.

## Setup with the CLI

```sh
npx angular-render-scan-cli init
```

The CLI supports Angular CLI and Nx workspaces. It looks for `angular.json`, `workspace.json`, `nx.json`, or `project.json`, finds your `main.ts` or `app.config.ts`, and adds `provideAngularRenderScan()`.

```sh
npx angular-render-scan-cli init --dry-run
npx angular-render-scan-cli init --script-tag
npx angular-render-scan-cli --help
```

## Manual Setup

Add the provider to your Angular bootstrap config.

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAngularRenderScan } from 'angular-render-scan';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideAngularRenderScan({
      enabled: true,
      animationSpeed: 'fast'
    })
  ]
});
```

For script-tag usage:

```html
<script src="https://unpkg.com/angular-render-scan/dist/auto.global.js"></script>
```

Provider mode is recommended for Angular component-level instrumentation.

## Common Options

```ts
provideAngularRenderScan({
  enabled: true,
  showToolbar: true,
  showFPS: true,
  animationSpeed: 'fast',
  maxLabelCount: 20,
  maxRecordedCycles: 30,
  showCopyPrompt: true,
  promptContext: 'Angular app using signals and OnPush components',
  log: false
});
```

Useful options:

- `enabled`: turns scanning on or off.
- `showToolbar`: shows the floating toolbar.
- `animationSpeed`: `'fast'`, `'slow'`, or `'off'`.
- `showFPS`: shows FPS in the toolbar.
- `log`: prints cycle summaries to the console.
- `include` / `exclude`: limits which components are tracked.
- `minDurationMs` / `minRenderCount`: filters low-signal entries.
- `maxRecordedCycles`: controls how much history is included in copied prompts.
- `promptContext`: adds app-specific context to copied prompts.
- `dangerouslyForceRunInProduction`: allows scanner runtime outside Angular dev mode.

## Runtime API

```ts
import {
  copyAIPrompt,
  getAIPrompt,
  getCdGraph,
  getOnPushCandidates,
  getOptions,
  getReferentialInstability,
  getZonePollutionEvents,
  scan,
  setOptions,
  stop
} from 'angular-render-scan';

scan();
setOptions({ enabled: false });
setOptions({ enabled: true, log: true });

console.log(getOptions());
console.log(getAIPrompt());
await copyAIPrompt();

console.log(getOnPushCandidates(40));
console.log(getReferentialInstability(1));
console.log(getZonePollutionEvents());
console.log(getCdGraph());

stop();
```

## Toolbar

The toolbar shows render count, FPS, latest cycle time, slowest component, trigger source, OnPush candidates, Zone pollution events, alerts, and copy/export actions.

Useful shortcuts:

| Shortcut | Action |
|---|---|
| `Alt+Shift+S` | Toggle scanner |
| `Alt+Shift+D` | Toggle Details Mode |
| `Alt+Shift+C` | Copy AI performance prompt |
| `Alt+Shift+X` | Clear stats |
| `Alt+Shift+T` | Toggle toolbar |
| `Escape` | Close open panels |

## Details and AI Prompt

Enable `Details` in the toolbar, hover a captured component, then click it to pin a recommendation panel. The panel shows timing, render count, reason, selector, changed inputs, recent cycles, and local Angular recommendations.

Use `Copy Slow Issues Prompt` to copy a focused prompt for an AI coding assistant. It includes recent cycle history, thresholds, and slow/error component evidence without copying DOM nodes, component instances, or source code.

## Playwright Audit

```ts
import { test, expect } from '@playwright/test';
import { startRenderAudit } from 'angular-render-scan';

test('no render regression', async ({ page }) => {
  await page.goto('/');

  const audit = await startRenderAudit(page);
  await page.click('button.expensive-operation');
  const report = await audit.stop();

  expect(await report.maxDurationFor('ProductCardComponent')).toBeLessThan(16.7);
  expect(await report.wastedRenderPercentage()).toBeLessThan(20);
  expect(await report.budgetViolations()).toHaveLength(0);
});
```

## Production Behavior

Angular Render Scan is intended for development and demo debugging. Provider mode checks Angular `isDevMode()` and does not run in production unless explicitly enabled.

```ts
provideAngularRenderScan({
  dangerouslyForceRunInProduction: true
});
```

Use that option carefully. The scanner adds runtime instrumentation, DOM reads, canvas work, and debug behavior.

## Demo

Hosted demo:

```txt
https://edisonaugusthy.github.io/angular-render-scan/
```

Local demo:

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:4200/`.

## Development

```sh
npm run test
npm run build
npm run test:e2e
```

## Release

Release runs automatically on pushes to `main`. The workflow bumps the package version, publishes `angular-render-scan` and `angular-render-scan-cli` to npm, and creates a GitHub release.

Configure `NPM_TOKEN` or npm trusted publishing for both packages before publishing.
