import { test, expect, Page } from '@playwright/test';

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  const form = page.getByRole('main');
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Password').fill('password123');
  await form.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'));
}

test.describe('admin area', () => {
  // Non-admin demo user test skipped: organiser@eventplatform.com does not appear in login/page.tsx

  test('anonymous user opening /admin does not see the dashboard', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin access required' })).toBeVisible();
    await expect(
      page.getByText('You must be signed in with an administrator account to view this page.')
    ).toBeVisible();
    await expect(page.getByText('Total Users')).not.toBeVisible();
  });

  test('admin logs in, opens /admin, sees stat cards and VND revenue', async ({ page }) => {
    await loginAs(page, 'admin@eventplatform.com');
    await page.goto('/admin');
    await expect(page.getByText('Total Users')).toBeVisible();
    await expect(page.getByText('Published Events')).toBeVisible();
    await expect(page.getByText('Confirmed Bookings')).toBeVisible();
    await expect(page.getByText('30-Day Revenue')).toBeVisible();
    await expect(page.getByText(/₫/)).toBeVisible();
  });

  test('/admin/users list shows admin, filters by search, and recovers on clear', async ({ page }) => {
    await loginAs(page, 'admin@eventplatform.com');
    await page.goto('/admin/users');
    const searchInput = page.getByPlaceholder('Search users by name or email…');
    // The list is newest-first and paginated, so find the seeded admin through search.
    await searchInput.fill('admin@eventplatform');
    await expect(page.getByText('admin@eventplatform.com')).toBeVisible({ timeout: 5000 });

    await searchInput.fill('zzz-no-match');
    await expect(page.getByText('No users found')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Loading users…')).not.toBeVisible();

    await searchInput.fill('');
    await expect(page.getByRole('table', { name: 'Users list' }).locator('tbody tr').first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText('No users found')).not.toBeVisible();
  });

  test('/admin/users admin cannot change own role', async ({ page }) => {
    await loginAs(page, 'admin@eventplatform.com');
    await page.goto('/admin/users');
    await page.getByPlaceholder('Search users by name or email…').fill('admin@eventplatform');
    const adminRow = page.locator('tr', { hasText: 'admin@eventplatform.com' });
    await expect(adminRow).toBeVisible();
    await expect(adminRow.locator('select')).toBeDisabled();
  });

  test('/admin/events changes status of first event and reverts it', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await loginAs(page, 'admin@eventplatform.com');
    await page.goto('/admin/events');

    const firstRow = page.locator('table[aria-label="Events list"] tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 5000 });

    const draftBtn = firstRow.getByRole('button', { name: /draft/i });
    const publishBtn = firstRow.getByRole('button', { name: /publish/i });

    if (await draftBtn.isVisible()) {
      await draftBtn.click();
      await expect(firstRow.locator('td').nth(5)).toHaveText('DRAFT');
      await firstRow.getByRole('button', { name: /publish/i }).click();
      await expect(firstRow.locator('td').nth(5)).toHaveText('PUBLISHED');
    } else {
      await publishBtn.click();
      await expect(firstRow.locator('td').nth(5)).toHaveText('PUBLISHED');
      await firstRow.getByRole('button', { name: /draft/i }).click();
      await expect(firstRow.locator('td').nth(5)).toHaveText('DRAFT');
    }
  });

  test('glass style check on /admin verifies backdrop-filter', async ({ page }) => {
    await loginAs(page, 'admin@eventplatform.com');
    await page.goto('/admin');
    await expect(page.locator('.glass-card').first()).toBeVisible();
    // Every glass surface (navbar + cards) must really blur: guards against the CSS
    // minifier dropping the unprefixed backdrop-filter declaration.
    const filters = await page
      .locator('.glass, .glass-strong, .glass-card')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).getPropertyValue('backdrop-filter')));
    expect(filters.length).toBeGreaterThan(0);
    for (const f of filters) expect(f).toContain('blur');
  });

  test('mobile viewport has no horizontal scroll on /admin', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await loginAs(page, 'admin@eventplatform.com');
    await page.goto('/admin');
    await expect(page.getByText('Total Users')).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375 + 1);
  });
});
