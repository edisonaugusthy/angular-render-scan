import { expect, test } from '@playwright/test';

const overlaySelector = 'angular-render-scan-overlay';

async function expandToolbar(page: import('@playwright/test').Page) {
  const overlay = page.locator(overlaySelector);
  await overlay.evaluate((host) => {
    const root = host.shadowRoot;
    if (root?.querySelector('.toolbar.compact')) {
      root.querySelector<HTMLButtonElement>('.toolbar-size-toggle')?.click();
    }
  });
  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.toolbar')?.classList.contains('expanded') ?? false;
  })).toBe(true);
}

test('toolbar appears and toggle controls scanner state', async ({ page }) => {
  await page.goto('/');

  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await expect(page.locator('.card-label').first()).toContainText('Products');
  const angularVersion = await page.locator('[ng-version]').first().getAttribute('ng-version');
  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.angular-version-chip')?.textContent?.trim() ?? '';
  })).toBe(angularVersion ? `ng ${angularVersion}` : '');

  await page.locator('app-product').filter({ hasText: 'Developer Mug' }).getByRole('button', { name: 'Add' }).click();
  await expandToolbar(page);
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

test('toolbar size toggle persists across refresh', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.removeItem('angular-render-scan:toolbar-compact');
  });
  await page.reload();

  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.toolbar')?.classList.contains('compact') ?? false;
  })).toBe(true);

  await overlay.evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLButtonElement>('.toolbar-size-toggle')?.click();
  });
  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.toolbar')?.classList.contains('expanded') ?? false;
  })).toBe(true);

  await page.reload();
  await expect(overlay).toBeAttached();
  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.toolbar')?.classList.contains('expanded') ?? false;
  })).toBe(true);

  await overlay.evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLButtonElement>('.toolbar-size-toggle')?.click();
  });
  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.toolbar')?.classList.contains('compact') ?? false;
  })).toBe(true);

  await page.reload();
  await expect(overlay).toBeAttached();
  await expect.poll(async () => overlay.evaluate((host) => {
    return host.shadowRoot?.querySelector('.toolbar')?.classList.contains('compact') ?? false;
  })).toBe(true);
});

test('slow recommendations component can be inspected from details mode', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await expect(page.locator('.card-label').first()).toContainText('Products');
  await expandToolbar(page);

  // Activate OnPush tab so app-slow is rendered
  await page.getByRole('button', { name: '🚀 OnPush' }).click();
  await page.getByRole('button', { name: 'Refresh candidates' }).click();
  await expect(page.locator('app-slow')).toBeVisible();

  await overlay.evaluate((host) => {
    host.shadowRoot?.querySelector<HTMLButtonElement>('.toolbar-picker-toggle')?.click();
  });
  await page.locator('app-slow').hover({ force: true });
  await expect.poll(async () => page.evaluate(() => {
    const overlay = document.querySelector('angular-render-scan-overlay');
    const text = overlay?.shadowRoot?.querySelector('.inspect-panel')?.textContent ?? '';
    return text.includes('ExpensiveRecommendation') || text.includes('SlowComponent');
  })).toBe(true);
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
  await expandToolbar(page);

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
  await expandToolbar(page);

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

test('details mode shows hover-positioned recommendation panel without manual actions', async ({ page }) => {
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
    const root = host.shadowRoot;
    return {
      copy: root?.querySelector('.panel-copy-btn') !== null,
      close: root?.querySelector('.panel-close') !== null
    };
  })).toEqual({ copy: false, close: false });
  const distance = await overlay.evaluate(() => {
    const host = document.querySelector('angular-render-scan-overlay');
    const panel = host?.shadowRoot?.querySelector('.inspect-panel');
    const target = document.querySelector('app-slow');
    const panelRect = panel?.getBoundingClientRect();
    const targetRect = target?.getBoundingClientRect();
    if (!panelRect || !targetRect) return Number.POSITIVE_INFINITY;
    const dx = Math.max(targetRect.left - panelRect.right, panelRect.left - targetRect.right, 0);
    const dy = Math.max(targetRect.top - panelRect.bottom, panelRect.top - targetRect.bottom, 0);
    return Math.hypot(dx, dy);
  });
  expect(distance).toBeLessThan(180);
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
    host.shadowRoot?.querySelector<HTMLButtonElement>('.toolbar-picker-toggle')?.click();
  });

  await page.locator('app-product').first().hover({ force: true });

  await expect.poll(async () => overlay.evaluate((host) => host.shadowRoot?.querySelector('.inspect-panel')?.textContent ?? '')).toContain('DOM');
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
