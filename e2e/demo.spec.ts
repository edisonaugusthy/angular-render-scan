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

test('toolbar can copy an AI performance prompt', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).__angularRenderScanCopiedPrompt = text;
        }
      }
    });
  });
  await page.goto('/');

  await page.getByRole('button', { name: 'Recalculate' }).click();
  const overlay = page.locator(overlaySelector);
  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.textContent ?? '')).toContain('Count');
  await overlay.evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLButtonElement>('.copy-prompt-btn')?.click();
  });

  await expect.poll(async () => page.evaluate(() => (window as any).__angularRenderScanCopiedPrompt ?? '')).toContain('Angular change-detection');
  await expect.poll(async () => page.evaluate(() => (window as any).__angularRenderScanCopiedPrompt ?? '')).toContain('Environment:');
  await expect.poll(async () => page.evaluate(() => (window as any).__angularRenderScanCopiedPrompt ?? '')).toContain('Recent cycle history:');
  await expect.poll(async () => page.evaluate(() => (window as any).__angularRenderScanCopiedPrompt ?? '')).toContain('Slow/error component issues to fix:');
  await expect.poll(async () => page.evaluate(() => (window as any).__angularRenderScanCopiedPrompt ?? '')).toContain('Cost:');
  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.textContent ?? '')).toContain('Copied');
});

test('toolbar hides recording and export controls', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator(overlaySelector);

  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.querySelector('.recording-btn'))).toBeNull();
  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.querySelector('.export-btn'))).toBeNull();
  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.textContent ?? '')).toContain('Copy AI Fix Prompt');
});

test('details mode hover and click opens recommendation panel with component prompt copy', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).__angularRenderScanCopiedComponentPrompt = text;
        }
      }
    });
  });
  await page.goto('/');
  await page.evaluate(() => (window as any).AngularRenderScan.setOptions({ animationSpeed: 'slow' }));

  await page.getByRole('button', { name: 'Recalculate' }).click();
  await expect.poll(async () => page.locator(overlaySelector).evaluate((host) => host.shadowRoot?.textContent ?? '')).toContain('Count');

  await page.locator(overlaySelector).evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLInputElement>('.details-checkbox')?.click();
  });
  await expect.poll(async () => page.locator(overlaySelector).evaluate((host) => {
    return (host.shadowRoot?.querySelector('.details-checkbox') as HTMLInputElement | null)?.checked;
  })).toBe(true);
  await expect.poll(async () => page.locator(overlaySelector).evaluate((host) => {
    return host.shadowRoot?.querySelector('.details-toggle')?.getAttribute('data-tooltip') ?? '';
  })).toContain('Uncheck to clear');
  await expect.poll(async () => page.locator(overlaySelector).evaluate((host) => {
    return host.shadowRoot?.querySelector('.copy-prompt-btn')?.getAttribute('data-tooltip') ?? '';
  })).toContain('slow/error component issues');

  await page.locator('app-recommendations').click({ force: true });

  await expect.poll(async () => page.locator(overlaySelector).evaluate((host) => {
    return host.shadowRoot?.querySelector('.inspect-panel')?.textContent ?? '';
  })).toContain('Recommendations');
  await expect.poll(async () => page.locator(overlaySelector).evaluate((host) => {
    return host.shadowRoot?.querySelector('.panel-copy-btn')?.getAttribute('data-tooltip') ?? '';
  })).toContain('scoped only to this slow component');
  await page.locator(overlaySelector).evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLButtonElement>('.panel-copy-btn')?.click();
  });
  await expect.poll(async () => page.evaluate(() => (window as any).__angularRenderScanCopiedComponentPrompt ?? '')).toContain('I need help fixing one slow/error Angular component');
  await expect.poll(async () => page.evaluate(() => (window as any).__angularRenderScanCopiedComponentPrompt ?? '')).toContain('Estimated cost:');
  await expect.poll(async () => page.evaluate(() => (window as any).__angularRenderScanCopiedComponentPrompt ?? '')).toContain('Component-local recommendations');
  await page.locator(overlaySelector).evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLInputElement>('.details-checkbox')?.click();
  });
  await expect.poll(async () => page.locator(overlaySelector).evaluate((host) => {
    return host.shadowRoot?.querySelector('.inspect-panel');
  })).toBeNull();
});
