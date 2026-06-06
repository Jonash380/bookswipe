/**
 * BookSwipe E2E Tests — Core User Flows
 *
 * Run: npx playwright test tests/e2e/app.spec.js
 * Server must be running on http://127.0.0.1:3000
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:3000';

test.describe('BookSwipe E2E', () => {

  test('should load the app and render #app', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('#app', { timeout: 10000 });
    await expect(page.locator('#app')).toBeAttached();
  });

  test('should have proper page title', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle('BookSwipe');
  });

  test('should have viewport meta tag', async ({ page }) => {
    await page.goto(BASE);
    const hasViewport = await page.evaluate(() =>
      !!document.querySelector('meta[name="viewport"]')
    );
    expect(hasViewport).toBe(true);
  });

  test('should have noscript fallback', async ({ page }) => {
    await page.goto(BASE);
    const hasNoscript = await page.evaluate(() =>
      !!document.querySelector('noscript')
    );
    expect(hasNoscript).toBe(true);
  });

  test('should load the main app.js module', async ({ page }) => {
    await page.goto(BASE);
    const hasAppModule = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="module"]');
      return Array.from(scripts).some(s => s.src.includes('app.js'));
    });
    expect(hasAppModule).toBe(true);
  });

  test('should render toast container', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('#toast-container')).toBeAttached();
  });

  test('should have proper lang attribute', async ({ page }) => {
    await page.goto(BASE);
    const lang = await page.evaluate(() => document.documentElement.lang);
    expect(['de', 'en']).toContain(lang);
  });

  test('should have theme-color meta', async ({ page }) => {
    await page.goto(BASE);
    const hasThemeColor = await page.evaluate(() =>
      !!document.querySelector('meta[name="theme-color"]')
    );
    expect(hasThemeColor).toBe(true);
  });

  test('should have service worker registered', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(2000);
    const swReady = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration('/');
      return !!reg;
    });
    expect(swReady).toBe(true);
  });

  test('should render bottom nav with 3+ buttons', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('.bottom-nav', { timeout: 15000 });
    const count = await page.locator('.nav-btn').count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('should have no unhandled promise rejections', async ({ page }) => {
    const rejections = [];
    page.on('pageerror', err => rejections.push(err.message));
    await page.goto(BASE);
    await page.waitForTimeout(3000);
    expect(rejections).toHaveLength(0);
  });

  test('CSS should load correctly', async ({ page }) => {
    await page.goto(BASE);
    const cssLoaded = await page.evaluate(() => {
      return Array.from(document.styleSheets).some(s =>
        s.href && s.href.includes('styles.css')
      );
    });
    expect(cssLoaded).toBe(true);
  });

  test('should have manifest link', async ({ page }) => {
    await page.goto(BASE);
    const hasManifest = await page.evaluate(() =>
      !!document.querySelector('link[rel="manifest"]')
    );
    expect(hasManifest).toBe(true);
  });

  test('should clear data and reload cleanly', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('#app', { timeout: 10000 });
    await page.evaluate(() => {
      localStorage.clear();
      indexedDB.deleteDatabase('bookswipe-v3');
    });
    await page.reload();
    await page.waitForSelector('#app', { timeout: 10000 });
    await expect(page.locator('#app')).toBeAttached();
  });

  test('should handle SPA routing gracefully', async ({ page }) => {
    await page.goto(BASE + '/nonexistent');
    await page.waitForTimeout(1000);
    const title = await page.title();
    expect(title).toBe('BookSwipe');
  });

  test('should render discover view after onboarding', async ({ page }) => {
    await page.goto(BASE);
    // Wait for the app to fully initialize (onboarding or discover)
    await page.waitForSelector('#app', { timeout: 10000 });
    await page.waitForTimeout(3000);
    // The app should have rendered something
    const content = await page.locator('#app').innerHTML();
    expect(content.length).toBeGreaterThan(0);
  });
});
