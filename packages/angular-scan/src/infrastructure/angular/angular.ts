import { APP_INITIALIZER, ApplicationRef, Directive, ElementRef, EnvironmentProviders, InjectionToken, Input, OnDestroy, Provider, inject, makeEnvironmentProviders, isDevMode } from '@angular/core';
import { beginCycle, currentCycleId, endCycle, ensureCycleForComponentCheck, scan, setOptions } from '../../application/runtime';
import { recordComponentCheck, registerComponent, unregisterComponent } from '../../application/stats';
import type { AngularScanOptions } from '../../domain/entities';

export const ANGULAR_SCAN_OPTIONS = new InjectionToken<AngularScanOptions>('ANGULAR_SCAN_OPTIONS');

let nextComponentId = 0;

@Directive({
  selector: '[angularScanMark]',
  standalone: true
})
export class AngularScanMarkDirective implements OnDestroy {
  private readonly element = inject<ElementRef<Element>>(ElementRef).nativeElement;
  private readonly parent = inject(AngularScanMarkDirective, { optional: true, skipSelf: true });
  private readonly id = `ng-scan-${++nextComponentId}`;
  private checkStartedAt = 0;
  private childrenDuration = 0;
  private renderedSignature = '';
  private name = this.inferName();

  @Input('angularScanMark')
  set angularScanMark(name: string | undefined) {
    if (name) {
      this.name = name;
      this.register();
    }
  }

  constructor() {
    this.register();
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

    const nextSignature = this.getRenderedSignature();
    if (this.renderedSignature === nextSignature) {
      return;
    }

    this.renderedSignature = nextSignature;
    const entry = recordComponentCheck(this.id, selfDuration, cycleId);
    if (entry) {
      window.dispatchEvent(new CustomEvent('angular-scan:render', { detail: entry }));
    }
  }

  ngOnDestroy(): void {
    unregisterComponent(this.id);
  }

  private register(): void {
    registerComponent({
      id: this.id,
      name: this.name,
      element: this.element
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

  private getRenderedSignature(): string {
    const rect = this.element.getBoundingClientRect();
    return [
      normalizeText(this.element.textContent ?? ''),
      Math.round(rect.left),
      Math.round(rect.top),
      Math.round(rect.width),
      Math.round(rect.height),
      this.element.childElementCount
    ].join('|');
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function provideAngularScan(options: AngularScanOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ANGULAR_SCAN_OPTIONS, useValue: options },
    angularScanInitializerProvider()
  ]);
}

function angularScanInitializerProvider(): Provider {
  return {
    provide: APP_INITIALIZER,
    multi: true,
    deps: [ApplicationRef, ANGULAR_SCAN_OPTIONS],
    useFactory: (appRef: ApplicationRef, options: AngularScanOptions) => () => {
      if (!isDevMode() && !options.dangerouslyForceRunInProduction) {
        return;
      }
      scan(options);
      patchApplicationRef(appRef);
      registerGlobalApplicationRef(appRef);
    }
  };
}

let originalTick: (() => void) | null = null;

function patchApplicationRef(appRef: ApplicationRef): void {
  const candidate = appRef as ApplicationRef & { __angularScanPatched?: boolean };
  if (candidate.__angularScanPatched) {
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
  candidate.__angularScanPatched = true;
}

export function restoreApplicationRef(appRef: ApplicationRef): void {
  const candidate = appRef as ApplicationRef & { __angularScanPatched?: boolean };
  if (candidate.__angularScanPatched && originalTick) {
    candidate.tick = originalTick;
    candidate.__angularScanPatched = false;
    originalTick = null;
  }
}

function registerGlobalApplicationRef(appRef: ApplicationRef): void {
  const globalWindow = window as Window & {
    __ANGULAR_SCAN_APP_REF__?: ApplicationRef;
    AngularScan?: {
      scan: typeof scan;
      setOptions: typeof setOptions;
      stop: () => void;
    };
  };
  globalWindow.__ANGULAR_SCAN_APP_REF__ = appRef;
  globalWindow.AngularScan = {
    ...globalWindow.AngularScan,
    scan,
    setOptions,
    stop: () => {
      import('../../application/runtime').then(m => m.stop());
      restoreApplicationRef(appRef);
    }
  };
}
