import { useMemo, useState } from "react";
import { Box, Button, Stack, Text } from "@interchain-ui/react";
import type { RegistryPool } from "../../config/registry";
import { displayBaseAmount, calculateProvideLiquidityQuote, formatLpShareBps, ratioAmount } from "../../lib/liquidity/provide";
import { formatAmount, isBaseAmountGreaterThan, parseTokenAmount, toBaseAmount } from "../../lib/format/amounts";
import { slippageBpsToMaxSpread } from "../../lib/swap/slippage";
import { useProvideLiquidityTx } from "../../mutations/useProvideLiquidityTx";
import { usePoolReserves } from "../../queries/usePools";
import { getWalletBalanceAmount, useWalletBalances } from "../../queries/useWalletBalances";
import { useSlippageSettings } from "../../settings/SlippageSettingsContext";
import { useNetworkGuard, useWallet } from "../../wallet/WalletContext";
import { TokenAmountInput } from "../common";

function hasPositiveBaseAmount(amount: string): boolean {
  return /^\d+$/.test(amount) && BigInt(amount) > 0n;
}

function applySlippageFloor(amount: string, slippageBps: number): string {
  if (!/^\d+$/.test(amount)) return "0";
  return ((BigInt(amount) * BigInt(10_000 - slippageBps)) / 10_000n).toString();
}

