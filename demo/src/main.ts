import { bootstrapApplication } from '@angular/platform-browser';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  AngularRenderScanMarkDirective,
  getCdGraph,
  getOnPushCandidates,
  getReferentialInstability,
  getZonePollutionEvents,
  provideAngularRenderScan,
  getSignalDependencyGraph,
  getComponentCostAnalysis,
} from 'angular-render-scan';

// ── Types ──────────────────────────────────────────────────────
interface Product { id: number; name: string; price: number; cat: string; icon: string }
interface LogEntry { time: string; msg: string; type: 'warn' | 'info' | 'success' }
interface PollutionEntry { time: string; trigger: string; comps: number }
interface TriggerEntry { time: string; source: string; kind: 'zone' | 'signal' | 'unknown' }

const PRODUCTS: Product[] = [
  { id: 1, name: 'TypeScript Handbook', price: 29,  cat: 'Books',    icon: '📘' },
  { id: 2, name: 'Mechanical Keyboard',  price: 149, cat: 'Hardware', icon: '⌨️' },
  { id: 3, name: 'Developer Mug',        price: 19,  cat: 'Merch',    icon: '☕' },
  { id: 4, name: 'Rubber Duck',          price: 9,   cat: 'Debug',    icon: '🦆' },
  { id: 5, name: 'Monitor Stand',        price: 89,  cat: 'Hardware', icon: '🖥️' },
  { id: 6, name: 'SSH Key Ring',         price: 14,  cat: 'Merch',    icon: '🔑' },
];

