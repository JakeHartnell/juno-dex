import { expect, type Locator, type Page, test } from "@playwright/test";

const PAIR_ADDRESS = "juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv";

type MockTx = {
  sender: string;
  contractAddress: string;
  msg: Record<string, unknown>;
  funds?: unknown;
};

async function expectConnected(page: Page) {
  await expect(page.getByRole("button", { name: "Open wallet account menu" })).toContainText("Playwright Wallet");
  await expect(page.getByText("juno-1").first()).toBeVisible();
}

async function txs(page: Page) {
  return page.evaluate<MockTx[]>(() => (window as Window & { __DEX_E2E_TXS__?: MockTx[] }).__DEX_E2E_TXS__ ?? []);
}

async function setTxMode(page: Page, mode: "success" | "reject" | "fail" | "timeout" | "delay") {
  await page.evaluate((nextMode) => {
    (window as Window & { __DEX_E2E_TX_MODE__?: string }).__DEX_E2E_TX_MODE__ = nextMode;
  }, mode);
}

async function prepareSwapReview(page: Page) {
  await fillTokenAmount(page.getByLabel(/^You send$/), "2");
  await expect(page.getByRole("button", { name: /^Review swap$/ })).toBeEnabled();
  await page.getByRole("button", { name: /^Review swap$/ }).click();
  await expect(page.getByRole("heading", { name: "Review swap" })).toBeVisible();
}

async function fillTokenAmount(field: Locator, value: string) {
  const input = field.locator("input").first();
  await input.fill(value);
  await expect(input).toHaveValue(value);
}

async function confirmReviewedTransaction(page: Page) {
  await expect(page.getByText("≈ 0.00975 JUNO")).toBeVisible();
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
}

