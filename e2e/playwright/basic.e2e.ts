import { test, expect } from "@playwright/test";
import { HomePage } from "./helpers";

test.describe("Homepage", () => {
  test("should load homepage", async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.waitForLoad();
    
    await expect(page).toHaveTitle(/BargN|Monster/i);
  });

  test("should have working navigation", async ({ page }) => {
    await page.goto("/");
    
    const navLinks = page.locator("nav a, header a");
    const linksCount = await navLinks.count();
    expect(linksCount).toBeGreaterThan(0);
  });

  test("should have h1 heading", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
  });
});

test.describe("Requests Page", () => {
  test("should load requests page", async ({ page }) => {
    const response = await page.goto("/requests");
    expect(response?.status()).toBeLessThan(400);
  });
});

test.describe("API Health", () => {
  test("should have working API", async ({ request }) => {
    const response = await request.get("http://localhost:3000/api/feed");
    expect(response.ok()).toBeTruthy();
  });
});

test.describe("Accessibility", () => {
  test("should have valid HTML structure", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
  });

  test("should have semantic HTML", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    
    const main = page.locator("main, [role='main']");
    await expect(main.first()).toBeVisible();
  });
});
