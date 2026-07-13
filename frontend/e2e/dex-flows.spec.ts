import { expect, type Locator, type Page, test } from "@playwright/test";

const PAIR_ADDRESS = "juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv";

type MockTx = {
  sender: string;
  contractAddress: string;
  msg: Record<string, unknown>;
  funds?: unknown;
};

async function expectConnected(page: Page) {
  await expect(page.getByRole("button", { name: "Disconnect wallet" })).toContainText("Playwright Wallet");
  await expect(page.getByText("juno-1")).toBeVisible();
}

async function txs(page: Page) {
  return page.evaluate<MockTx[]>(() => (window as Window & { __DEX_E2E_TXS__?: MockTx[] }).__DEX_E2E_TXS__ ?? []);
}

async function fillTokenAmount(field: Locator, value: string) {
  const input = field.locator("input").first();
  await input.fill(value);
  await expect(input).toHaveValue(value);
}

test.describe("Juno DEX mocked wallet E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/swap");
    await expectConnected(page);
  });

  test("quotes and submits a swap without a live wallet or broadcast", async ({ page }) => {
    await fillTokenAmount(page.getByLabel(/^You send$/), "2");

    await expect(page.getByText(/Rate/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Swap$/ })).toBeEnabled();
    await page.getByRole("button", { name: /^Swap$/ }).click();

    await expect(page.getByText("Transaction succeeded")).toBeVisible();
    await expect(page.getByText(/Swap submitted:/).first()).toBeVisible();
    await expect.poll(() => txs(page)).toHaveLength(1);
    const [swap] = await txs(page);
    expect(JSON.stringify(swap.msg)).toContain("swap");
    expect(JSON.stringify(swap.funds)).toContain("ujuno");
  });

  test("adds and removes liquidity and refreshes position UI", async ({ page }) => {
    await page.goto(`/pools/${PAIR_ADDRESS}`);
    await expectConnected(page);
    await expect(page.getByRole("heading", { name: "JUNO / Juno Agent Test" }).first()).toBeVisible();
    await expect(page.getByText(/Wallet LP balance/i).first()).toBeVisible();

    await fillTokenAmount(page.getByLabel(/JUNO amount/).first(), "1");
    await expect(page.getByText(/Expected LP tokens:/i)).toBeVisible();
    await page.getByRole("button", { name: /^Add liquidity$/ }).click();
    await expect(page.getByText(/Liquidity transaction broadcast/)).toBeVisible();

    await page.locator("#remove-liquidity").scrollIntoViewIfNeeded();
    await fillTokenAmount(page.getByLabel("LP amount"), "1");
    await expect(page.getByRole("button", { name: /^Withdraw liquidity$/ })).toBeEnabled();
    await page.getByRole("button", { name: /^Withdraw liquidity$/ }).click();
    await expect(page.getByText("Liquidity withdrawn")).toBeVisible();

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
    await page.locator("#incentives").last().scrollIntoViewIfNeeded();
    await fillTokenAmount(page.getByLabel("Stake LP"), "1");
    await page.getByRole("button", { name: /^Stake LP$/ }).click();
    await expect(page.getByText("Stake LP submitted")).toBeVisible();

    await expect(page.getByRole("button", { name: /^Claim rewards$/ })).toBeEnabled();
    await page.getByRole("button", { name: /^Claim rewards$/ }).click();
    await expect(page.getByText("Claim rewards submitted")).toBeVisible();

    const messages = (await txs(page)).map((tx) => JSON.stringify(tx.msg));
    expect(messages.some((message) => message.includes("deposit"))).toBe(true);
    expect(messages.some((message) => message.includes("claim_rewards"))).toBe(true);
  });

  test("enforces create-pool duplicate guardrails and submits a custom pool", async ({ page }) => {
    await page.goto("/create");
    await expectConnected(page);
    await expect(page.getByRole("heading", { name: "Permissionless pool" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Create pool$/ })).toBeEnabled();
    await page.getByRole("button", { name: /^Create pool$/ }).click();
    await expect(page.getByText("Transaction succeeded")).toBeVisible();
    await expect(page.getByText(/Create pool submitted/).first()).toBeVisible();

    const messages = (await txs(page)).map((tx) => JSON.stringify(tx.msg));
    expect(messages.some((message) => message.includes("create_pair"))).toBe(true);
  });
});