// ── ProductCard (OnPush — scanner marks it green) ──────────────
@Component({
  selector: 'app-product',
  standalone: true,
  imports: [AngularRenderScanMarkDirective],
  template: `
    <div angularRenderScanMark="ProductCard" class="product-row">
      <span class="p-emoji">{{ p().icon }}</span>
      <div style="flex:1;min-width:0">
        <div class="p-name">{{ p().name }}</div>
        <div class="p-cat">{{ p().cat }}</div>
      </div>
      <span class="p-price">\${{ p().price }}</span>
      <button class="btn btn-primary btn-sm" (click)="add.emit(p())">Add</button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ProductComponent {
  readonly p = input.required<Product>();
  readonly add = output<Product>();
}

// ── CartItem (Default CD — scanner shows it rerenders often) ───
@Component({
  selector: 'app-cart-item',
  standalone: true,
  imports: [AngularRenderScanMarkDirective],
  template: `
    <div angularRenderScanMark="CartItem" class="cart-row">
      <span class="c-emoji">{{ item().icon }}</span>
      <span class="c-name">{{ item().name }}</span>
      <span class="c-qty">×{{ qty() }}</span>
      <button class="btn btn-sm" style="padding:3px 8px;background:transparent;border:1px solid var(--border);color:var(--muted)" (click)="remove.emit(item().id)">✕</button>
    </div>
  `,
  // intentionally Default CD to be surfaced as OnPush candidate
})
class CartItemComponent {
  readonly item = input.required<Product>();
  readonly qty = input.required<number>();
  readonly remove = output<number>();
}

// ── SlowComponent (Default CD — intentional OnPush candidate) ─
@Component({
  selector: 'app-slow',
  standalone: true,
  imports: [AngularRenderScanMarkDirective],
  template: `
    <div angularRenderScanMark="ExpensiveRecommendation">
      <div class="result-box">
        <span style="color:var(--muted);font-size:12px">Computed result</span>
        <span style="font-weight:600;color:var(--amber)">{{ compute() }}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px">
        Ran {{ renders }} times · Last counter: {{ counter() }}
      </div>
    </div>
  `,
  // no OnPush — will rerender on every parent CD cycle
})
class SlowComponent {
  readonly counter = input.required<number>();
  renders = 0;

  compute(): string {
    this.renders += 1;
    const start = Date.now();
    let n = 0.5;
    while (Date.now() - start < 20) {
      n = Math.sin(n) + 0.1;
    }
    const elapsed = Date.now() - start;
    console.log('COMPUTE ELAPSED:', elapsed);
    return n.toFixed(2);
  }
}

// ── RefDemo (OnPush — but receives new object refs) ────────────
@Component({
  selector: 'app-ref-demo',
  standalone: true,
  imports: [AngularRenderScanMarkDirective],
  template: `
    <div angularRenderScanMark="RefInstabilityTarget" class="result-box">
      <span style="color:var(--muted);font-size:12px">config &#64;Input</span>
      <code style="color:var(--red);font-size:12px">
        {{ '{' }} theme: "{{ cfg().theme }}", size: {{ cfg().size }} {{ '}' }}
      </code>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class RefDemoComponent {
  readonly cfg = input.required<{ theme: string; size: number }>();
}

// ── Root ───────────────────────────────────────────────────────
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ProductComponent, CartItemComponent, SlowComponent, RefDemoComponent],
  template: `
<div class="shell">

  <!-- ══ LEFT — Shop ══════════════════════════════════════════ -->
  <div class="panel-left">

    <div class="card">
      <div class="card-head">
        <span class="card-label">Products</span>
        <span class="badge badge-indigo">{{ products.length }} items</span>
      </div>
      <div class="card-body flush">
        @for (p of products; track p.id) {
          <app-product [p]="p" (add)="addToCart($event)" />
        }
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <span class="card-label">Cart</span>
        @if (cartTotal() > 0) {
          <span class="badge badge-green">\${{ cartTotal() }}</span>
        }
      </div>
      <div class="card-body flush">
        @if (cartKeys().length === 0) {
          <div class="empty"><div class="empty-icon">🛒</div>Empty</div>
        } @else {
          @for (k of cartKeys(); track k) {
            <app-cart-item [item]="cart().get(k)!.product" [qty]="cart().get(k)!.qty" (remove)="removeFromCart($event)" />
          }
          <div style="padding:8px 12px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600;font-size:13px">\${{ cartTotal() }}</span>
            <button class="btn btn-primary btn-sm" (click)="checkout()">Checkout</button>
          </div>
        }
      </div>
    </div>

    <div class="card log-card">
      <div class="card-head">
        <span class="card-label">Render log</span>
        <button class="btn btn-sm btn-outline" (click)="log.set([])">Clear</button>
      </div>
      <div class="card-body flush log-scroll">
        @if (log().length === 0) {
          <div class="empty"><div class="empty-icon">📋</div>Nothing yet</div>
        } @else {
          <div class="log">
            @for (e of log(); track e.time + e.msg + $index) {
              <div class="log-row {{ e.type }}">
                <span class="log-time">{{ e.time }}</span>
                <span class="log-msg">{{ e.msg }}</span>
              </div>
            }
          </div>
        }
      </div>
    </div>

  </div><!-- /panel-left -->

  <!-- ══ RIGHT — Scanner tabs ══════════════════════════════════ -->
  <div class="panel-right">

    <!-- Tab bar -->
    <div class="tab-bar">
      <button class="tab-btn" [class.active]="activeTab() === 'trigger'"    (click)="activeTab.set('trigger')">⚡ Triggers</button>
      <button class="tab-btn" [class.active]="activeTab() === 'onpush'"     (click)="activeTab.set('onpush')">🚀 OnPush</button>
      <button class="tab-btn" [class.active]="activeTab() === 'zone'"       (click)="activeTab.set('zone')">⚠️ Zone</button>
      <button class="tab-btn" [class.active]="activeTab() === 'ref'"        (click)="activeTab.set('ref')">🔗 Refs</button>
      <button class="tab-btn" [class.active]="activeTab() === 'graph'"      (click)="activeTab.set('graph')">📊 Graph</button>
      <button class="tab-btn" [class.active]="activeTab() === 'signals'"    (click)="activeTab.set('signals'); refreshSignalGraph()">📶 Signals</button>
      <button class="tab-btn" [class.active]="activeTab() === 'cost'"       (click)="activeTab.set('cost'); refreshCostAnalysis()">💰 Cost</button>
    </div>

    <!-- Tab panels -->
    <div class="tab-content">

      <!-- ── TRIGGER ATTRIBUTION ─────────────────────────────── -->
      @if (activeTab() === 'trigger') {
        <div class="tab-panel">
          <div class="stat-row">
            <div class="stat">
              <div class="stat-label">CD cycles</div>
              <div class="stat-value">{{ totalCycles() }}</div>
              <div class="stat-sub">this session</div>
            </div>
            <div class="stat" style="flex:2">
              <div class="stat-label">Last trigger</div>
              <div style="margin-top:4px"><span [class]="'tpill ' + triggerKind()" style="font-size:12px;padding:4px 10px">{{ lastTrigger() }}</span></div>
              <div class="stat-sub" style="margin-top:3px">what caused the latest CD cycle</div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><span class="card-label">Trigger types</span></div>
            <div class="card-body" style="padding:10px">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div class="trig-box">
                  <div class="trig-title">Zone — click</div>
                  <button class="btn btn-outline btn-sm" (click)="counter.update(c=>c+1)">Click ({{ counter() }})</button>
                </div>
                <div class="trig-box">
                  <div class="trig-title">Zone — setTimeout</div>
                  <button class="btn btn-outline btn-sm" (click)="fireMacroTask()">Fire timeout</button>
                </div>
                <div class="trig-box">
                  <div class="trig-title">Signal write</div>
                  <button class="btn btn-outline btn-sm" (click)="signalTick.update(c=>c+1)">Write signal ({{ signalTick() }})</button>
                </div>
                <div class="trig-box">
                  <div class="trig-title">Zone — setInterval</div>
                  <button class="btn btn-sm" [class]="stream() ? 'btn-danger' : 'btn-outline'" (click)="toggleStream()">
                    {{ stream() ? '⏹ Stop' : '▶ Start stream' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          @if (triggers().length > 0) {
            <div class="card" style="margin-top:8px">
              <div class="card-head">
                <span class="card-label">History</span>
                <button class="btn btn-sm btn-outline" (click)="triggers.set([])">Clear</button>
              </div>
              <div class="card-body flush" style="max-height:180px;overflow-y:auto">
                <table class="tbl">
                  <thead><tr><th>Time</th><th>Source</th><th>Type</th></tr></thead>
                  <tbody>
                    @for (t of triggers(); track t.time + t.source + $index) {
                      <tr>
                        <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">{{ t.time }}</td>
                        <td style="font-family:var(--mono);font-size:12px">{{ t.source }}</td>
                        <td><span [class]="'tpill ' + t.kind">{{ t.kind }}</span></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        </div>
      }

      <!-- ── ONPUSH CANDIDATES ───────────────────────────────── -->
      @if (activeTab() === 'onpush') {
        <div class="tab-panel">
          <app-slow [counter]="counter()" />
          <div class="btn-row" style="margin:10px 0">
            <button class="btn btn-primary btn-sm" (click)="refreshOnPush()">Refresh candidates</button>
          </div>
          @if (onPushList().length === 0) {
            <div class="card"><div class="empty"><div class="empty-icon">✅</div>No candidates yet — interact with the shop, then Refresh</div></div>
          } @else {
            <div class="card">
              <div class="card-head"><span class="card-label">{{ onPushList().length }} component{{ onPushList().length > 1 ? 's' : '' }} to optimise</span></div>
              <div class="card-body flush" style="max-height:200px;overflow-y:auto">
                <table class="tbl">
                  <thead><tr><th>Component</th><th>Wasted</th><th>Checks</th><th>Confidence</th></tr></thead>
                  <tbody>
                    @for (c of onPushList(); track c.name) {
                      <tr>
                        <td style="font-family:var(--mono);font-size:11px">{{ c.selector }}</td>
                        <td>
                          <div style="display:flex;align-items:center;gap:6px">
                            <div class="bar"><div class="bar-fill" [class]="c.wastedPercentage > 70 ? 'red' : 'amber'" [style.width]="c.wastedPercentage + '%'"></div></div>
                            <span style="font-family:var(--mono);font-size:11px">{{ c.wastedPercentage.toFixed(0) }}%</span>
                          </div>
                        </td>
                        <td>{{ c.totalChecks }}</td>
                        <td><span [class]="'badge ' + (c.confidence === 'high' ? 'badge-green' : c.confidence === 'medium' ? 'badge-amber' : 'badge-gray')">{{ c.confidence }}</span></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
          <div class="card" style="margin-top:8px">
            <div class="card-body flush"><pre class="code" [textContent]="codeOnPush" style="margin:0;border-radius:0;font-size:11px"></pre></div>
          </div>
        </div>
      }

      <!-- ── ZONE POLLUTION ──────────────────────────────────── -->
      @if (activeTab() === 'zone') {
        <div class="tab-panel">
          <div class="stat-row">
            <div class="stat amber">
              <div class="stat-label">Pollution events</div>
              <div class="stat-value">{{ pollutionEvents().length }}</div>
              <div class="stat-sub">this session</div>
            </div>
            <div class="stat" [class]="stream() ? 'amber' : ''">
              <div class="stat-label">Stream</div>
              <div class="stat-value" style="font-size:18px">{{ stream() ? '🔴 Live' : '⚪ Off' }}</div>
              <div class="stat-sub">setInterval source</div>
            </div>
          </div>
          <div class="btn-row" style="margin-bottom:10px">
            <button class="btn btn-outline btn-sm" (click)="fireSinglePollution()">Fire setTimeout</button>
            <button class="btn btn-sm" [class]="stream() ? 'btn-danger' : 'btn-outline'" (click)="toggleStream()">
              {{ stream() ? '⏹ Stop stream' : '▶ Start stream' }}
            </button>
            <button class="btn btn-outline btn-sm" (click)="pollutionEvents.set([])">Clear</button>
          </div>
          @if (pollutionEvents().length === 0) {
            <div class="card"><div class="empty"><div class="empty-icon">✅</div>No pollution yet — use the buttons above</div></div>
          } @else {
            <div class="card">
              <div class="card-head"><span class="card-label">{{ pollutionEvents().length }} pollution events</span><button class="btn btn-sm btn-outline" (click)="pollutionEvents.set([])">Clear</button></div>
              <div class="card-body flush" style="max-height:200px;overflow-y:auto">
                <table class="tbl">
                  <thead><tr><th>Time</th><th>Task</th><th>Source</th></tr></thead>
                  <tbody>
                    @for (e of pollutionEvents(); track e.time + e.trigger + $index) {
                      <tr>
                        <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">{{ e.time }}</td>
                        <td><span class="badge badge-amber">{{ e.trigger }}</span></td>
                        <td style="font-family:var(--mono);font-size:11px">{{ e.comps }} components</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
          <div class="card" style="margin-top:8px">
            <div class="card-body flush"><pre class="code" [textContent]="codeZone" style="margin:0;border-radius:0;font-size:11px"></pre></div>
          </div>
        </div>
      }

      <!-- ── REFERENTIAL STABILITY ───────────────────────────── -->
      @if (activeTab() === 'ref') {
        <div class="tab-panel">
          <app-ref-demo [cfg]="refCfg()" />
          <div class="callout" style="margin:10px 0">
            <div class="callout-body">
              Fired <strong style="color:var(--red)">{{ refFireCount() }}</strong> times with identical data but new object references
            </div>
          </div>
          <div class="btn-row" style="margin-bottom:10px">
            <button class="btn btn-primary btn-sm" (click)="fireNewRef()">Fire new reference</button>
            <button class="btn btn-outline btn-sm" (click)="refreshRefInstab()">Refresh report</button>
          </div>
          @if (refList().length === 0) {
            <div class="card"><div class="empty"><div class="empty-icon">✅</div>No instability yet — fire a few references, then Refresh</div></div>
          } @else {
            <div class="card">
              <div class="card-head"><span class="card-label">Instability report</span></div>
              <div class="card-body flush" style="max-height:160px;overflow-y:auto">
                <table class="tbl">
                  <thead><tr><th>Component</th><th>Input</th><th>Unstable refs</th><th>Waste</th></tr></thead>
                  <tbody>
                    @for (r of refList(); track r.componentName + r.inputName) {
                      <tr>
                        <td style="font-family:var(--mono);font-size:11px">{{ r.selector }}</td>
                        <td><span class="badge badge-red">{{ r.inputName }}</span></td>
                        <td><strong style="color:var(--red)">{{ r.unstableRefCount }}</strong></td>
                        <td>
                          <div style="display:flex;align-items:center;gap:6px">
                            <div class="bar"><div class="bar-fill red" [style.width]="(r.unstableRefCount / (r.totalRenders || 1) * 100) + '%'"></div></div>
                            <span style="font-family:var(--mono);font-size:11px">{{ (r.unstableRefCount / (r.totalRenders || 1) * 100).toFixed(0) }}%</span>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
          <div class="card" style="margin-top:8px">
            <div class="card-body flush"><pre class="code" [textContent]="codeRef" style="margin:0;border-radius:0;font-size:11px"></pre></div>
          </div>
        </div>
      }

      <!-- ── CD GRAPH ────────────────────────────────────────── -->
      @if (activeTab() === 'graph') {
        <div class="tab-panel">
          <div class="btn-row" style="margin-bottom:10px">
            <button class="btn btn-primary btn-sm" (click)="refreshGraph()">Refresh graph</button>
            <span style="font-size:11px;color:var(--muted)">Interact with the shop first</span>
          </div>
          @if (graphNodes().length === 0) {
            <div class="card"><div class="empty"><div class="empty-icon">📊</div>No data yet — interact with the shop, then Refresh</div></div>
          } @else {
            <div class="card">
              <div class="card-head">
                <span class="card-label">{{ graphNodes().length }} components tracked</span>
                <div style="display:flex;gap:6px">
                  <span class="badge badge-green">{{ onPushNodeCount() }} OnPush</span>
                  <span class="badge badge-amber">{{ defaultNodeCount() }} Default</span>
                </div>
              </div>
              <div class="card-body flush" style="max-height:320px;overflow-y:auto">
                <table class="tbl">
                  <thead><tr><th>Component</th><th>Strategy</th><th>Renders</th><th>Wasted</th><th>Last trigger</th></tr></thead>
                  <tbody>
                    @for (n of graphNodes(); track n.id) {
                      <tr>
                        <td style="font-family:var(--mono);font-size:11px">{{ n.name }}</td>
                        <td>
                          <span [class]="'badge ' + (n.cdStrategy === 'OnPush' ? 'badge-green' : 'badge-amber')">
                            {{ n.cdStrategy }}
                          </span>
                        </td>
                        <td>{{ n.renderCount }}</td>
                        <td>
                          @if (n.wastedChecks > 0) {
                            <span style="color:var(--red);font-weight:600">{{ n.wastedChecks }}</span>
                          } @else {
                            <span style="color:var(--muted)">—</span>
                          }
                        </td>
                        <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">
                          @if (n.lastTrigger) {
                            {{ n.lastTrigger }}
                          } @else {
                            <span style="color:var(--muted)">—</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        </div>
      }

      <!-- ── SIGNALS GRAPH ───────────────────────────────────── -->
      @if (activeTab() === 'signals') {
        <div class="tab-panel">
          <div class="btn-row" style="margin-bottom:10px">
            <button class="btn btn-primary btn-sm" (click)="refreshSignalGraph()">Refresh signals</button>
            <span style="font-size:11px;color:var(--muted)">Shows dependencies between signals</span>
          </div>
          @if (signalGraph().nodes.length === 0) {
            <div class="card"><div class="empty"><div class="empty-icon">📶</div>No signals detected yet — trigger signal writes/reads, then Refresh</div></div>
          } @else {
            <div class="card">
              <div class="card-head">
                <span class="card-label">Signal Nodes ({{ signalGraph().nodes.length }})</span>
              </div>
              <div class="card-body flush" style="max-height:220px;overflow-y:auto">
                <table class="tbl">
                  <thead><tr><th>Name</th><th>Kind</th><th>Updates</th><th>Wasted</th><th>Value</th></tr></thead>
                  <tbody>
                    @for (n of signalGraph().nodes; track n.id) {
                      <tr>
                        <td style="font-family:var(--mono);font-size:11px">{{ n.name }}</td>
                        <td>
                          <span [class]="'badge ' + (n.kind === 'signal' ? 'badge-indigo' : n.kind === 'computed' ? 'badge-green' : 'badge-amber')">
                            {{ n.kind }}
                          </span>
                        </td>
                        <td>{{ n.updateCount }}</td>
                        <td>
                          @if (n.wastedCount > 0) {
                            <span style="color:var(--red);font-weight:600">{{ n.wastedCount }}</span>
                          } @else {
                            <span style="color:var(--muted)">0</span>
                          }
                        </td>
                        <td style="font-family:var(--mono);font-size:11px;color:var(--muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ n.value ?? '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
            
            @if (signalGraph().edges.length > 0) {
              <div class="card" style="margin-top:8px">
                <div class="card-head">
                  <span class="card-label">Dependency Edges ({{ signalGraph().edges.length }})</span>
                </div>
                <div class="card-body flush" style="max-height:150px;overflow-y:auto">
                  <table class="tbl">
                    <thead><tr><th>From</th><th>To</th></tr></thead>
                    <tbody>
                      @for (e of signalGraph().edges; track e.fromId + '->' + e.toId) {
                        <tr>
                          <td style="font-family:var(--mono);font-size:11px">{{ e.fromId }}</td>
                          <td style="font-family:var(--mono);font-size:11px">➔ {{ e.toId }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          }
        </div>
      }

      <!-- ── COMPONENT COST ANALYSIS ─────────────────────────── -->
      @if (activeTab() === 'cost') {
        <div class="tab-panel">
          <div class="btn-row" style="margin-bottom:10px">
            <button class="btn btn-primary btn-sm" (click)="refreshCostAnalysis()">Refresh cost</button>
            <span style="font-size:11px;color:var(--muted)">Rank components by render cost</span>
          </div>
          @if (costAnalysis().length === 0) {
            <div class="card"><div class="empty"><div class="empty-icon">💰</div>No cost analysis data yet — interact with the shop, then Refresh</div></div>
          } @else {
            <div class="card">
              <div class="card-head">
                <span class="card-label">Component Performance Costs</span>
              </div>
              <div class="card-body flush" style="max-height:320px;overflow-y:auto">
                <table class="tbl">
                  <thead><tr><th>Component</th><th>Renders</th><th>Total duration</th><th>Avg duration</th><th>Cost share</th></tr></thead>
                  <tbody>
                    @for (c of costAnalysis(); track c.name) {
                      <tr>
                        <td style="font-family:var(--mono);font-size:11px">{{ c.name }}</td>
                        <td>{{ c.renderCount }}</td>
                        <td>{{ c.totalDuration.toFixed(2) }}ms</td>
                        <td>{{ c.averageDuration.toFixed(2) }}ms</td>
                        <td>
                          <div style="display:flex;align-items:center;gap:6px">
                            <div class="bar" style="width:60px"><div class="bar-fill red" [style.width]="c.costPercentage + '%'"></div></div>
                            <span style="font-family:var(--mono);font-size:11px">{{ c.costPercentage.toFixed(1) }}%</span>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        </div>
      }

    </div><!-- /tab-content -->
  </div><!-- /panel-right -->

</div><!-- /shell -->

  `,
})
class AppComponent implements OnInit, OnDestroy {