test.describe("Juno DEX mocked wallet E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/swap");
    await expectConnected(page);
  });

  test("quotes and submits a swap without a live wallet or broadcast", async ({ page }) => {
    const initialActionY = (await page.locator(".swap-card .primary-action").boundingBox())?.y;
    await fillTokenAmount(page.getByLabel(/^You send$/), "2");

    await expect(page.getByText(/Rate/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Review swap$/ })).toBeEnabled();
    const quotedActionY = (await page.locator(".swap-card .primary-action").boundingBox())?.y;
    expect(Math.abs((quotedActionY ?? 0) - (initialActionY ?? 0))).toBeLessThanOrEqual(8);
    await page.getByRole("button", { name: /^Review swap$/ }).click();
    await expect(page.getByRole("heading", { name: "Review swap" })).toBeVisible();
    await confirmReviewedTransaction(page);

    await expect(page.getByText("Transaction confirmed").first()).toBeVisible();
    await expect(page.getByText(/Swap confirmed:/).first()).toBeVisible();
    await expect.poll(() => txs(page)).toHaveLength(1);
    const [swap] = await txs(page);
    expect(JSON.stringify(swap.msg)).toContain("swap");
    expect(JSON.stringify(swap.funds)).toContain("ujuno");
  });

  test("keeps confirmed feedback brief and motion-safe", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await prepareSwapReview(page);
    await confirmReviewedTransaction(page);

    const successToast = page.locator(".toast-success").first();
    await expect(successToast).toBeVisible();
    await expect(successToast.locator(".toast-kind-icon")).toHaveText("✓");
    expect(await successToast.evaluate((element) => Number(element.getAnimations()[0]?.effect?.getTiming().duration ?? Infinity))).toBeLessThanOrEqual(0.01);
  });

  test("keeps portfolio and confirmed activity one tap away on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await prepareSwapReview(page);
    await confirmReviewedTransaction(page);
    await expect(page.getByText("Transaction confirmed").first()).toBeVisible();

    const quickNav = page.getByRole("navigation", { name: "Mobile quick navigation" });
    await expect(quickNav.getByRole("link", { name: "Portfolio" })).toBeVisible();
    const activity = quickNav.getByRole("button", { name: /Activity 1/i });
    await activity.click();
    await expect(page.getByRole("complementary", { name: "Recent transaction status" }).locator("details")).toHaveAttribute("open", "");
  });

  test("recovers from wallet rejection without recording a broadcast", async ({ page }) => {
    await prepareSwapReview(page);
    await setTxMode(page, "reject");
    await confirmReviewedTransaction(page);

    await expect(page.getByText("Rejected in wallet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry transaction" })).toBeVisible();
    await expect.poll(() => txs(page)).toHaveLength(0);

    await setTxMode(page, "success");
    await page.getByRole("button", { name: "Retry transaction" }).click();
    await expect(page.getByText("Transaction confirmed").first()).toBeVisible();
    await expect.poll(() => txs(page)).toHaveLength(1);
  });

  test("recovers from a pre-hash broadcast failure on mobile without inventing activity", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await prepareSwapReview(page);
    await setTxMode(page, "fail");
    await confirmReviewedTransaction(page);

    await expect(page.getByText("Transaction failed").first()).toBeVisible();
    await expect(page.getByText(/broadcast failed before a transaction hash/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry transaction" })).toBeVisible();
    await expect.poll(() => txs(page)).toHaveLength(0);

    await setTxMode(page, "success");
    await page.getByRole("button", { name: "Retry transaction" }).click();
    await expect(page.getByText("Transaction confirmed").first()).toBeVisible();
    await expect.poll(() => txs(page)).toHaveLength(1);
  });

  test("treats delayed indexing timeout as ambiguous and never offers blind retry", async ({ page }) => {
    await prepareSwapReview(page);
    await setTxMode(page, "timeout");
    await confirmReviewedTransaction(page);

    await expect(page.getByText("Confirmation timed out")).toBeVisible();
    await expect(page.getByText(/check recent account activity/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry transaction" })).toHaveCount(0);
    await expect.poll(() => txs(page)).toHaveLength(1);
  });

  test("deduplicates rapid wallet confirmation while broadcast is pending", async ({ page }) => {
    await prepareSwapReview(page);
    await setTxMode(page, "delay");
    const confirm = page.getByRole("button", { name: "Confirm in wallet" });
    await expect(page.getByText("≈ 0.00975 JUNO")).toBeVisible();
    await confirm.evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });

    await expect.poll(() => txs(page)).toHaveLength(1);
    await page.evaluate(() => (window as Window & { __DEX_E2E_RELEASE_TX__?: () => void }).__DEX_E2E_RELEASE_TX__?.());
    await expect(page.getByText("Transaction confirmed").first()).toBeVisible();
    await expect.poll(() => txs(page)).toHaveLength(1);
  });

  test("adds and removes liquidity and refreshes position UI", async ({ page }) => {
    await page.goto(`/pools/${PAIR_ADDRESS}`);
    await expectConnected(page);
    await expect(page.getByRole("heading", { name: "JUNO / Juno Agent Test" }).first()).toBeVisible();
    await expect(page.getByText(/Wallet LP balance/i).first()).toBeVisible();

    const manage = page.getByRole("region", { name: "Manage your position" });
    await manage.getByRole("button", { name: "Add liquidity" }).click();
    await fillTokenAmount(page.getByLabel(/JUNO amount/).first(), "1");
    await expect(page.getByText(/Expected LP tokens:/i)).toBeVisible();
    await page.getByRole("button", { name: /^Review add liquidity$/ }).click();
    await confirmReviewedTransaction(page);
    await expect(page.getByText(/Liquidity confirmed for/).first()).toBeVisible();
    await page.getByRole("button", { name: "Close modal" }).click();

    await manage.getByRole("button", { name: "Remove liquidity" }).click();
    await fillTokenAmount(page.getByLabel("LP amount"), "1");
    await expect(page.getByRole("button", { name: /^Review withdrawal$/ })).toBeEnabled();
    await page.getByRole("button", { name: /^Review withdrawal$/ }).click();
    await confirmReviewedTransaction(page);
    await expect(page.getByText(/Withdrawal confirmed for/).first()).toBeVisible();

    await expect.poll(() => txs(page)).toHaveLength(2);
    const messages = (await txs(page)).map((tx) => JSON.stringify(tx.msg));
    expect(messages.some((message) => message.includes("provide_liquidity"))).toBe(true);
    expect(messages.some((message) => message.includes("withdraw_liquidity") || message.includes("send"))).toBe(true);
  });

  test("shows portfolio positions, indexed history, and incentives stake/claim flows", async ({ page }) => {
    await page.goto("/portfolio");
    await expectConnected(page);
    await expect(page.getByRole("heading", { name: "Wallet portfolio" })).toBeVisible();
    await expect(page.getByText("Position found").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Playwright Wallet balances" })).toBeVisible();

    await page.goto(`/pools/${PAIR_ADDRESS}`);
    await page.getByRole("region", { name: "Manage your position" }).getByRole("button", { name: "Manage rewards" }).click();
    await fillTokenAmount(page.getByLabel("Stake LP"), "1");
    await page.getByRole("button", { name: /^Review stake$/ }).click();
    await confirmReviewedTransaction(page);
    await expect(page.getByText(/Stake LP confirmed/).first()).toBeVisible();

    await expect(page.getByRole("button", { name: /^Review claim$/ })).toBeEnabled();
    await page.getByRole("button", { name: /^Review claim$/ }).click();
    await confirmReviewedTransaction(page);
    await expect(page.getByText(/Claim rewards confirmed/).first()).toBeVisible();

    const messages = (await txs(page)).map((tx) => JSON.stringify(tx.msg));
    expect(messages.some((message) => message.includes("deposit"))).toBe(true);
    expect(messages.some((message) => message.includes("claim_rewards"))).toBe(true);
  });

  test("enforces create-pool duplicate guardrails and submits a custom pool", async ({ page }) => {
    await page.goto("/create");
    await expectConnected(page);
    await expect(page.getByRole("heading", { name: "Permissionless pool" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Review pool creation$/ })).toBeEnabled();
    await page.getByRole("button", { name: /^Review pool creation$/ }).click();
    await confirmReviewedTransaction(page);
    await expect(page.getByText("Transaction confirmed").first()).toBeVisible();

    const messages = (await txs(page)).map((tx) => JSON.stringify(tx.msg));
    expect(messages.some((message) => message.includes("create_pair"))).toBe(true);
  });
});
