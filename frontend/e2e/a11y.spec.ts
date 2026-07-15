import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

async function expectNoSeriousOrCriticalAxeViolations(pageUrl: string, page: Page) {
  await page.goto(pageUrl);
  await expect(page.getByRole("banner")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  const blocking = results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

async function expectCurrentPageAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test.describe("accessibility smoke checks", () => {
  test("has no serious or critical WCAG 2.2 axe violations on core routes", async ({ page }) => {
    test.setTimeout(60_000);
    for (const route of ["/swap", "/pools", "/portfolio", "/create"]) {
      await expectNoSeriousOrCriticalAxeViolations(route, page);
    }
  });

  test("has no critical axe violations in the token selector dialog", async ({ page }) => {
    await page.goto("/swap");
    await page.getByRole("button", { name: /from asset:/i }).click();
    await expect(page.getByRole("dialog", { name: /select from asset token/i })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include("[role='dialog']")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    const blocking = results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test("keeps transaction review, rejection, and confirmation states axe-clean", async ({ page }) => {
    await page.goto("/swap");
    await page.getByLabel(/^You send$/).locator("input").fill("2");
    await page.getByRole("button", { name: /^Review swap$/ }).click();
    await expect(page.getByRole("heading", { name: "Review swap" })).toBeVisible();
    await expectCurrentPageAxeClean(page);

    await page.evaluate(() => { (window as Window & { __DEX_E2E_TX_MODE__?: string }).__DEX_E2E_TX_MODE__ = "reject"; });
    await page.getByRole("button", { name: "Confirm in wallet" }).click();
    await expect(page.getByText("Rejected in wallet")).toBeVisible();
    await expectCurrentPageAxeClean(page);

    await page.evaluate(() => { (window as Window & { __DEX_E2E_TX_MODE__?: string }).__DEX_E2E_TX_MODE__ = "success"; });
    await page.getByRole("button", { name: "Retry transaction" }).click();
    await expect(page.getByText("Transaction confirmed").first()).toBeVisible();
    await expectCurrentPageAxeClean(page);
  });

  test("renders informative text at 12 CSS pixels or larger across core routes", async ({ page }) => {
    for (const route of ["/swap", "/pools", "/portfolio", "/create"]) {
      await page.goto(route);
      const undersized = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("body *")).flatMap((element) => {
        const visible = element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
        const hasDirectText = Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
        if (!visible || !hasDirectText) return [];
        const size = Number.parseFloat(getComputedStyle(element).fontSize);
        return size < 12 ? [{ tag: element.tagName, className: element.className, text: element.textContent?.trim().slice(0, 80), size }] : [];
      }));
      expect(undersized, `${route}: ${JSON.stringify(undersized, null, 2)}`).toEqual([]);
    }
  });

  test("supports keyboard skip navigation and dialog focus return", async ({ page }) => {
    await page.goto("/swap");
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeFocused();
    await page.evaluate(() => {
      document.body.tabIndex = -1;
      document.body.focus();
    });
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();

    const tokenTrigger = page.getByRole("button", { name: /from asset:/i });
    await tokenTrigger.click();
    await expect(page.getByRole("textbox", { name: "Search tokens" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(tokenTrigger).toBeFocused();

    const settingsTrigger = page.getByRole("button", { name: /slippage/i });
    await settingsTrigger.click();
    await expect(page.getByRole("dialog", { name: /dex settings/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(settingsTrigger).toBeFocused();
  });

  test("reflows at the 320 CSS-pixel (400% desktop zoom equivalent) viewport with usable touch targets", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/swap");
    await expect(page.getByRole("banner")).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

    for (const control of [
      page.getByRole("button", { name: "Open navigation" }),
      page.getByRole("button", { name: "Open wallet account menu" }),
      page.getByRole("button", { name: /enter amount/i }),
    ]) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    const header = page.getByRole("banner");
    const headerBox = await header.boundingBox();
    expect(headerBox?.height ?? Infinity).toBeLessThanOrEqual(72);
    await expect(page.locator(".app-topbar")).toBeHidden();
    const quickNav = page.getByRole("navigation", { name: "Mobile quick navigation" });
    await expect(quickNav).toBeVisible();
    await expect(quickNav.getByRole("link", { name: "Swap" })).toBeVisible();
    await expect(quickNav.getByRole("link", { name: "Portfolio" })).toBeVisible();
  });
});
