import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { Box, Button, Stack, Text } from "@interchain-ui/react";
import type { RegistryAsset } from "../../config/registry";
import { dexRegistry } from "../../config/registry";
import { toAssetInfo } from "../../lib/astroport/assetInfo";
import { queryFactoryConfig, queryFactoryPair } from "../../lib/astroport/queries";
import { buildCreatePoolAssets, createPoolOptions, makeCustomAsset, poolMatchesAssets, validateCreatePool, type CreatePoolType } from "../../lib/createPool";
import { useCreatePoolTx } from "../../mutations/useCreatePoolTx";
import { useDexRegistry } from "../../queries/useDexRegistry";
import { useNetworkGuard, useWallet } from "../../wallet/WalletContext";
import { RiskAcknowledgement, RiskBadgeList, TokenLogo } from "../common";
import { TxStatusDialog } from "../tx/TxStatusDialog";
import { TokenSelect } from "../swap/TokenSelect";

type SigningClientGetter = () => Promise<SigningCosmWasmClient>;

type CustomAssetDraft = {
  enabled: boolean;
  side: "a" | "b";
  kind: RegistryAsset["kind"];
  id: string;
  symbol: string;
  decimals: number;
};

const defaultDraft: CustomAssetDraft = { enabled: false, side: "b", kind: "native", id: "", symbol: "", decimals: 6 };

function feeLabel(feeBps?: number) {
  return typeof feeBps === "number" ? `${(feeBps / 100).toFixed(2)}% total fee` : "Factory default fee";
}

