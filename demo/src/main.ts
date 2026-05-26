import { bootstrapApplication } from '@angular/platform-browser';
import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter, computed, signal, WritableSignal } from '@angular/core';
import { AngularRenderScanMarkDirective, provideAngularRenderScan, setOptions } from 'angular-render-scan';
import { CommonModule } from '@angular/common';

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
  { id: 3, title: 'Ergonomic Mouse', price: 79.50, icon: '🖱️', description: 'Saves your wrist.' },
  { id: 4, title: 'Noise Cancelling Headphones', price: 299.99, icon: '🎧', description: 'Zone out the world.' },
  { id: 5, title: 'Ultra-wide Monitor', price: 499.00, icon: '🖥️', description: 'See all the code.' },
  { id: 6, title: 'Standing Desk', price: 650.00, icon: '🪑', description: 'Stand up for your health.' },
];

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [AngularRenderScanMarkDirective, CommonModule],
  template: `
    <article angularRenderScanMark="ProductCard" class="product-card">
      <div class="product-icon">{{ product.icon }}</div>
      <div class="product-info">
        <h3>{{ product.title }}</h3>
        <p>{{ product.description }}</p>
      </div>
      <div class="product-footer">
        <span class="price">\${{ product.price.toFixed(2) }}</span>
        <button (click)="onAdd.emit(product)">Add to Cart</button>
      </div>
    </article>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush // Optimized
})
class ProductCardComponent {
  @Input({ required: true }) product!: Product;
  @Output() onAdd = new EventEmitter<Product>();
}

@Component({
  selector: 'app-cart-item',
  standalone: true,
  imports: [AngularRenderScanMarkDirective, CommonModule],
  template: `
    <div angularRenderScanMark="CartItem" class="cart-item">
      <span>{{ item.icon }} {{ item.title }}</span>
      <div class="cart-item-actions">
        <span class="qty">x{{ quantity }}</span>
        <button class="icon-btn" (click)="onRemove.emit(item)">❌</button>
      </div>
    </div>
  `
})
class CartItemComponent {
  @Input({ required: true }) item!: Product;
  @Input({ required: true }) quantity!: number;
  @Output() onRemove = new EventEmitter<Product>();
}

@Component({
  selector: 'app-shopping-cart',
  standalone: true,
  imports: [AngularRenderScanMarkDirective, CommonModule, CartItemComponent],
  template: `
    <aside angularRenderScanMark="ShoppingCart" class="cart-sidebar">
      <div class="panel-heading">
        <span class="panel-kicker">Signal cart</span>
        <h2>Your Cart</h2>
      </div>
      <p class="cart-summary">{{ totalItems() }} items · \${{ totalPrice().toFixed(2) }}</p>
      
      <div class="cart-items">
        @if (cartKeys().length === 0) {
          <div class="empty-cart">Cart is empty 🛒</div>
        }
        @for (key of cartKeys(); track key) {
          <app-cart-item 
            [item]="cartMap().get(key)!.product" 
            [quantity]="cartMap().get(key)!.quantity"
            (onRemove)="removeFromCart($event)"
          />
        }
      </div>
      <button class="checkout-btn" [disabled]="totalItems() === 0" (click)="checkout()">Checkout</button>
    </aside>
  `
})
class ShoppingCartComponent {
  @Input({ required: true }) cartMap!: WritableSignal<Map<number, { product: Product, quantity: number }>>;
  @Output() checkoutEvent = new EventEmitter<void>();

  cartKeys = computed(() => Array.from(this.cartMap().keys()));
  
  totalItems = computed(() => {
    let total = 0;
    this.cartMap().forEach((v: any) => total += v.quantity);
    return total;
  });

  totalPrice = computed(() => {
    let total = 0;
    this.cartMap().forEach((v: any) => total += (v.product.price * v.quantity));
    return total;
  });

  removeFromCart(product: Product) {
    const map = new Map(this.cartMap());
    const existing: any = map.get(product.id);
    if (existing) {
      if (existing.quantity > 1) {
        map.set(product.id, { ...existing, quantity: existing.quantity - 1 });
      } else {
        map.delete(product.id);
      }
      this.cartMap.set(map);
    }
  }

  checkout() {
    this.checkoutEvent.emit();
    this.cartMap.set(new Map());
  }
}

@Component({
  selector: 'app-recommendations',
  standalone: true,
  imports: [AngularRenderScanMarkDirective],
  template: `
    <section angularRenderScanMark="Recommendations" class="panel slow-panel">
      <div class="panel-heading">
        <span class="panel-kicker">Slow path</span>
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
    // Intentionally slow loop to trigger the >15ms red heat map
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
  imports: [AngularRenderScanMarkDirective],
  template: `
    <section angularRenderScanMark="HeroBanner" class="hero-banner">
      <div>
        <h1>Developer Store</h1>
        <p>Interact with this compact Angular storefront to watch render cost, slow paths, and component updates in real time.</p>
      </div>
      <div class="hero-actions">
        <span class="status-pill">Render Scan live</span>
        <button class="secondary" (click)="toggleTheme()">Theme {{isDark() ? 'On' : 'Off'}}</button>
      </div>
    </section>
  `
})
class HeroBannerComponent {
  isDark = signal(false);
  toggleTheme() {
    this.isDark.update(v => !v);
    if (this.isDark()) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ProductCardComponent,
    ShoppingCartComponent,
    RecommendationsComponent,
    HeroBannerComponent
  ],
  template: `
    <main angularRenderScanMark="AppRoot">
      <app-hero-banner />

      <div class="store-layout">
        <section class="products-section">
          <div class="panel-heading">
            <span class="panel-kicker">OnPush products</span>
            <h2>Products</h2>
          </div>
          <div class="products-grid">
            @for (product of products; track product.id) {
              <app-product-card [product]="product" (onAdd)="addToCart($event)" />
            }
          </div>
        </section>

        <section class="diagnostics-column">
          <app-recommendations />
        </section>

        <app-shopping-cart [cartMap]="cartMap" (checkoutEvent)="onCheckout()" />
      </div>
    </main>
  `
})
class AppComponent {
  products = PRODUCTS;
  cartMap = signal(new Map<number, { product: Product, quantity: number }>());

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
