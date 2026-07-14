import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Button, Stack, Text } from "@interchain-ui/react";
import type { RegistryAsset } from "../../config/registry";
import { dexRegistry } from "../../config/registry";
import { toAssetInfo } from "../../lib/astroport/assetInfo";
import { queryFactoryConfig, queryFactoryPair } from "../../lib/astroport/queries";
import { buildCreatePoolAssets, createPoolOptions, makeCustomAsset, poolMatchesAssets, validateCreatePool, type CreatePoolConfigOption, type CreatePoolType } from "../../lib/createPool";
import { buildCreatePoolExecuteInstruction, useCreatePoolTx } from "../../mutations/useCreatePoolTx";
import { estimateExecuteNetworkFee, type NetworkFeeEstimate } from "../../lib/cosmjs/fees";
import { useDexRegistry } from "../../queries/useDexRegistry";
import { useNetworkGuard, useWallet } from "../../wallet/WalletContext";
import { EmptyState, ErrorState, RiskAcknowledgement, Skeleton, TransactionReview } from "../common";
import { TxStatusDialog } from "../tx/TxStatusDialog";
import { TokenSelect } from "../swap/TokenSelect";

type AssetSide = "a" | "b";
type CreatePoolReview = {
  assets: [RegistryAsset, RegistryAsset];
  option: CreatePoolConfigOption;
  configVersion: string;
  networkFeeEstimate?: NetworkFeeEstimate;
};

function feeLabel(feeBps?: number) {
  return typeof feeBps === "number" ? `${(feeBps / 100).toFixed(2)}% total fee` : "Factory default fee";
}

