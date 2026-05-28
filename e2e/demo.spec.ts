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
  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.textContent ?? '')).toContain('Wasted');
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

test('toolbar displays and triggers export session controls', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator(overlaySelector);

  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.export-btn') !== null;
  })).toBe(true);

  await page.getByRole('button', { name: 'Recalculate' }).click();

  const downloadPromise = page.waitForEvent('download');
  await overlay.evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLButtonElement>('.export-btn')?.click();
  });
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('angular-render-scan-session-');
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
  await expect.poll(async () => page.locator(overlaySelector).evaluate((host) => host.shadowRoot?.textContent ?? '')).toContain('Wasted');

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

test('toolbar can toggle live CPU details panel', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator(overlaySelector);
  
  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.cpu-interactive')?.textContent ?? '';
  })).toContain('CPU');

  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.cpu-details-panel');
  })).toBeNull();

  await overlay.evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLElement>('.cpu-interactive')?.click();
  });

  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.cpu-details-panel')?.textContent ?? '';
  })).toContain('CPU Usage');

  await overlay.evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLElement>('.cpu-interactive')?.click();
  });

  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.cpu-details-panel');
  })).toBeNull();
});

test('wasted render counter and mutation details appear in toolbar and details panel', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator(overlaySelector);

  await page.locator('app-product-card').first().getByRole('button', { name: 'Add to Cart' }).click();

  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.textContent ?? '')).toContain('Wasted');

  await overlay.evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLInputElement>('.details-checkbox')?.click();
  });

  await page.locator('app-shopping-cart').click({ force: true });

  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.querySelector('.inspect-panel')?.textContent ?? '')).toContain('Wasted Renders');
  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.querySelector('.inspect-panel')?.textContent ?? '')).toContain('DOM Mutation Type');
});

test('waterfall panel can be toggled via sparkline', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator(overlaySelector);

  await page.getByRole('button', { name: 'Recalculate' }).click();

  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.querySelector('.sparkline-toggle') !== null)).toBe(true);
  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.querySelector('.waterfall-panel') !== null)).toBe(false);

  await overlay.evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLElement>('.sparkline-toggle')?.click();
  });

  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.querySelector('.waterfall-panel')?.textContent ?? '')).toContain('Waterfall');
});
