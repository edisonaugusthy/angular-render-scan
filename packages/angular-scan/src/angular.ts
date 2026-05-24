import { APP_INITIALIZER, ApplicationRef, Directive, ElementRef, EnvironmentProviders, InjectionToken, Input, OnDestroy, Provider, inject, makeEnvironmentProviders } from '@angular/core';
import { beginCycle, currentCycleId, endCycle, ensureCycleForComponentCheck, scan, setOptions } from './runtime';
import { recordComponentCheck, registerComponent, unregisterComponent } from './stats';
import type { AngularScanOptions } from './types';

export const ANGULAR_SCAN_OPTIONS = new InjectionToken<AngularScanOptions>('ANGULAR_SCAN_OPTIONS');

let nextComponentId = 0;

@Directive({
  selector: '[angularScanMark]',
  standalone: true
})
export class AngularScanMarkDirective implements OnDestroy {
  private readonly element = inject<ElementRef<Element>>(ElementRef).nativeElement;
  private readonly id = `ng-scan-${++nextComponentId}`;
  private checkStartedAt = performance.now();
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
  }

  ngAfterViewChecked(): void {
    const cycleId = currentCycleId();
    if (!cycleId) {
      return;
    }

    const nextSignature = this.getRenderedSignature();
    if (this.renderedSignature === nextSignature) {
      return;
    }

    this.renderedSignature = nextSignature;
    const duration = performance.now() - this.checkStartedAt;
    const entry = recordComponentCheck(this.id, duration, cycleId);
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
      scan(options);
      patchApplicationRef(appRef);
      registerGlobalApplicationRef(appRef);
    }
  };
}

function patchApplicationRef(appRef: ApplicationRef): void {
  const candidate = appRef as ApplicationRef & { __angularScanPatched?: boolean };
  if (candidate.__angularScanPatched) {
    return;
  }

  const originalTick = appRef.tick.bind(appRef);
  candidate.tick = () => {
    const cycleId = beginCycle();
    try {
      return originalTick();
    } finally {
      endCycle(cycleId);
    }
  };
  candidate.__angularScanPatched = true;
}

function registerGlobalApplicationRef(appRef: ApplicationRef): void {
  const globalWindow = window as Window & {
    __ANGULAR_SCAN_APP_REF__?: ApplicationRef;
    AngularScan?: {
      scan: typeof scan;
      setOptions: typeof setOptions;
    };
  };
  globalWindow.__ANGULAR_SCAN_APP_REF__ = appRef;
  globalWindow.AngularScan = {
    ...globalWindow.AngularScan,
    scan,
    setOptions
  };
}