  // ── Shared reactive counter ──────────────────────────────────
  readonly activeTab  = signal<'trigger'|'onpush'|'zone'|'ref'|'graph'|'signals'|'cost'>('trigger');

  readonly counter    = signal(0);
  readonly signalTick = signal(0);
  readonly stream     = signal(false);


  // ── Cart ─────────────────────────────────────────────────────
  readonly products   = PRODUCTS;
  readonly cart       = signal(new Map<number, { product: Product; qty: number }>());
  readonly cartKeys   = computed(() => Array.from(this.cart().keys()));
  readonly cartTotal  = computed(() => { let t = 0; this.cart().forEach(v => t += v.product.price * v.qty); return t; });

  // ── Trigger attribution ──────────────────────────────────────
  readonly totalCycles = signal(0);
  readonly lastTrigger = signal('—');
  readonly triggers    = signal<TriggerEntry[]>([]);
  readonly triggerKind = computed((): string => {
    const t = this.lastTrigger();
    if (t.startsWith('zone:'))   return 'zone';
    if (t.startsWith('signal:')) return 'signal';
    return 'unknown';
  });

  // ── Log ──────────────────────────────────────────────────────
  readonly log = signal<LogEntry[]>([]);

  // ── Zone pollution ───────────────────────────────────────────
  readonly pollutionEvents = signal<PollutionEntry[]>([]);

