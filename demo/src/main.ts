import { bootstrapApplication } from '@angular/platform-browser';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { AngularScanMarkDirective, provideAngularScan, setOptions } from 'angular-scan';

@Component({
  selector: 'app-counter',
  standalone: true,
  imports: [AngularScanMarkDirective],
  template: `
    <section angularScanMark="CounterComponent" class="panel">
      <h2>Counter</h2>
      <p class="value">{{ count() }}</p>
      <button type="button" (click)="increment()">Increment counter</button>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Default
})
class CounterComponent {
  readonly count = signal(0);

  increment(): void {
    this.count.update((value) => value + 1);
  }
}

@Component({
  selector: 'app-nested-item',
  standalone: true,
  imports: [AngularScanMarkDirective],
  template: `
    <span angularScanMark="NestedItemComponent">{{ label }}</span>
  `
})
class NestedItemComponent {
  @Input()
  label = '';
}

@Component({
  selector: 'app-nested-child',
  standalone: true,
  imports: [AngularScanMarkDirective, NestedItemComponent],
  template: `
    <section angularScanMark="NestedChildComponent" class="panel">
      <h2>Nested children</h2>
      <div class="child-grid">
        @for (item of items(); track item) {
          <app-nested-item [label]="item" />
        }
      </div>
      <button type="button" (click)="shuffle()">Shuffle children</button>
    </section>
  `
})
class NestedChildComponent {
  readonly items = signal(['Header', 'Card', 'Footer']);

  shuffle(): void {
    this.items.update(([first, ...rest]) => [...rest, first]);
  }
}

@Component({
  selector: 'app-slow',
  standalone: true,
  imports: [AngularScanMarkDirective],
  template: `
    <section angularScanMark="SlowComponent" class="panel slow-panel">
      <h2>Slow component</h2>
      <p>Computed score: {{ expensiveScore() }}</p>
      <button type="button" (click)="stress()">Run expensive update</button>
    </section>
  `
})
class SlowComponent {
  readonly seed = signal(3000);
  readonly expensiveScore = computed(() => {
    let total = 0;
    for (let i = 0; i < this.seed() * 180; i += 1) {
      total += Math.sqrt((i % 97) + total % 13);
    }
    return Math.round(total);
  });

  stress(): void {
    this.seed.update((value) => value + 800);
  }
}

@Component({
  selector: 'app-on-push',
  standalone: true,
  imports: [AngularScanMarkDirective],
  template: `
    <section angularScanMark="OnPushComponent" class="panel">
      <h2>OnPush</h2>
      <p>{{ label() }}</p>
      <button type="button" (click)="refresh()">Refresh OnPush state</button>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
class OnPushComponent {
  readonly index = signal(1);
  readonly label = computed(() => `OnPush render ${this.index()}`);

  refresh(): void {
    this.index.update((value) => value + 1);
  }
}

@Component({
  selector: 'app-signal-demo',
  standalone: true,
  imports: [AngularScanMarkDirective],
  template: `
    <section angularScanMark="SignalComponent" class="panel">
      <h2>Signals</h2>
      <p>{{ doubled() }}</p>
      <button type="button" (click)="pulse()">Pulse signal</button>
    </section>
  `
})
class SignalDemoComponent {
  readonly signalValue = signal(2);
  readonly doubled = computed(() => `Signal value ${this.signalValue() * 2}`);

  pulse(): void {
    this.signalValue.update((value) => value + 1);
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CounterComponent,
    NestedChildComponent,
    SlowComponent,
    OnPushComponent,
    SignalDemoComponent
  ],
  template: `
    <main>
      <header>
        <div>
          <h1>Angular Scan</h1>
          <p>Investor demo overlay for live Angular change-detection visibility.</p>
        </div>
        <button type="button" class="secondary" (click)="toggleConsole()">
          {{ consoleLog() ? 'Console log on' : 'Console log off' }}
        </button>
      </header>

      <section class="demo-grid">
        <app-counter />
        <app-nested-child />
        <app-slow />
        <app-on-push />
        <app-signal-demo />
      </section>
    </main>
  `
})
class AppComponent {
  readonly consoleLog = signal(false);

  toggleConsole(): void {
    this.consoleLog.update((value) => !value);
    setOptions({ log: this.consoleLog() });
  }
}

bootstrapApplication(AppComponent, {
  providers: [
    provideAngularScan({
      enabled: true,
      showToolbar: true,
      animationSpeed: 'fast',
      showFPS: true
    })
  ]
}).catch((error: unknown) => console.error(error));