function inferCustomAssetKind(id: string): RegistryAsset["kind"] {
  if (/^juno1[0-9a-z]+$/i.test(id)) return "cw20";
  if (/^ibc\//i.test(id)) return "ibc";
  return "native";
}

export function CreatePoolPage() {
  const navigate = useNavigate();
  const { pools } = useDexRegistry();
  const { wallet } = useWallet();
  const { network } = useNetworkGuard();
  const [poolType, setPoolType] = useState<CreatePoolType>("xyk");
  const [assetAId, setAssetAId] = useState("ujuno");
  const [assetBId, setAssetBId] = useState("");
  const [customAssets, setCustomAssets] = useState<Partial<Record<AssetSide, RegistryAsset>>>({});
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [review, setReview] = useState<CreatePoolReview>();
  const [isPreparingReview, setIsPreparingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string>();
  const configQuery = useQuery({ queryKey: ["factory-config", dexRegistry.factory], queryFn: queryFactoryConfig, staleTime: 5 * 60_000, retry: 2 });
  const options = useMemo(() => createPoolOptions(configQuery.data?.pair_configs), [configQuery.data?.pair_configs]);
  const selectedOption = options.find((option) => option.id === poolType) ?? options[0];
  const baseAssets = useMemo(() => buildCreatePoolAssets(pools), [pools]);
  const selectableAssets = useMemo(() => {
    const custom = [customAssets.a, customAssets.b].filter((asset): asset is RegistryAsset => Boolean(asset));
    const customIds = new Set(custom.map((asset) => asset.id));
    return [...custom, ...baseAssets.filter((asset) => !customIds.has(asset.id))];
  }, [baseAssets, customAssets]);

  useEffect(() => {
    if (!assetBId) setAssetBId(selectableAssets.find((asset) => asset.id !== assetAId)?.id ?? "");
  }, [assetAId, assetBId, selectableAssets]);

  useEffect(() => setRiskAcknowledged(false), [assetAId, assetBId, poolType]);

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
        throw error;
      }
    },
    retry: 1,
    staleTime: 30_000,
  });
  const validation = validateCreatePool({ assets: [assetA, assetB], option: selectedOption, existingPair: localDuplicate ?? duplicateQuery.data, riskAcknowledged });
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const signerOrClient = wallet.status === "connected" ? wallet.signer : undefined;
  const createPoolTx = useCreatePoolTx(signerOrClient, walletAddress);
  const submitDisabled = wallet.status !== "connected" || !network.isJunoReady || network.isWrongNetwork || configQuery.isError || duplicateQuery.isError || !validation.isValid || createPoolTx.isPending || isPreparingReview;
  const actionCopy = network.isWrongNetwork
    ? "Switch to Juno to create pool"
    : wallet.status !== "connected"
      ? "Connect wallet to create pool"
      : createPoolTx.isPending
        ? "Creating pool…"
        : isPreparingReview ? "Rechecking availability…" : validation.error ?? "Review pool creation";

  const handleCreateCustomAsset = (side: AssetSide, query: string) => {
    const id = query.trim();
    if (!id) return;
    const asset = makeCustomAsset({ kind: inferCustomAssetKind(id), id });
    setCustomAssets((current) => ({ ...current, [side]: asset }));
    if (side === "a") setAssetAId(asset.id);
    else setAssetBId(asset.id);
  };

  const prepareCreateReview = async () => {
    if (submitDisabled || !selectedAssets || !selectedOption) return;
    setIsPreparingReview(true);
    setReviewError(undefined);
    const [freshConfig, freshDuplicate] = await Promise.all([configQuery.refetch(), duplicateQuery.refetch()]);
    setIsPreparingReview(false);
    if (!freshConfig.data || freshConfig.isError) {
      setReviewError("Current pool-creation settings could not be verified. Try again before reviewing.");
      return;
    }
    if (localDuplicate || freshDuplicate.data) {
      setReviewError("A pool for these assets now exists. Creation is blocked to avoid a duplicate market.");
      return;
    }
    const freshOption = createPoolOptions(freshConfig.data.pair_configs).find((option) => option.id === selectedOption.id);
    if (!freshOption || freshOption.disabled) {
      setReviewError("The selected pool type is no longer available.");
      return;
    }
    const reviewedAssets = [...selectedAssets] as [RegistryAsset, RegistryAsset];
    const instruction = buildCreatePoolExecuteInstruction({ assets: reviewedAssets, option: freshOption });
    const networkFeeEstimate = await estimateExecuteNetworkFee(signerOrClient, walletAddress, [instruction]).catch(() => undefined);
    setReview({ assets: reviewedAssets, option: freshOption, configVersion: JSON.stringify(freshConfig.data.pair_configs), networkFeeEstimate });
  };

  const reviewIsCurrent = Boolean(review
    && review.assets[0].id === selectedAssets?.[0].id
    && review.assets[1].id === selectedAssets?.[1].id
    && review.option.id === selectedOption?.id
    && review.configVersion === JSON.stringify(configQuery.data?.pair_configs));

  const handleCreate = () => {
    if (!review || !reviewIsCurrent || createPoolTx.isPending) return;
    createPoolTx.mutate({ assets: review.assets, option: review.option }, {
      onSuccess: (result) => {
        setReview(undefined);
        if (result.pairAddress) navigate(`/pools/${result.pairAddress}`);
      },
    });
  };

  return (
    <section className="panel-page create-pool-page" aria-labelledby="create-pool-title">
      <p className="eyebrow">Create pool</p>
      <h2 id="create-pool-title">Permissionless pool</h2>
      <p>Select two assets, choose an available pool type, and review the risks before asking your wallet to create the empty pool.</p>

      <Stack className="swap-card" direction="vertical" space="6">
        <Stack className="swap-card-header" direction="horizontal" align="center" justify="space-between" flexWrap="wrap">
          <Box>
            <Text as="p" className="eyebrow">1 · Assets</Text>
            <Text as="h2" variant="heading">Select pair assets</Text>
          </Box>
        </Stack>
        <Stack className="form-grid" direction="horizontal" align="flex-end">
          <TokenSelect assets={selectableAssets} value={assetA?.id ?? ""} onChange={setAssetAId} label="First asset" disabledIds={assetB ? [assetB.id] : []} onCreateCustomAsset={(query) => handleCreateCustomAsset("a", query)} />
          <TokenSelect assets={selectableAssets.filter((asset) => asset.id !== assetA?.id)} value={assetB?.id ?? ""} onChange={setAssetBId} label="Second asset" onCreateCustomAsset={(query) => handleCreateCustomAsset("b", query)} />
        </Stack>

        <Box>
          <Text as="p" className="eyebrow">2 · Pool type</Text>
          {configQuery.isLoading ? <div className="lp-position-skeleton" role="status" aria-label="Loading available pool types"><Skeleton width="16rem" /><Skeleton width="24rem" /></div> : null}
          {configQuery.isError ? <ErrorState title="Pool types unavailable" error="Pool creation stays disabled until the available types can be verified. Try again." onRetry={() => void configQuery.refetch()} /> : null}
          {!configQuery.isLoading && options.length === 0 ? <EmptyState title="No pool types available">This network currently offers no pool type that can be created from the app.</EmptyState> : null}
          <div className="create-pool-type-grid" role="radiogroup" aria-label="Pool type">
            {options.map((option) => (
              <label className={`metric-card create-pool-type${option.id === poolType ? " active" : ""}${option.disabled ? " disabled" : ""}`} key={option.id}>
                <input type="radio" name="pool-type" value={option.id} checked={option.id === poolType} onChange={() => setPoolType(option.id)} />
                <span className="create-pool-type-radio" aria-hidden="true" />
                <span className="create-pool-type-copy">
                  <strong>{option.label}</strong>
                  <span>{feeLabel(option.feeBps)}</span>
                  {option.unsupportedReason ? <small className="error-text">{option.unsupportedReason}</small> : <small>Available for anyone to create.</small>}
                </span>
              </label>
            ))}
          </div>
        </Box>

        {localDuplicate ? <div className="empty-state"><strong>Existing pool detected.</strong> <a href={`/pools/${localDuplicate.pair}`}>Open {localDuplicate.label}</a> instead of creating a duplicate.</div> : null}
        {duplicateQuery.isFetching ? <p>Checking for an existing pool…</p> : null}
        <div className="empty-state compact create-guardrails"><strong>Guardrails</strong><ul>{validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>
        <RiskAcknowledgement assessment={validation.risk} checked={riskAcknowledged} onChange={setRiskAcknowledged} action="pool creation" />
        {network.isWrongNetwork ? <Text as="p" className="error-text">Transactions are blocked while your wallet is off Juno mainnet.</Text> : null}
        {validation.error && wallet.status === "connected" && !network.isWrongNetwork ? <Text as="p" className="error-text">{validation.error}</Text> : null}
        {reviewError ? <p className="error-text" role="alert">{reviewError}</p> : null}
        <Button intent="primary" className="primary-action" disabled={submitDisabled} fluidWidth onClick={prepareCreateReview} domAttributes={{ type: "button" }}>{actionCopy}</Button>
        <TxStatusDialog state={createPoolTx.txState} />
        <TransactionReview
          open={Boolean(review)}
          title="Review pool creation"
          description="This transaction creates an empty pool only. It does not deposit assets or establish a price; liquidity must be added in a separate reviewed transaction."
          account={walletAddress}
          chainId={network.connectedChainId ?? network.expectedChainId}
          networkFeeEstimate={review?.networkFeeEstimate}
          rows={review ? [
            { label: "First asset · fixed", value: `${review.assets[0].symbol} · ${review.assets[0].verified === true ? "verified" : "unverified"}`, tone: review.assets[0].verified === true ? "default" as const : "warning" as const },
            { label: "Second asset · fixed", value: `${review.assets[1].symbol} · ${review.assets[1].verified === true ? "verified" : "unverified"}`, tone: review.assets[1].verified === true ? "default" as const : "warning" as const },
            { label: "Pool type · fixed", value: review.option.label },
            { label: "Trading fee · network configured", value: feeLabel(review.option.feeBps) },
            { label: "Initial liquidity", value: "None — separate transaction required", tone: "warning" as const },
            { label: "Price and impact", value: "Not applicable until liquidity is deposited" },
          ] : []}
          disclosures={review ? [
            { label: "Pool creation contract", value: dexRegistry.factory },
            { label: `${review.assets[0].symbol} identifier`, value: review.assets[0].id },
            { label: `${review.assets[1].symbol} identifier`, value: review.assets[1].id },
            { label: "Pair type", value: JSON.stringify(review.option.pairType) },
          ] : []}
          warning={!reviewIsCurrent && review ? "Assets, pool type, or network settings changed. Close this review and prepare a new one." : review?.assets.some((asset) => asset.verified !== true) ? "At least one asset is unverified. Verify its full identifier before signing." : undefined}
          confirmDisabled={!reviewIsCurrent}
          pending={createPoolTx.isPending}
          onClose={() => setReview(undefined)}
          onConfirm={handleCreate}
        />
      </Stack>
    </section>
  );
}