  // ── OnPush candidates ────────────────────────────────────────
  readonly onPushList = signal<ReturnType<typeof getOnPushCandidates>>([]);

  // ── Ref instability ──────────────────────────────────────────
  readonly refCfg      = signal({ theme: 'dark', size: 12 });
  readonly refFireCount = signal(0);
  readonly refList     = signal<ReturnType<typeof getReferentialInstability>>([]);

  // ── CD graph ─────────────────────────────────────────────────
  readonly graphNodes     = signal<ReturnType<typeof getCdGraph>['nodes']>([]);
  readonly onPushNodeCount = computed(() => this.graphNodes().filter(n => n.cdStrategy === 'OnPush').length);
  readonly defaultNodeCount = computed(() => this.graphNodes().filter(n => n.cdStrategy === 'Default').length);

  // ── Code snippets ────────────────────────────────────────────
  readonly codeOnPush = `// Before (Default — re-checks every cycle)
@Component({ changeDetection: ChangeDetectionStrategy.Default })

// After (OnPush — only re-checks when @Input reference changes or events fire)
@Component({ changeDetection: ChangeDetectionStrategy.OnPush })`;

  readonly codeZone = `// ❌ Problem — setInterval inside Angular triggers CD every second
constructor(private data: DataService) {
  setInterval(() => this.data.refresh(), 1000); // Zone.js sees this!
}

// ✅ Fix — run outside Angular's zone
constructor(private ngZone: NgZone, private data: DataService) {
  ngZone.runOutsideAngular(() => {
    setInterval(() => {
      // only pull Angular back in when you need a real UI update
      if (dataChanged) ngZone.run(() => this.data.refresh());
    }, 1000);
  });
}`;

