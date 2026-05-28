import { bootstrapApplication } from '@angular/platform-browser';
import { ChangeDetectionStrategy, Component, computed, signal, WritableSignal, effect, input, output, OnDestroy } from '@angular/core';
import { AngularRenderScanMarkDirective, provideAngularRenderScan } from 'angular-render-scan';

interface Product {
  id: number;
  title: string;
  price: number;
  icon: string;
  description: string;
}

const PRODUCTS: Product[] = [
  { id: 1, title: 'Developer Coffee', price: 29.99, icon: '☕', description: 'Dark roast, high caffeine.' },
  { id: 2, title: 'Mechanical Keyboard', price: 149.00, icon: '⌨️', description: 'Clicky blue switches.' },
];

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [AngularRenderScanMarkDirective],
  template: `
    <article angularRenderScanMark="ProductCard" class="product-card">
      <div class="product-icon">{{ product().icon }}</div>
      <div class="product-info">
        <h3>{{ product().title }}</h3>
        <p>{{ product().description }}</p>
      </div>
      <div class="product-footer">
        <span class="price">\${{ product().price.toFixed(2) }}</span>
        <button (click)="onAdd.emit(product())">Add to Cart</button>
      </div>
    </article>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
class ProductCardComponent {
  readonly product = input.required<Product>();
  readonly onAdd = output<Product>();
}

@Component({
  selector: 'app-cart-item',
  standalone: true,
  imports: [AngularRenderScanMarkDirective],
  template: `
    <div angularRenderScanMark="CartItem" class="cart-item">
      <span>{{ item().icon }} {{ item().title }}</span>
      <div class="cart-item-actions">
        <span class="qty">x{{ quantity() }}</span>
        <button class="icon-btn" (click)="onRemove.emit(item())">❌</button>
      </div>
    </div>
  `
})
class CartItemComponent {
  readonly item = input.required<Product>();
  readonly quantity = input.required<number>();
  readonly onRemove = output<Product>();
}

@Component({
  selector: 'app-shopping-cart',
  standalone: true,
  imports: [AngularRenderScanMarkDirective, CartItemComponent],
  template: `
    <aside angularRenderScanMark="ShoppingCart" class="cart-sidebar">
      <div class="panel-heading">
        <span class="kicker">Signal cart</span>
        <h2>Your Cart</h2>
      </div>
      <p class="cart-summary">{{ totalItems() }} items · \${{ totalPrice().toFixed(2) }}</p>
      
      <div class="cart-items">
        @if (cartKeys().length === 0) {
          <div class="empty-cart">Cart is empty 🛒</div>
        }
        @for (key of cartKeys(); track key) {
          <app-cart-item 
            [item]="cartMap()().get(key)!.product" 
            [quantity]="cartMap()().get(key)!.quantity"
            (onRemove)="removeFromCart($event)"
          />
        }
      </div>
      <button class="checkout-btn" [disabled]="totalItems() === 0" (click)="checkout()">Checkout</button>
    </aside>
  `
})
class ShoppingCartComponent {
  readonly cartMap = input.required<WritableSignal<Map<number, {
    product: Product;
    quantity: number;
  }>>>();
  readonly checkoutEvent = output<void>();

  readonly cartKeys = computed(() => Array.from(this.cartMap()().keys()));
  
  readonly totalItems = computed(() => {
    let total = 0;
    this.cartMap()().forEach((v: any) => total += v.quantity);
    return total;
  });

  readonly totalPrice = computed(() => {
    let total = 0;
    this.cartMap()().forEach((v: any) => total += (v.product.price * v.quantity));
    return total;
  });

  removeFromCart(product: Product) {
    const map = new Map(this.cartMap()());
    const existing: any = map.get(product.id);
    if (existing) {
      if (existing.quantity > 1) {
        map.set(product.id, { ...existing, quantity: existing.quantity - 1 });
      } else {
        map.delete(product.id);
      }
      this.cartMap().set(map);
    }
  }

  checkout() {
    this.checkoutEvent.emit();
    this.cartMap().set(new Map());
  }
}

@Component({
  selector: 'app-recommendations',
  standalone: true,
  imports: [AngularRenderScanMarkDirective],
  template: `
    <section angularRenderScanMark="Recommendations" class="panel slow-panel">
      <div class="panel-heading">
        <span class="kicker">Slow path (Default CD)</span>
        <h2>Recommendation Engine</h2>
      </div>
      <p>Runs intentionally expensive computed work so the scanner can surface a slow component.</p>
      <div class="recommendation-badge">
        <span>Confidence</span>
        <strong>{{ expensiveScore() }}</strong>
      </div>
      <button type="button" (click)="recalculate()">Recalculate</button>
    </section>
  `
})
class RecommendationsComponent {
  readonly seed = signal(2000);
  readonly expensiveScore = computed(() => {
    let total = 0;
    for (let i = 0; i < this.seed() * 400; i += 1) {
      total += Math.sqrt((i % 97) + total % 13);
    }
    return Math.round(total).toLocaleString();
  });

  recalculate(): void {
    this.seed.update((value) => value + 100);
  }
}

@Component({
  selector: 'app-hero-banner',
  standalone: true,
  template: `
    <section angularRenderScanMark="HeroBanner" class="hero-banner">
      <div class="hero-brand">
        <div class="logo-container">
          <svg class="logo-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="brand-details">
          <h1>Developer Store</h1>
          <div class="brand-meta">
            <span class="subtitle">Render Diagnostics Cockpit</span>
            <span class="meta-divider"></span>
            <span class="version-badge">Angular v21.2</span>
          </div>
        </div>
      </div>
      <div class="hero-actions">
        <span class="zone-badge">Zone.js + Signals</span>
        <span class="status-pill"><span class="pulse-dot"></span> SCANNER ACTIVE</span>
        <button class="theme-toggle-btn" (click)="toggleGrid()">
          GRID: {{ showGrid() ? 'ON' : 'OFF' }}
        </button>
      </div>
    </section>
  `
})
class HeroBannerComponent {
  readonly showGrid = signal(true);
  toggleGrid() {
    this.showGrid.update(v => !v);
    if (this.showGrid()) {
      document.body.classList.remove('grid-lines-off');
    } else {
      document.body.classList.add('grid-lines-off');
    }
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    ProductCardComponent,
    ShoppingCartComponent,
    RecommendationsComponent
  ],
  template: `
    <main angularRenderScanMark="AppRoot">
      <h1 class="visually-hidden">Developer Store</h1>

      <div class="cyber-grid">
        <!-- LEFT PANEL: Diagnostics Controls & Telemetry Log -->
        <section class="cyber-panel control-panel">
          <div class="panel-header">
            <span class="kicker">SYSTEM CONTROLLER</span>
            <h2>Diagnostics Control</h2>
          </div>
          
          <div class="control-actions">
            <button class="cyber-btn primary-glow" (click)="triggerSpike()">
              ⚡ Trigger CD Spike
            </button>
            <button class="cyber-btn secondary-glow" (click)="toggleAutoStream()">
              {{ autoStreamActive() ? '🛑 Stop Auto-Stream' : '🚀 Start Auto-Stream' }}
            </button>
          </div>

          <div class="metrics-visualizer">
            <span class="kicker">LIVE CYCLES: {{ reactiveCounter() }}</span>
            <span class="kicker">REAL-TIME PERFORMANCE LOG</span>
            <div class="audit-log">
              @if (auditLogs().length === 0) {
                <div class="log-line">
                  <span class="log-time">[SYSTEM]</span>
                  <span class="log-msg info">Listening for Angular render scan telemetry...</span>
                </div>
              }
              @for (log of auditLogs(); track log.time + log.message) {
                <div class="log-line">
                  <span class="log-time">[{{ log.time }}]</span>
                  <span class="log-msg" [class.warn]="log.type === 'warn'" [class.info]="log.type !== 'warn'">
                    {{ log.message }}
                  </span>
                </div>
              }
            </div>
          </div>
        </section>

        <!-- MIDDLE PANEL: Sandbox Components -->
        <section class="cyber-panel sandbox-panel">
          <div class="panel-header">
            <span class="kicker">SANDBOX NODES</span>
            <h2>Component Grid Matrix</h2>
          </div>
          
          <div class="nodes-container">
            @for (product of products; track product.id) {
              <app-product-card [product]="product" (onAdd)="addToCart($event)" />
            }

            <app-recommendations />
          </div>
        </section>

        <!-- RIGHT PANEL: Shopping Cart -->
        <section class="cyber-panel pipeline-panel">
          <app-shopping-cart [cartMap]="cartMap" (checkoutEvent)="onCheckout()" />
        </section>
      </div>
    </main>
  `
})
class AppComponent implements OnDestroy {
  readonly products = PRODUCTS;
  readonly cartMap = signal(new Map<number, { product: Product, quantity: number }>());
  
  readonly reactiveCounter = signal(0);
  readonly autoStreamActive = signal(false);
  readonly auditLogs = signal<{ time: string, message: string, type: string }[]>([]);
  
  private streamIntervalId: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('angular-render-scan:render', this.onRenderEvent);
    }
  }

  ngOnDestroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('angular-render-scan:render', this.onRenderEvent);
    }
    if (this.streamIntervalId) {
      clearInterval(this.streamIntervalId);
    }
  }

  private readonly onRenderEvent = (e: Event) => {
    const detail = (e as CustomEvent<{ name: string; duration: number }>).detail;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    this.auditLogs.update(logs => [
      { 
        time: now, 
        message: `Render: [${detail.name}] in ${detail.duration.toFixed(2)}ms`, 
        type: detail.duration > 15 ? 'warn' : 'info' 
      },
      ...logs.slice(0, 14)
    ]);
  };

  addToCart(product: Product) {
    const map = new Map(this.cartMap());
    const existing = map.get(product.id);
    if (existing) {
      map.set(product.id, { ...existing, quantity: existing.quantity + 1 });
    } else {
      map.set(product.id, { product, quantity: 1 });
    }
    this.cartMap.set(map);
  }

  onCheckout() {
    alert('Thanks for your purchase!');
  }

  triggerSpike() {
    for (let i = 0; i < 30; i++) {
      setTimeout(() => {
        this.reactiveCounter.update(c => c + 1);
      }, i * 15);
    }
  }

  toggleAutoStream() {
    this.autoStreamActive.update(v => !v);
    if (this.autoStreamActive()) {
      this.streamIntervalId = setInterval(() => {
        this.reactiveCounter.update(c => c + 1);
      }, 250);
    } else {
      if (this.streamIntervalId) {
        clearInterval(this.streamIntervalId);
        this.streamIntervalId = null;
      }
    }
  }
}

bootstrapApplication(AppComponent, {
  providers: [
    provideAngularRenderScan({
      enabled: true,
      showToolbar: true,
      animationSpeed: 'fast',
      showFPS: true,
      log: true
    })
  ]
}).catch((error: unknown) => console.error(error));
