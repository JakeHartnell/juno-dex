import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

async function expectNoCriticalAxeViolations(pageUrl: string, page: Page) {
  await page.goto(pageUrl);
  await expect(page.getByRole("banner")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const critical = results.violations.filter((violation) => violation.impact === "critical");
  expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
}

test.describe("accessibility smoke checks", () => {
  test("has no critical axe violations on core routes", async ({ page }) => {
    for (const route of ["/swap", "/pools", "/portfolio", "/create", "/stats"]) {
      await expectNoCriticalAxeViolations(route, page);
    }
  });

  test("has no critical axe violations in the token selector dialog", async ({ page }) => {
    await page.goto("/swap");
    await page.getByRole("button", { name: /from asset:/i }).click();
    await expect(page.getByRole("dialog", { name: /select from asset token/i })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include("[role='dialog']")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const critical = results.violations.filter((violation) => violation.impact === "critical");
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});