  readonly codeRef = `// ❌ Problem — new object created each render (same values, new reference)
@Component({ template: '<app-card [config]="getConfig()" />' })
getConfig() { return { theme: 'dark', size: 12 }; } // called every cycle!

// ✅ Fix 1 — lift to a class field (never re-created)
readonly config = { theme: 'dark', size: 12 };

// ✅ Fix 2 — use a signal
readonly config = signal({ theme: 'dark', size: 12 });

// ✅ Fix 3 — use computed() so it only changes when dependencies change
readonly config = computed(() => ({ theme: this.theme(), size: this.size() }));`;

  // ── Internals ────────────────────────────────────────────────
  private streamId: ReturnType<typeof setInterval> | null = null;

  private readonly onRender = (e: Event) => {
    const d = (e as CustomEvent<any>).detail;
    if (d.name === 'AppRoot') {
      return;
    }

    const trigger = d.renderCause?.trigger || d.reason;
    const source = d.renderCause?.source;

    // Ignore render events triggered by updating demo debug/stats signals
    if (source && (
      source.includes('totalCycles') ||
      source.includes('lastTrigger') ||
      source.includes('triggers') ||
      source.includes('log') ||
      source.includes('pollutionEvents') ||
      source.includes('onPushList') ||
      source.includes('refList') ||
      source.includes('graphNodes') ||
      source.includes('signalGraph') ||
      source.includes('costAnalysis')
    )) {
      return;
    }

    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const duration = d.latestDuration ?? d.duration ?? 0;

    setTimeout(() => {
      this.totalCycles.update(c => c + 1);
      if (trigger) {
        this.lastTrigger.set(trigger);
        this.triggers.update(h => [{
          time: t,
          source: trigger,
          kind: trigger.startsWith('zone') ? 'zone' : trigger.startsWith('signal') ? 'signal' : 'unknown',
        }, ...h.slice(0, 49)]);
      }
      this.log.update(l => [{
        time: t,
        msg: `[${d.name}] ${duration.toFixed(2)}ms${trigger ? ` ← ${trigger}` : ''}`,
        type: duration > 15 ? 'warn' : 'info',
      }, ...l.slice(0, 24)]);
    });
  };