export function CreatePoolPage() {
  const navigate = useNavigate();
  const { pools } = useDexRegistry();
  const { wallet } = useWallet();
  const { network } = useNetworkGuard();
  const [poolType, setPoolType] = useState<CreatePoolType>("xyk");
  const [assetAId, setAssetAId] = useState("ujuno");
  const [assetBId, setAssetBId] = useState("");
  const [draft, setDraft] = useState<CustomAssetDraft>(defaultDraft);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const configQuery = useQuery({ queryKey: ["factory-config", dexRegistry.factory], queryFn: queryFactoryConfig, staleTime: 5 * 60_000, retry: 2 });
  const options = useMemo(() => createPoolOptions(configQuery.data?.pair_configs), [configQuery.data?.pair_configs]);
  const selectedOption = options.find((option) => option.id === poolType) ?? options[0];
  const baseAssets = useMemo(() => buildCreatePoolAssets(pools), [pools]);
  const customAsset = useMemo(() => {
    if (!draft.enabled || !draft.id.trim()) return undefined;
    return makeCustomAsset({ kind: draft.kind, id: draft.id, symbol: draft.symbol, decimals: draft.decimals });
  }, [draft]);
  const selectableAssets = useMemo(() => {
    if (!customAsset) return baseAssets;
    const filtered = baseAssets.filter((asset) => asset.id !== customAsset.id);
    return [customAsset, ...filtered];
  }, [baseAssets, customAsset]);

  useEffect(() => {
    if (!assetBId) setAssetBId(selectableAssets.find((asset) => asset.id !== assetAId)?.id ?? "");
  }, [assetAId, assetBId, selectableAssets]);

  useEffect(() => {
    if (!customAsset) return;
    if (draft.side === "a") setAssetAId(customAsset.id);
    if (draft.side === "b") setAssetBId(customAsset.id);
  }, [customAsset, draft.side]);

  useEffect(() => setRiskAcknowledged(false), [assetAId, assetBId, poolType, customAsset?.id]);

  const assetA = selectableAssets.find((asset) => asset.id === assetAId);
  const assetB = selectableAssets.find((asset) => asset.id === assetBId && asset.id !== assetAId);
  const selectedAssets = assetA && assetB ? [assetA, assetB] as [RegistryAsset, RegistryAsset] : undefined;
  const localDuplicate = selectedAssets ? pools.find((pool) => poolMatchesAssets(pool, selectedAssets)) : undefined;
  const duplicateQuery = useQuery({
    queryKey: ["factory-pair", selectedAssets?.[0].id, selectedAssets?.[1].id],
    enabled: Boolean(selectedAssets && !localDuplicate),
    queryFn: async () => {
      if (!selectedAssets) return null;
      try {
        return await queryFactoryPair([toAssetInfo(selectedAssets[0]), toAssetInfo(selectedAssets[1])]);
      } catch (error) {
        if (error instanceof Error && /404|not found|No pair|Pair was not found/i.test(error.message)) return null;
        return null;
      }
    },
    retry: false,
    staleTime: 30_000,
  });
  const validation = validateCreatePool({ assets: [assetA, assetB], option: selectedOption, existingPair: localDuplicate ?? duplicateQuery.data, riskAcknowledged });
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const signerOrClient = wallet.status === "connected"
    ? (wallet.getSigningCosmWasmClient as SigningClientGetter | undefined) ?? (wallet.signer as OfflineSigner | undefined)
    : undefined;
  const createPoolTx = useCreatePoolTx(signerOrClient, walletAddress);
  const submitDisabled = wallet.status !== "connected" || !network.isJunoReady || network.isWrongNetwork || !validation.isValid || createPoolTx.isPending;
  const actionCopy = network.isWrongNetwork
    ? "Switch to Juno to create pool"
    : wallet.status !== "connected"
      ? "Connect wallet to create pool"
      : createPoolTx.isPending
        ? "Creating pool…"
        : validation.error ?? "Create pool";

  const handleCreate = () => {
    if (submitDisabled || !selectedAssets || !selectedOption) return;
    createPoolTx.mutate({ assets: selectedAssets, option: selectedOption }, {
      onSuccess: (result) => {
        if (result.pairAddress) navigate(`/pools/${result.pairAddress}`);
      },
    });
  };

  return (
    <section className="panel-page create-pool-page" aria-labelledby="create-pool-title">
      <p className="eyebrow">Create pool</p>
      <h2 id="create-pool-title">Permissionless Astroport pool</h2>
      <p>Select two verified or custom assets, choose an available factory pool type, review risk guardrails, then broadcast Astroport factory <code>create_pair</code> on Juno.</p>

      <Stack className="swap-card" direction="vertical" space="6">
        <Stack className="swap-card-header" direction="horizontal" align="center" justify="space-between" flexWrap="wrap">
          <Box>
            <Text as="p" className="eyebrow">1 · Assets</Text>
            <Text as="h2" variant="heading">Select pair assets</Text>
          </Box>
          <span className="status-pill status-warn">No initial liquidity is added by this transaction · seed on the pool page next</span>
        </Stack>
        <Stack className="form-grid" direction="horizontal" align="flex-end">
          <TokenSelect assets={selectableAssets} value={assetA?.id ?? ""} onChange={setAssetAId} label="First asset" disabledIds={assetB ? [assetB.id] : []} />
          <TokenSelect assets={selectableAssets.filter((asset) => asset.id !== assetA?.id)} value={assetB?.id ?? ""} onChange={setAssetBId} label="Second asset" />
        </Stack>
        {selectedAssets ? (
          <div className="pool-assets create-pool-assets">
            {selectedAssets.map((asset) => <div key={asset.id}><span><TokenLogo asset={asset} size="sm" /> <strong>{asset.symbol}</strong> <RiskBadgeList assessment={validation.risk} max={3} /></span><small>{asset.id}</small></div>)}
          </div>
        ) : null}

        <fieldset className="custom-asset-box">
          <legend>Arbitrary denom / CW20</legend>
          <label className="risk-acknowledgement"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} /> Add a custom unverified asset</label>
          {draft.enabled ? (
            <div className="pool-list-controls custom-asset-grid">
              <label>Side<select value={draft.side} onChange={(event) => setDraft((current) => ({ ...current, side: event.target.value as CustomAssetDraft["side"] }))}><option value="a">First asset</option><option value="b">Second asset</option></select></label>
              <label>Kind<select value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as RegistryAsset["kind"] }))}><option value="native">Native / TokenFactory</option><option value="ibc">IBC</option><option value="cw20">CW20</option></select></label>
              <label>Denom or contract<input value={draft.id} onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))} placeholder="factory/... or juno1..." /></label>
              <label>Symbol<input value={draft.symbol} onChange={(event) => setDraft((current) => ({ ...current, symbol: event.target.value }))} placeholder="Auto if blank" /></label>
              <label>Decimals<input type="number" min="0" max="18" value={draft.decimals} onChange={(event) => setDraft((current) => ({ ...current, decimals: Number(event.target.value) }))} /></label>
            </div>
          ) : null}
        </fieldset>

        <Box>
          <Text as="p" className="eyebrow">2 · Pool type</Text>
          <div className="create-pool-type-grid" role="radiogroup" aria-label="Pool type">
            {options.map((option) => (
              <label className={`metric-card create-pool-type${option.id === poolType ? " active" : ""}${option.disabled ? " disabled" : ""}`} key={option.id}>
                <input type="radio" name="pool-type" value={option.id} checked={option.id === poolType} onChange={() => setPoolType(option.id)} />
                <strong>{option.label}</strong>
                <span>{feeLabel(option.feeBps)}</span>
                {option.unsupportedReason ? <small className="error-text">{option.unsupportedReason}</small> : <small>Factory configured for permissionless create_pair.</small>}
              </label>
            ))}
          </div>
        </Box>

        {localDuplicate ? <div className="empty-state"><strong>Existing pool detected.</strong> <a href={`/pools/${localDuplicate.pair}`}>Open {localDuplicate.label}</a> instead of creating a duplicate.</div> : null}
        {duplicateQuery.isFetching ? <p>Checking factory for an existing pair…</p> : null}
        <div className="empty-state compact"><strong>Guardrails</strong><ul>{validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>
        <RiskAcknowledgement assessment={validation.risk} checked={riskAcknowledged} onChange={setRiskAcknowledged} action="pool creation" />
        {network.isWrongNetwork ? <Text as="p" className="error-text">Transactions are blocked while your wallet is off Juno mainnet.</Text> : null}
        {validation.error && wallet.status === "connected" && !network.isWrongNetwork ? <Text as="p" className="error-text">{validation.error}</Text> : null}
        {createPoolTx.isError ? <Text as="p" className="error-text">{createPoolTx.error instanceof Error ? createPoolTx.error.message : "Create pool failed"}</Text> : null}
        {createPoolTx.isSuccess ? <Text as="p" className="success-text">Create pool transaction broadcast. Factory pools are refreshing.</Text> : null}
        <TxStatusDialog state={createPoolTx.txState} />
        <Button intent="primary" className="primary-action" disabled={submitDisabled} fluidWidth onClick={handleCreate} domAttributes={{ type: "button" }}>{actionCopy}</Button>
      </Stack>
    </section>
  );
}
