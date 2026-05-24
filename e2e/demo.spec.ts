import { expect, test } from '@playwright/test';

test('toolbar appears and toggle controls scanner state', async ({ page }) => {
  await page.goto('/');

  const overlay = page.locator('angular-scan-overlay');
  await expect(overlay).toBeAttached();
  await expect(page.locator('text=Angular Scan')).toBeVisible();

  await page.getByRole('button', { name: 'Increment counter' }).click();
  await expect.poll(async () => page.locator('angular-scan-overlay').evaluate((host) => {
    const toolbar = host.shadowRoot?.textContent ?? '';
    return toolbar.includes('CounterComponent') || toolbar.includes('Count');
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

test('slow component can become the slowest latest entry', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Run expensive update' }).click();

  await expect.poll(async () => page.locator('angular-scan-overlay').evaluate((host) => {
    return host.shadowRoot?.textContent ?? '';
  })).toContain('SlowComponent');
});

test('nested updates create fresh cycle values and nested component entries', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Shuffle children' }).click();

  await expect.poll(async () => page.locator('angular-scan-overlay').evaluate((host) => {
    return host.shadowRoot?.textContent ?? '';
  })).toContain('Count');

  await expect.poll(async () => page.evaluate(() => {
    return new Promise<string>((resolve) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener('angular-scan:render', onRender);
        resolve('');
      }, 500);
      const onRender = (event: Event) => {
        const detail = (event as CustomEvent<{ name: string }>).detail;
        if (detail.name === 'NestedItemComponent') {
          window.clearTimeout(timeout);
          window.removeEventListener('angular-scan:render', onRender);
          resolve(detail.name);
        }
      };
      window.addEventListener('angular-scan:render', onRender);
      document.querySelector<HTMLButtonElement>('app-nested-child button')?.click();
    });
  })).toBe('NestedItemComponent');
});

test('only visibly updated components are reported for a focused update', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Refresh OnPush state' }).click();

  await expect.poll(async () => page.locator('angular-scan-overlay').evaluate((host) => {
    return (host.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ');
  })).toContain('SlowestOnPushComponent');

  await expect.poll(async () => page.locator('angular-scan-overlay').evaluate((host) => {
    return (host.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ');
  })).toContain('Count1');
});