  private readonly onPollution = (e: Event) => {
    const d = (e as CustomEvent).detail;
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    setTimeout(() => {
      this.pollutionEvents.update(l => [{
        time: t,
        trigger: d?.suspectedTrigger ?? 'unknown zone task',
        comps: d?.componentCount ?? 0,
      }, ...l.slice(0, 49)]);
    });
  };

  ngOnInit() {
    window.addEventListener('angular-render-scan:render', this.onRender);
    window.addEventListener('angular-render-scan:zone-pollution', this.onPollution);
  }

  ngOnDestroy() {
    window.removeEventListener('angular-render-scan:render', this.onRender);
    window.removeEventListener('angular-render-scan:zone-pollution', this.onPollution);
    if (this.streamId) clearInterval(this.streamId);
  }

  // ── Cart actions ─────────────────────────────────────────────
  addToCart(product: Product) {
    const m = new Map(this.cart());
    const e = m.get(product.id);
    m.set(product.id, e ? { ...e, qty: e.qty + 1 } : { product, qty: 1 });
    this.cart.set(m);
  }
  removeFromCart(id: number) {
    const m = new Map(this.cart());
    const e = m.get(id);
    if (!e) return;
    if (e.qty > 1) m.set(id, { ...e, qty: e.qty - 1 }); else m.delete(id);
    this.cart.set(m);
  }
  checkout() {
    this.cart.set(new Map());
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    this.log.update(l => [{ time: t, msg: 'Checkout complete — cart cleared', type: 'success' }, ...l.slice(0, 24)]);
  }

