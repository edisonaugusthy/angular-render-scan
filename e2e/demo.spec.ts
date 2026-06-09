import { expect, test } from '@playwright/test';

const overlaySelector = 'angular-render-scan-overlay';

test('toolbar appears and toggle controls scanner state', async ({ page }) => {
  await page.goto('/');

  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await expect(page.locator('.card-label').first()).toContainText('Products');

  await page.locator('app-product').filter({ hasText: 'Developer Mug' }).getByRole('button', { name: 'Add' }).click();
  await expect.poll(async () => overlay.evaluate((host) => {
    const toolbar = host.shadowRoot?.textContent ?? '';
    return toolbar.includes('ProductCard') || toolbar.includes('CartItem') || toolbar.includes('AppRoot') || toolbar.includes('AppComponent');
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
  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await expect(page.locator('.card-label').first()).toContainText('Products');

  // Activate OnPush tab so app-slow is rendered
  await page.getByRole('button', { name: '🚀 OnPush' }).click();

  await expect.poll(async () => {
    const text = await overlay.evaluate((host) => host.shadowRoot?.textContent ?? '');
    return text.includes('ExpensiveRecommendation') || text.includes('SlowComponent');
  }).toBe(true);
});

test('cart updates emit component render events', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await expect(page.locator('.card-label').first()).toContainText('Products');

  await expect.poll(async () => page.evaluate(() => {
    return new Promise<string>((resolve) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener('angular-render-scan:render', onRender);
        resolve('');
      }, 700);
      const onRender = (event: Event) => {
        const detail = (event as CustomEvent<{ name: string }>).detail;
        if (detail.name === 'CartItem' || detail.name === 'AppRoot' || detail.name === 'ProductCard') {
          window.clearTimeout(timeout);
          window.removeEventListener('angular-render-scan:render', onRender);
          resolve(detail.name);
        }
      };
      window.addEventListener('angular-render-scan:render', onRender);
      document.querySelector<HTMLButtonElement>('app-product button')?.click();
    });
  })).not.toBe('');
});

test('manual package rename surfaces in browser integration', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await expect(page.locator('.card-label').first()).toContainText('Products');

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
  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await expect(page.locator('.card-label').first()).toContainText('Products');

  // Activate OnPush tab so app-slow is rendered
  await page.getByRole('button', { name: '🚀 OnPush' }).click();

  await page.getByRole('button', { name: 'Refresh candidates' }).click();
  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.textContent ?? '')).toContain('waste');
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
  await expect(overlay).toBeAttached();
  await expect(page.locator('.card-label').first()).toContainText('Products');

  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.export-btn') !== null;
  })).toBe(true);

  await page.getByRole('button', { name: 'Click (0)' }).click();

  const downloadPromise = page.waitForEvent('download');
  await overlay.evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLButtonElement>('.export-btn')?.click();
  });
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('angular-render-scan-session-');
});

test('details mode shows recommendation panel on hover with component prompt copy', async ({ page }) => {
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
  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await expect(page.locator('.card-label').first()).toContainText('Products');

  // Activate OnPush tab so app-slow is rendered
  await page.getByRole('button', { name: '🚀 OnPush' }).click();

  await page.evaluate(() => (window as any).AngularRenderScan.setOptions({ animationSpeed: 'slow' }));

  await page.getByRole('button', { name: 'Refresh candidates' }).click();

  await overlay.evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLButtonElement>('.toolbar-picker-toggle')?.click();
  });
  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.toolbar-picker-toggle')?.getAttribute('aria-pressed');
  })).toBe('true');
  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.details-toggle')?.getAttribute('data-tooltip') ?? '';
  })).toContain('hover');

  await page.locator('app-slow').hover({ force: true });

  await expect.poll(async () => {
    const text = await overlay.evaluate((host) => host.shadowRoot?.querySelector('.inspect-panel')?.textContent ?? '');
    return text.includes('ExpensiveRecommendation') || text.includes('SlowComponent');
  }).toBe(true);
  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.panel-copy-btn')?.getAttribute('data-tooltip') ?? '';
  })).toContain('scoped only to this slow component');
  await overlay.evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLButtonElement>('.panel-copy-btn')?.click();
  });
  await expect.poll(async () => page.evaluate(() => (window as any).__angularRenderScanCopiedComponentPrompt ?? '')).toContain('I need help fixing one slow/error Angular component');
  await expect.poll(async () => page.evaluate(() => (window as any).__angularRenderScanCopiedComponentPrompt ?? '')).toContain('Estimated cost:');
  await expect.poll(async () => page.evaluate(() => (window as any).__angularRenderScanCopiedComponentPrompt ?? '')).toContain('Component-local recommendations');
  await page.mouse.move(8, 8);
  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.inspect-panel');
  })).toBeNull();
});

test('toolbar can toggle live CPU details panel', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await expect(page.locator('.card-label').first()).toContainText('Products');
  
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

test('mutation details appear in toolbar and details panel', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await expect(page.locator('.card-label').first()).toContainText('Products');

  await page.locator('app-product').first().getByRole('button', { name: 'Add' }).click();

  await overlay.evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLInputElement>('.details-checkbox')?.click();
  });

  await page.locator('.shell').click({ force: true });

  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.querySelector('.inspect-panel')?.textContent ?? '')).toContain('DOM Mutation Type');
});

test('waterfall panel can be toggled via sparkline', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await expect(page.locator('.card-label').first()).toContainText('Products');

  await page.getByRole('button', { name: 'Click (0)' }).click();

  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.querySelector('.sparkline-toggle') !== null)).toBe(true);
  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.querySelector('.waterfall-panel') !== null)).toBe(false);

  await overlay.evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLElement>('.sparkline-toggle')?.click();
  });

  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.querySelector('.waterfall-panel')?.textContent ?? '')).toContain('Waterfall');
});