export function AddLiquidityForm({ pool }: { pool: RegistryPool }) {
  const { wallet, connect } = useWallet();
  const { network, switchToJuno } = useNetworkGuard();
  const { slippageBps, formattedSlippagePercent, maxSpread } = useSlippageSettings();
  const [amounts, setAmounts] = useState<[string, string]>(["", ""]);
  const [lastEditedIndex, setLastEditedIndex] = useState<0 | 1>(0);
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const balances = useWalletBalances(walletAddress, [pool]);
  const reserves = usePoolReserves(pool);
  const provideTx = useProvideLiquidityTx(wallet.status === "connected" ? wallet.getSigningCosmWasmClient : undefined, walletAddress);

  const reserveAmounts = useMemo<[string, string] | undefined>(() => {
    const poolAssets = reserves.data?.assets;
    if (!poolAssets || poolAssets.length < 2) return undefined;
    return [poolAssets[0]?.amount ?? "0", poolAssets[1]?.amount ?? "0"];
  }, [reserves.data?.assets]);

  const baseAmounts = useMemo<[string, string]>(() => [
    toBaseAmount(amounts[0], pool.assets[0].decimals),
    toBaseAmount(amounts[1], pool.assets[1].decimals),
  ], [amounts, pool.assets]);

  const quote = reserveAmounts
    ? calculateProvideLiquidityQuote({ depositAmounts: baseAmounts, reserves: reserveAmounts, totalShare: reserves.data?.total_share ?? "0" })
    : null;
  const minLpToReceive = quote ? applySlippageFloor(quote.expectedLpAmount, slippageBps) : undefined;

  const updateAmount = (index: 0 | 1, nextAmount: string) => {
    setLastEditedIndex(index);
    const nextBase = toBaseAmount(nextAmount, pool.assets[index].decimals);
    setAmounts((current) => {
      const updated: [string, string] = [...current] as [string, string];
      updated[index] = nextAmount;
      const otherIndex = index === 0 ? 1 : 0;
      if (reserveAmounts && hasPositiveBaseAmount(nextBase)) {
        const otherBase = ratioAmount(nextBase, reserveAmounts[index], reserveAmounts[otherIndex]);
        updated[otherIndex] = otherBase === "0" ? "" : displayBaseAmount(otherBase, pool.assets[otherIndex].decimals);
      } else if (!hasPositiveBaseAmount(nextBase)) {
        updated[otherIndex] = "";
      }
      return updated;
    });
  };

  const validationError = useMemo(() => {
    const parsed0 = parseTokenAmount(amounts[0], pool.assets[0].decimals);
    const parsed1 = parseTokenAmount(amounts[1], pool.assets[1].decimals);
    if (!parsed0.isValid) return `${pool.assets[0].symbol}: ${parsed0.error}`;
    if (!parsed1.isValid) return `${pool.assets[1].symbol}: ${parsed1.error}`;
    if (!hasPositiveBaseAmount(baseAmounts[0]) || !hasPositiveBaseAmount(baseAmounts[1])) return "Enter both token amounts";
    const balance0 = getWalletBalanceAmount(balances.data, pool.assets[0].id);
    const balance1 = getWalletBalanceAmount(balances.data, pool.assets[1].id);
    if (balance0 && isBaseAmountGreaterThan(baseAmounts[0], balance0)) return `${pool.assets[0].symbol} amount exceeds wallet balance`;
    if (balance1 && isBaseAmountGreaterThan(baseAmounts[1], balance1)) return `${pool.assets[1].symbol} amount exceeds wallet balance`;
    if (!reserveAmounts) return "Pool reserves are still loading";
    if (!quote) return "Pool share estimate unavailable";
    if (!quote.isProportional) return "Amounts must match the current pool ratio";
    return undefined;
  }, [amounts, balances.data, baseAmounts, pool.assets, quote, reserveAmounts]);

  const submitDisabled = Boolean(validationError)
    || wallet.status !== "connected"
    || network.isWrongNetwork
    || provideTx.isPending;
  const actionCopy = network.isWrongNetwork
    ? "Switch to Juno to add liquidity"
    : wallet.status !== "connected"
      ? "Connect wallet to add liquidity"
      : validationError ?? (provideTx.isPending ? "Broadcasting…" : "Add liquidity");

  const onSubmit = async () => {
    if (wallet.status !== "connected") {
      await connect();
      return;
    }
    if (network.isWrongNetwork) {
      await switchToJuno();
      return;
    }
    if (submitDisabled) return;
    provideTx.mutate({ pool, amounts: baseAmounts, slippageTolerance: maxSpread || slippageBpsToMaxSpread(slippageBps), minLpToReceive });
  };

  return (
    <Stack as="section" className="action-card" direction="vertical" space="5">
      <Stack direction="horizontal" justify="space-between" align="center" flexWrap="wrap">
        <Box>
          <Text as="h3">Add liquidity</Text>
          <Text as="p">Two-sided deposits are balanced to the live pool ratio. Single-sided add liquidity is not enabled for this pair yet.</Text>
        </Box>
        <Button variant="outlined" intent="secondary" size="sm" className="slippage-pill" domAttributes={{ type: "button", title: `provide_liquidity slippage_tolerance ${maxSpread}` }}>Slippage {formattedSlippagePercent}%</Button>
      </Stack>

      {pool.assets.map((asset, index) => (
        <TokenAmountInput
          key={asset.id}
          label={index === lastEditedIndex ? `${asset.symbol} amount · driving ratio` : `${asset.symbol} amount · auto-balanced`}
          value={amounts[index]}
          decimals={asset.decimals}
          symbol={asset.symbol}
          balanceBaseAmount={getWalletBalanceAmount(balances.data, asset.id)}
          onChange={(nextAmount) => updateAmount(index as 0 | 1, nextAmount)}
          onMax={() => undefined}
          onHalf={() => undefined}
          disabled={provideTx.isPending}
          fiatHint={<span>Reserve: {reserveAmounts ? `${formatAmount(reserveAmounts[index], asset.decimals)} ${asset.symbol}` : "loading…"}</span>}
        />
      ))}

      <Box className="quote-card">
        <Text as="p"><strong>Expected LP tokens:</strong> {quote ? formatAmount(quote.expectedLpAmount, 6) : "—"}</Text>
        <Text as="p"><strong>Estimated pool share:</strong> {quote ? formatLpShareBps(quote.poolShareBps) : "—"}</Text>
        <Text as="p"><strong>Ratio impact:</strong> {quote ? `${formatLpShareBps(quote.imbalanceBps)} off pool ratio` : "—"}</Text>
        <Text as="p"><strong>Minimum LP after slippage:</strong> {minLpToReceive ? formatAmount(minLpToReceive, 6) : "—"}</Text>
      </Box>

      <Box className="empty-state compact">
        <strong>Single-sided deposits unavailable</strong>
        <p>This pool currently exposes proportional provide liquidity only in the app. Enter either side and the other side will be calculated from current reserves.</p>
      </Box>

      {network.isWrongNetwork ? <Text as="p" className="error-text">Transactions are blocked while your wallet is off Juno mainnet.</Text> : null}
      {validationError && wallet.status === "connected" && !network.isWrongNetwork ? <Text as="p" className="error-text">{validationError}</Text> : null}
      {provideTx.isError ? <Text as="p" className="error-text">{provideTx.error instanceof Error ? provideTx.error.message : "Add liquidity failed"}</Text> : null}
      {provideTx.isSuccess ? <Text as="p" className="success-text">Liquidity transaction broadcast. Balances and pool reserves are refreshing.</Text> : null}

      <Button intent="primary" className="primary-action" disabled={wallet.status === "connected" && submitDisabled} fluidWidth onClick={onSubmit} domAttributes={{ type: "button" }}>{actionCopy}</Button>
    </Stack>
  );
}
