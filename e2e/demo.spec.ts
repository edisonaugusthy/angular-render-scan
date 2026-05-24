import { expect, test } from '@playwright/test';

const overlaySelector = 'angular-render-scan-overlay';

test('toolbar appears and toggle controls scanner state', async ({ page }) => {
  await page.goto('/');

  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Developer Store' })).toBeVisible();

  await page.locator('app-product-card').filter({ hasText: 'Developer Coffee' }).getByRole('button', { name: 'Add to Cart' }).click();
  await expect.poll(async () => overlay.evaluate((host) => {
    const toolbar = host.shadowRoot?.textContent ?? '';
    return toolbar.includes('ShoppingCart') || toolbar.includes('CartItem') || toolbar.includes('Count');
  })).toBe(true);

  await overlay.evaluate((host) => {
    const input = host.shadowRoot?.querySelector('input') as HTMLInputElement | null;
    input?.click();
  });
  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.querySelector('.switch-text')?.textContent?.trim())).toBe('Off');

  await overlay.evaluate((host) => {
    const input = host.shadowRoot?.querySelector('input') as HTMLInputElement | null;
    input?.click();
  });
  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.querySelector('.switch-text')?.textContent?.trim())).toBe('On');
});

test('slow recommendations component can become the slowest latest entry', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Recalculate' }).click();

  await expect.poll(async () => page.locator(overlaySelector).evaluate((host) => {
    return host.shadowRoot?.textContent ?? '';
  })).toContain('Recommendations');
});

test('cart updates emit component render events', async ({ page }) => {
  await page.goto('/');

  await expect.poll(async () => page.evaluate(() => {
    return new Promise<string>((resolve) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener('angular-render-scan:render', onRender);
        resolve('');
      }, 700);
      const onRender = (event: Event) => {
        const detail = (event as CustomEvent<{ name: string }>).detail;
        if (detail.name === 'CartItem' || detail.name === 'ShoppingCart') {
          window.clearTimeout(timeout);
          window.removeEventListener('angular-render-scan:render', onRender);
          resolve(detail.name);
        }
      };
      window.addEventListener('angular-render-scan:render', onRender);
      document.querySelector<HTMLButtonElement>('app-product-card button')?.click();
    });
  })).not.toBe('');
});

test('manual package rename surfaces in browser integration', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator(overlaySelector)).toBeAttached();
  await expect(page.evaluate(() => 'AngularRenderScan' in window)).resolves.toBe(true);
});
