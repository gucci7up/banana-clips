import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

test.describe('BANANA CLIPS AI STUDIO — End-to-End Flow', () => {
  test('Full Private Platform Journey: Admin Login -> User Management -> Video Upload -> AI Clipping -> Editor -> Export', async ({
    page,
  }) => {
    // 1. Unauthenticated access redirects to /login (no public registration button exists)
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('text=Crear cuenta')).toHaveCount(0);

    // 2. Login as initial SUPER_ADMIN
    await page.getByTestId('login-identifier').fill('admin');
    await page.getByTestId('login-password').fill('ChangeMe_BananaStudio_2026!');
    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('text=Dashboard Principal')).toBeVisible();

    // 3. Navigate to /admin/users and create a new private user
    await page.goto('/admin/users');
    await expect(page.locator('text=Panel de Usuarios')).toBeVisible();
    await page.getByTestId('btn-nuevo-usuario').click();

    const uniqueUser = `e2e_user_${Date.now()}`;
    await page.getByTestId('new-user-fullname').fill('Usuario E2E Playwright');
    await page.getByTestId('new-user-username').fill(uniqueUser);
    await page.getByTestId('new-user-password').fill('TempE2E_2026!');
    await page.getByTestId('submit-create-user').click();

    await expect(page.getByTestId(`user-row-${uniqueUser}`)).toBeVisible();

    // 4. Navigate to AI Clipping, upload fixture MP4 and generate real clips
    await page.goto('/ai-clipping');
    const fixtureVideoPath = path.resolve(__dirname, '../fixtures/banana_test_fixture.mp4');
    expect(fs.existsSync(fixtureVideoPath)).toBeTruthy();

    await page.getByTestId('ai-clipping-file-input').setInputFiles(fixtureVideoPath);
    await page.getByTestId('btn-run-ai-clipping').click();

    // Wait for clips to be generated and displayed as cards
    await expect(page.getByTestId('clip-card').first()).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('clip-download-link').first()).toBeVisible();

    // 5. Navigate to Find Moments and execute semantic vector query
    await page.goto('/find-moments');
    await page.getByTestId('find-moments-input').fill('Encuentra cuando hablan de dinero');
    await page.getByTestId('find-moments-submit').click();
    await expect(page.getByTestId('find-moment-result').first()).toBeVisible({ timeout: 15000 });

    // 6. Navigate to Video Editor, save non-destructive edit, and trigger FFmpeg MP4 export
    await page.goto('/editor');
    await page.getByTestId('editor-save-btn').click();
    await expect(page.locator('text=Guardado en PostgreSQL')).toBeVisible();

    await page.getByTestId('editor-export-btn').click();
    await expect(page.getByTestId('export-completed-banner')).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('export-download-btn')).toBeVisible();
  });
});
