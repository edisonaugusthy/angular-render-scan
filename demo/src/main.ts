import { bootstrapApplication } from '@angular/platform-browser';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  input,
  signal,
} from '@angular/core';
import {
  AngularRenderScanMarkDirective,
  getWastedStats,
  provideAngularRenderScan,
} from 'angular-render-scan';

interface RenderEvent {
  name: string;
  duration: number;
  changed: boolean;
  reason: string;
}

@Component({
  selector: 'demo-preview-card',
  standalone: true,
  imports: [AngularRenderScanMarkDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article angularRenderScanMark="PreviewCard" class="preview-card">
      <div class="avatar">{{ title().slice(0, 1) }}</div>
      <div>
        <strong>{{ title() }}</strong>
        <span>{{ subtitle() }}</span>
      </div>
      <small>{{ score() }}</small>
    </article>
  `,
})
class PreviewCardComponent {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly score = input.required<number>();
}

@Component({
  selector: 'demo-expensive-result',
  standalone: true,
  imports: [AngularRenderScanMarkDirective],
  template: `
    <div angularRenderScanMark="ExpensiveResult" class="expensive-result">
      <span>Calculated value</span>
      <strong>{{ calculate() }}</strong>
    </div>
  `,
})
class ExpensiveResultComponent {
  readonly seed = input.required<number>();

  calculate(): string {
    const start = performance.now();
    let value = this.seed() + 0.5;
    while (performance.now() - start < 18) value = Math.sin(value) + 0.5;
    return value.toFixed(4);
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PreviewCardComponent, ExpensiveResultComponent],
  template: `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand"><span>Angular Render Scan</span></div>
        <div class="topbar-status"><i></i> Profiling locally</div>
        <a href="https://github.com/edisonaugusthy/angular-render-scan" target="_blank" rel="noreferrer">GitHub ↗</a>
      </header>

      <main>
        <section class="intro">
          <div>
            <span class="eyebrow">Interactive performance lab</span>
            <h1>See exactly why Angular checked a component.</h1>
            <p>Run a focused scenario, then enable the picker in the bottom-right panel and hover the highlighted component.</p>
          </div>
          <ol class="steps">
            <li><b>1</b><span>Trigger a scenario below</span></li>
            <li><b>2</b><span>Turn on component inspect</span></li>
            <li><b>3</b><span>Hover a highlighted element</span></li>
          </ol>
        </section>

        <section class="workspace">
          <div class="scenario-column">
            <div class="section-heading"><div><span class="eyebrow">Scenarios</span><h2>Generate useful evidence</h2></div><button class="quiet" (click)="reset()">Reset session</button></div>

            <div class="scenario-grid">
              <article class="scenario active">
                <div class="scenario-number">01</div>
                <div><h3>Signal update</h3><p>A normal local update with a visible DOM change.</p></div>
                <button (click)="increment()">Increment signal <kbd>{{ count() }}</kbd></button>
              </article>

              <article class="scenario">
                <div class="scenario-number">02</div>
                <div><h3>Stable OnPush input</h3><p>Updates only when its scalar inputs actually change.</p></div>
                <button (click)="advanceProfile()">Update profile</button>
              </article>

              <article class="scenario warning">
                <div class="scenario-number">03</div>
                <div><h3>Reference churn</h3><p>Passes a new object-shaped value with identical content.</p></div>
                <button (click)="newReference()">Create new reference <kbd>{{ refCount() }}</kbd></button>
              </article>

              <article class="scenario danger">
                <div class="scenario-number">04</div>
                <div><h3>Blocking template work</h3><p>Runs synchronous work during change detection.</p></div>
                <button (click)="runExpensive()">Run 18 ms calculation</button>
              </article>
            </div>
          </div>

          <aside class="evidence-column">
            <div class="section-heading"><div><span class="eyebrow">Live application</span><h2>Preview</h2></div><span class="cycle-count">{{ events().length }} samples</span></div>
            <div class="preview-surface">
              <demo-preview-card title="Signals dashboard" [subtitle]="profileSubtitle()" [score]="count()" />
              @if (showExpensive()) { <demo-expensive-result [seed]="count()" /> }
              <div class="reference-readout"><span>Config reference</span><code>{{ config().density }} / {{ config().theme }}</code></div>
            </div>

            <div class="session-summary">
              <div><span>Checks</span><strong>{{ totalChecks() }}</strong></div>
              <div><span>No DOM change</span><strong>{{ wastedPercentage() }}%</strong></div>
              <div><span>Latest</span><strong>{{ latestDuration() }}</strong></div>
            </div>

            <div class="event-feed">
              <div class="feed-head"><span>Recent checks</span><small>Newest first</small></div>
              @if (events().length === 0) {
                <div class="feed-empty">Interact with a scenario to capture component evidence.</div>
              } @else {
                @for (event of events().slice(0, 6); track $index) {
                  <div class="event-row"><i [class.changed]="event.changed"></i><strong>{{ event.name }}</strong><span>{{ event.reason }}</span><code>{{ event.duration.toFixed(2) }} ms</code></div>
                }
              }
            </div>
          </aside>
        </section>
      </main>
    </div>
  `,
})
class AppComponent implements OnInit, OnDestroy {
  readonly count = signal(0);
  readonly profileVersion = signal(1);
  readonly refCount = signal(0);
  readonly config = signal({ density: 'comfortable', theme: 'dark' });
  readonly showExpensive = signal(false);
  readonly events = signal<RenderEvent[]>([]);
  readonly profileSubtitle = computed(() => `Profile revision ${this.profileVersion()}`);
  readonly totalChecks = signal(0);
  readonly wastedPercentage = signal(0);
  readonly latestDuration = computed(() => this.events()[0] ? `${this.events()[0].duration.toFixed(2)} ms` : '—');

  private readonly renderListener = (event: Event) => {
    const entry = (event as CustomEvent).detail;
    if (!entry) return;
    if (entry.name !== 'PreviewCard' && entry.name !== 'ExpensiveResult') return;
    queueMicrotask(() => {
      this.events.update(items => [{
        name: entry.name,
        duration: entry.latestDuration,
        changed: entry.mutationType !== 'none',
        reason: entry.renderCause?.trigger ?? entry.reason ?? 'unknown',
      }, ...items].slice(0, 20));
      const wasted = getWastedStats();
      this.totalChecks.set(wasted.totalChecks);
      this.wastedPercentage.set(wasted.wastedPercentage);
    });
  };

  ngOnInit(): void { window.addEventListener('angular-render-scan:render', this.renderListener); }
  ngOnDestroy(): void { window.removeEventListener('angular-render-scan:render', this.renderListener); }

  increment(): void { this.showExpensive.set(false); this.count.update(value => value + 1); }
  advanceProfile(): void { this.showExpensive.set(false); this.profileVersion.update(value => value + 1); }
  newReference(): void {
    this.showExpensive.set(false);
    this.config.set({ density: 'comfortable', theme: 'dark' });
    this.refCount.update(value => value + 1);
  }
  runExpensive(): void { this.showExpensive.set(true); this.count.update(value => value + 1); }
  reset(): void {
    this.count.set(0); this.profileVersion.set(1); this.refCount.set(0);
    this.showExpensive.set(false); this.events.set([]); this.totalChecks.set(0); this.wastedPercentage.set(0);
  }
}

bootstrapApplication(AppComponent, {
  providers: [provideAngularRenderScan({
    enabled: true,
    showToolbar: true,
    darkMode: 'dark',
    animationSpeed: 'fast',
    showFPS: true,
    budgets: { warnMs: 8, errorMs: 16, maxRendersPerSecond: 20 },
    maxRecordedCycles: 30,
    showCopyPrompt: true,
    promptContext: 'Angular Render Scan focused performance lab',
  })],
});
