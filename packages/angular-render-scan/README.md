# Angular Render Scan

Angular Render Scan is a visual debugging overlay for Angular change detection. It helps you see which components update, how often they update, and how long those updates take.

![Angular Render Scan demo](https://raw.githubusercontent.com/edisonaugusthy/angular-render-scan/main/docs/assets/angular-render-scan-demo.png)

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
      enabled: true
    })
  ]
});
```

Open your app in development mode and interact with the UI. Updated components flash on screen, and the floating toolbar shows FPS, cycle time, changed component count, and the slowest component.

## Script Usage

The package also exposes a browser global build for script-tag usage.

```html
<script src="https://unpkg.com/angular-render-scan/dist/auto.global.js"></script>
```

Provider mode is recommended for Angular component-level instrumentation because it has access to Angular app references and dev-mode hooks.

## API

```ts
import { getOptions, scan, setOptions, stop } from 'angular-render-scan';

scan();
setOptions({ enabled: false });
setOptions({ enabled: true, log: true });
console.log(getOptions());
stop();
```

## Options

```ts
provideAngularRenderScan({
  enabled: true,
  showToolbar: true,
  showFPS: true,
  animationSpeed: 'fast',
  log: false
});
```

- `enabled`: turns scanning on or off.
- `showToolbar`: shows or hides the floating toolbar.
- `animationSpeed`: controls highlight fade speed. Use `'off'` to disable visual flashes.
- `showFPS`: shows FPS in the toolbar.
- `log`: prints cycle summaries to the console.
- `dangerouslyForceRunInProduction`: allows the scanner to run outside Angular dev mode.

## Production Behavior

Angular Render Scan is intended for development and demo debugging. Provider mode checks Angular `isDevMode()` and does not run in production unless explicitly enabled.

```ts
provideAngularRenderScan({
  dangerouslyForceRunInProduction: true
});
```

Use that option carefully. The scanner adds runtime instrumentation, DOM reads, canvas work, and console/debug behavior.

## Repository

Source, issues, and full documentation are available at:

https://github.com/edisonaugusthy/angular-render-scan
