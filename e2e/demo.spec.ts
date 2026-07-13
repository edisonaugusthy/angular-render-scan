import { expect, test } from '@playwright/test';

const overlaySelector = 'angular-render-scan-overlay';

test('compact toolbar appears and toggles scanner state', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Generate useful evidence' })).toBeVisible();

  await expect.poll(() => overlay.evaluate((host) => host.shadowRoot?.querySelector('.power-label')?.textContent)).toBe('On');
  await overlay.evaluate((host) => host.shadowRoot?.querySelector<HTMLInputElement>('input')?.click());
  await expect.poll(() => overlay.evaluate((host) => host.shadowRoot?.querySelector('.power-label')?.textContent)).toBe('Off');
  await overlay.evaluate((host) => host.shadowRoot?.querySelector<HTMLInputElement>('input')?.click());
  await expect.poll(() => overlay.evaluate((host) => host.shadowRoot?.querySelector('.power-label')?.textContent)).toBe('On');
});

test('capture ranks an interaction and compares the next run with its baseline', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  page.on('dialog', (dialog) => dialog.accept('Add product to cart'));

  await overlay.evaluate((host) => host.shadowRoot?.querySelector<HTMLButtonElement>('.interaction-capture-btn')?.click());
  await expect.poll(() => overlay.evaluate((host) => host.shadowRoot?.querySelector('.interaction-capture-btn')?.textContent)).toBe('Finish');
  await page.getByRole('button', { name: /Increment signal/ }).click();
  await overlay.evaluate((host) => host.shadowRoot?.querySelector<HTMLButtonElement>('.interaction-capture-btn')?.click());

  await expect.poll(() => overlay.evaluate((host) => host.shadowRoot?.querySelector('.diagnosis-panel')?.textContent ?? '')).toContain('Add product to cart');
  await expect.poll(() => overlay.evaluate((host) => host.shadowRoot?.querySelector('.diagnosis-panel')?.textContent ?? '')).toMatch(/Next:|No actionable finding/);
  await overlay.evaluate((host) => host.shadowRoot?.querySelector<HTMLButtonElement>('.diagnosis-baseline-btn')?.click());

  await overlay.evaluate((host) => host.shadowRoot?.querySelector<HTMLButtonElement>('.interaction-capture-btn')?.click());
  await page.getByRole('button', { name: /Update profile/ }).click();
  await overlay.evaluate((host) => host.shadowRoot?.querySelector<HTMLButtonElement>('.interaction-capture-btn')?.click());
  await expect.poll(() => overlay.evaluate((host) => host.shadowRoot?.querySelector('.diagnosis-panel')?.textContent ?? '')).toMatch(/Candidate (improved|unchanged|regressed)/i);
});

test('details mode shows evidence on hover without blocking the app', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator(overlaySelector);
  await expect(overlay).toBeAttached();
  await page.getByRole('button', { name: /Run 18 ms calculation/ }).click();
  await overlay.evaluate((host) => host.shadowRoot?.querySelector<HTMLButtonElement>('.toolbar-picker-toggle')?.click());
  await page.locator('demo-expensive-result').hover({ force: true });
  await expect.poll(() => overlay.evaluate((host) => host.shadowRoot?.querySelector('.inspect-panel')?.textContent ?? '')).toContain('ExpensiveResult');
});

test('global API returns portable interaction reports', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const scan = (window as any).AngularRenderScan;
    scan.beginInteraction('Counter click');
    document.querySelector<HTMLButtonElement>('.scenario button')?.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const report = scan.endInteraction();
    return { report, markdown: scan.formatInteractionReportMarkdown(report), html: scan.formatInteractionReportHtml(report) };
  });
  expect(result.report.schemaVersion).toBe(1);
  expect(result.report.name).toBe('Counter click');
  expect(result.markdown).toContain('# Angular Render Scan: Counter click');
  expect(result.html).toContain('<!doctype html>');
});

test('cart updates emit component render events', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => page.evaluate(() => new Promise<string>((resolve) => {
    const timeout = window.setTimeout(() => resolve(''), 700);
    const onRender = (event: Event) => {
      const name = (event as CustomEvent<{ name: string }>).detail.name;
      if (['PreviewCard', 'ExpensiveResult'].includes(name)) {
        clearTimeout(timeout);
        window.removeEventListener('angular-render-scan:render', onRender);
        resolve(name);
      }
    };
    window.addEventListener('angular-render-scan:render', onRender);
    document.querySelector<HTMLButtonElement>('.scenario button')?.click();
  }))).not.toBe('');
});
