import { bootstrapApplication } from '@angular/platform-browser';
import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter, computed, signal, WritableSignal } from '@angular/core';
import { AngularScanMarkDirective, provideAngularScan, setOptions } from 'angular-scan';
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
  imports: [AngularScanMarkDirective, CommonModule],
  template: `
    <article angularScanMark="ProductCard" class="product-card">
      <div class="product-icon">{{ product.icon }}</div>
      <div class="product-info">
        <h3>{{ product.title }}</h3>
        <p>{{ product.description }}</p>
        <div class="product-footer">
          <span class="price">\${{ product.price.toFixed(2) }}</span>
          <button (click)="onAdd.emit(product)">Add to Cart</button>
        </div>
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
  imports: [AngularScanMarkDirective, CommonModule],
  template: `
    <div angularScanMark="CartItem" class="cart-item">
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
  imports: [AngularScanMarkDirective, CommonModule, CartItemComponent],
  template: `
    <aside angularScanMark="ShoppingCart" class="cart-sidebar">
      <h2>Your Cart</h2>
      <p class="cart-summary">{{ totalItems() }} items | Total: \${{ totalPrice().toFixed(2) }}</p>
      
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
  imports: [AngularScanMarkDirective],
  template: `
    <section angularScanMark="Recommendations" class="panel slow-panel">
      <h2>AI Recommendations (Slow)</h2>
      <p>Simulating expensive logic for the red heatmap visual.</p>
      <div class="recommendation-badge">Confidence Score: {{ expensiveScore() }}</div>
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
  imports: [AngularScanMarkDirective],
  template: `
    <section angularScanMark="HeroBanner" class="hero-banner">
      <h1>Developer Store</h1>
      <p>Buy the best tools for your next coding session.</p>
      <button class="secondary" (click)="toggleTheme()">Toggle Dark Mode ({{isDark() ? 'On' : 'Off'}})</button>
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
    <main angularScanMark="AppRoot">
      <app-hero-banner />

      <div class="store-layout">
        <section class="products-section">
          <h2>Products</h2>
          <div class="products-grid">
            @for (product of products; track product.id) {
              <app-product-card [product]="product" (onAdd)="addToCart($event)" />
            }
          </div>
          
          <div class="spacer"></div>
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
    provideAngularScan({
      enabled: true,
      showToolbar: true,
      animationSpeed: 'fast',
      showFPS: true,
      log: true
    })
  ]
}).catch((error: unknown) => console.error(error));
