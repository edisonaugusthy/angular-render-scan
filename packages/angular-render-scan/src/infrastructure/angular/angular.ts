import { APP_INITIALIZER, ApplicationRef, Directive, ElementRef, EnvironmentProviders, InjectionToken, input, effect, OnDestroy, Provider, inject, makeEnvironmentProviders, isDevMode, NgZone } from '@angular/core';
import {
  beginCycle,
  copyAIPrompt,
  currentCycleId,
  endCycle,
  ensureCycleForComponentCheck,
  getAIPrompt,
  scan,
  setOptions,
  setTaskScheduler,
  getSessionData,
  getWastedStats,
  getLeakedComponents
} from '../../application/runtime';
import { recordComponentCheck, registerComponent, unregisterComponent } from '../../application/stats';
import type { AngularRenderScanOptions } from '../../domain/entities';
import { setupAutoInstrumentation } from './auto-instrumentation';

export const ANGULAR_RENDER_SCAN_OPTIONS = new InjectionToken<AngularRenderScanOptions>('ANGULAR_RENDER_SCAN_OPTIONS');

let nextComponentId = 0;

@Directive({
  selector: '[angularRenderScanMark]',
  standalone: true
})
export class AngularRenderScanMarkDirective implements OnDestroy {
  private readonly element = inject<ElementRef<Element>>(ElementRef).nativeElement;
  private readonly parent = inject(AngularRenderScanMarkDirective, { optional: true, skipSelf: true });
  private readonly id = `ng-scan-${++nextComponentId}`;
  private checkStartedAt = 0;
  private childrenDuration = 0;
  private name = this.inferName();

  readonly angularRenderScanMark = input<string | undefined>(undefined, { alias: 'angularRenderScanMark' });

  constructor() {
    effect(() => {
      const customName = this.angularRenderScanMark();
      this.name = customName || this.inferName();
      this.register();
    });
  }

  ngDoCheck(): void {
    ensureCycleForComponentCheck();
    this.checkStartedAt = performance.now();
    this.childrenDuration = 0;
  }

  ngAfterViewChecked(): void {
    const cycleId = currentCycleId();
    const totalDuration = performance.now() - this.checkStartedAt;
    const selfDuration = Math.max(0, totalDuration - this.childrenDuration);

    if (this.parent) {
      this.parent.childrenDuration += totalDuration;
    }

    if (!cycleId) {
      return;
    }

    let depth = 1;
    let curr = this.parent;
    while (curr) {
      depth++;
      curr = curr.parent;
    }

    const entry = recordComponentCheck(
      this.id,
      selfDuration,
      cycleId,
      {},
      {
        startTime: this.checkStartedAt,
        totalDuration,
        depth
      }
    );
    if (entry) {
      window.dispatchEvent(new CustomEvent('angular-render-scan:render', { detail: entry }));
    }
  }

  ngOnDestroy(): void {
    unregisterComponent(this.id);
  }

  private register(): void {
    registerComponent({
      id: this.id,
      name: this.name,
      element: this.element,
      selector: this.element.tagName.toLowerCase()
    });
  }

  private inferName(): string {
    const tagName = this.element.tagName.toLowerCase();
    return tagName
      .replace(/^app-/, '')
      .split('-')
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join('');
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function provideAngularRenderScan(options: AngularRenderScanOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ANGULAR_RENDER_SCAN_OPTIONS, useValue: options },
    angularRenderScanInitializerProvider()
  ]);
}

function angularRenderScanInitializerProvider(): Provider {
  return {
    provide: APP_INITIALIZER,
    multi: true,
    deps: [ApplicationRef, ANGULAR_RENDER_SCAN_OPTIONS, NgZone],
    useFactory: (appRef: ApplicationRef, options: AngularRenderScanOptions, ngZone: NgZone) => () => {
      if (!isDevMode() && !options.dangerouslyForceRunInProduction) {
        return;
      }
      
      setTaskScheduler((fn) => {
        ngZone.runOutsideAngular(() => {
          // Promise.resolve().then() is generally safer in Zone.js to escape microtask tracking
          // if queued from outside the zone, whereas queueMicrotask might still be patched tightly.
          Promise.resolve().then(fn);
        });
      });

      ngZone.runOutsideAngular(() => {
        scan(options);
      });
      patchApplicationRef(appRef);
      registerGlobalApplicationRef(appRef);
      setupAutoInstrumentation();
    }
  };
}

let originalTick: (() => void) | null = null;

function patchApplicationRef(appRef: ApplicationRef): void {
  const candidate = appRef as ApplicationRef & { __angularRenderScanPatched?: boolean };
  if (candidate.__angularRenderScanPatched) {
    return;
  }

  originalTick = appRef.tick.bind(appRef);
  candidate.tick = () => {
    const cycleId = beginCycle();
    try {
      if (originalTick) return originalTick();
    } finally {
      endCycle(cycleId);
    }
  };
  candidate.__angularRenderScanPatched = true;
}

export function restoreApplicationRef(appRef: ApplicationRef): void {
  const candidate = appRef as ApplicationRef & { __angularRenderScanPatched?: boolean };
  if (candidate.__angularRenderScanPatched && originalTick) {
    candidate.tick = originalTick;
    candidate.__angularRenderScanPatched = false;
    originalTick = null;
  }
}

function registerGlobalApplicationRef(appRef: ApplicationRef): void {
  const globalWindow = window as Window & {
    __ANGULAR_RENDER_SCAN_APP_REF__?: ApplicationRef;
    AngularRenderScan?: {
      scan: typeof scan;
      setOptions: typeof setOptions;
      getAIPrompt: typeof getAIPrompt;
      copyAIPrompt: typeof copyAIPrompt;
      getSessionData: () => any;
      getWastedStats: () => any;
      getLeakedComponents: () => any;
      stop: () => void;
    };
  };
  globalWindow.__ANGULAR_RENDER_SCAN_APP_REF__ = appRef;
  globalWindow.AngularRenderScan = {
    ...globalWindow.AngularRenderScan,
    scan,
    setOptions,
    getAIPrompt,
    copyAIPrompt,
    getSessionData,
    getWastedStats,
    getLeakedComponents,
    stop: () => {
      import('../../application/runtime').then(m => m.stop());
      restoreApplicationRef(appRef);
    }
  };
}