  // ── Trigger generators ───────────────────────────────────────
  fireMacroTask() { setTimeout(() => this.counter.update(c => c + 1), 300); }

  toggleStream() {
    this.stream.update(v => !v);
    if (this.stream()) {
      this.streamId = setInterval(() => this.counter.update(c => c + 1), 500);
    } else {
      if (this.streamId) { clearInterval(this.streamId); this.streamId = null; }
    }
  }

  // ── Zone pollution ───────────────────────────────────────────
  fireSinglePollution() { setTimeout(() => this.counter.update(c => c + 1), 100); }

  // ── Ref instability ──────────────────────────────────────────
  fireRefInstab() {
    // Always a new object reference, same values
    this.refCfg.set({ theme: 'dark', size: 12 });
    this.refFireCount.update(c => c + 1);
  }
  fireNewRef() { this.fireRefInstab(); }
  refreshRefInstab() { this.refList.set(getReferentialInstability()); }

  // ── OnPush candidates ────────────────────────────────────────
  refreshOnPush() { this.onPushList.set(getOnPushCandidates()); }

  // ── CD graph ─────────────────────────────────────────────────
  refreshGraph() {
    const g = getCdGraph();
    this.graphNodes.set(g.nodes);
  }

  // ── Signals graph ─────────────────────────────────────────────
  readonly signalGraph = signal<ReturnType<typeof getSignalDependencyGraph>>({ nodes: [], edges: [] });
  refreshSignalGraph() {
    this.signalGraph.set(getSignalDependencyGraph());
  }

  // ── Cost Analysis ─────────────────────────────────────────────
  readonly costAnalysis = signal<ReturnType<typeof getComponentCostAnalysis>>([]);
  refreshCostAnalysis() {
    this.costAnalysis.set(getComponentCostAnalysis());
  }


}

// ── Bootstrap ─────────────────────────────────────────────────
bootstrapApplication(AppComponent, {
  providers: [
    provideAngularRenderScan({
      enabled: true,
      showToolbar: true,
      animationSpeed: 'fast',
      showFPS: true,
      log: false,
      trackReferentialStability: true,
      referentialStabilityDepth: 4,
      onPushCandidateThreshold: 40,
      maxZonePollutionEvents: 50,
      showCdGraph: true,
      maxRecordedCycles: 30,
      showCopyPrompt: true,
      promptContext: 'Angular 22 demo — showcase of all Angular Render Scan features',
      onZonePollution: (ev) => {
        window.dispatchEvent(new CustomEvent('angular-render-scan:zone-pollution', { detail: ev }));
      },
    }),
  ],
});
