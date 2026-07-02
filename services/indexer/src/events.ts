export type EventAttribute = { key: string; value: string; index?: boolean };
export type TendermintEvent = { type: string; attributes: EventAttribute[] };

export type EventContext = {
  chainId: string;
  height: number;
  blockTime: string;
  txHash: string;
  msgIndex: number;
  eventIndex: number;
};

export type AssetAmount = { asset: string; amount?: string };

export type NormalizedEvent =
  | PoolCreatedEvent
  | SwapEvent
  | LiquidityEvent
  | IncentiveEvent;

export type PoolCreatedEvent = EventContext & {
  kind: "pool_created";
  factoryAddress: string;
  pairAddress: string;
  liquidityTokenAddress?: string;
  poolType?: string;
  assetInfos: string[];
  raw: Record<string, string | string[]>;
};

export type SwapEvent = EventContext & {
  kind: "swap";
  pairAddress: string;
  trader?: string;
  offerAsset?: string;
  offerAmount?: string;
  askAsset?: string;
  returnAmount?: string;
  spreadAmount?: string;
  commissionAmount?: string;
  raw: Record<string, string | string[]>;
};

export type LiquidityEvent = EventContext & {
  kind: "provide" | "withdraw";
  pairAddress: string;
  provider?: string;
  assets: AssetAmount[];
  shareAmount?: string;
  raw: Record<string, string | string[]>;
};

export type IncentiveEvent = EventContext & {
  kind: "incentive";
  incentivesAddress: string;
  action: string;
  lpTokenAddress?: string;
  userAddress?: string;
  amount?: string;
  rewardAsset?: string;
  rewardAmount?: string;
  raw: Record<string, string | string[]>;
};

export type ContractAddresses = {
  factoryAddress: string;
  incentivesAddress: string;
};

export function attributesToRecord(attributes: EventAttribute[]): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const { key, value } of attributes) {
    const current = out[key];
    if (current === undefined) out[key] = value;
    else if (Array.isArray(current)) current.push(value);
    else out[key] = [current, value];
  }
  return out;
}

function first(raw: Record<string, string | string[]>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value)) return value[0];
    if (value) return value;
  }
  return undefined;
}

function all(raw: Record<string, string | string[]>, keys: string[]): string[] {
  const values: string[] = [];
  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value)) values.push(...value);
    else if (value) values.push(value);
  }
  return values;
}

function parseAssets(raw: Record<string, string | string[]>): AssetAmount[] {
  const denoms = all(raw, ["assets", "asset", "withdrawn_assets", "provided_assets", "offer_asset", "ask_asset"]);
  const amounts = all(raw, ["amounts", "amount", "withdrawn_amounts", "provided_amounts"]);
  if (denoms.length === 0 && amounts.length === 0) return [];
  if (denoms.length === amounts.length) return denoms.map((asset, index) => ({ asset, amount: amounts[index] }));
  return denoms.map((asset) => ({ asset }));
}

function isWasm(event: TendermintEvent): boolean {
  return event.type === "wasm" || event.type.startsWith("wasm-") || event.type === "execute";
}

export function normalizeWasmEvent(
  event: TendermintEvent,
  context: EventContext,
  contracts: ContractAddresses,
): NormalizedEvent | undefined {
  if (!isWasm(event)) return undefined;
  const raw = attributesToRecord(event.attributes);
  const action = first(raw, ["action", "method", "_contract_action"]);
  const contract = first(raw, ["_contract_address", "contract_address"]);

  if (!action || !contract) return undefined;

  if (contract === contracts.factoryAddress && ["create_pair", "pair_created", "create_pair_and_distribution_flows"].includes(action)) {
    const pairAddress = first(raw, ["pair_contract_addr", "pair_address", "contract_addr", "pair"]);
    if (!pairAddress) return undefined;
    return {
      ...context,
      kind: "pool_created",
      factoryAddress: contract,
      pairAddress,
      liquidityTokenAddress: first(raw, ["liquidity_token_addr", "liquidity_token", "lp_token_addr"]),
      poolType: first(raw, ["pair_type", "pool_type"]),
      assetInfos: all(raw, ["asset_infos", "asset_info", "assets"]),
      raw,
    };
  }

  if (["swap", "swap_and_send"].includes(action)) {
    return {
      ...context,
      kind: "swap",
      pairAddress: contract,
      trader: first(raw, ["sender", "trader", "receiver"]),
      offerAsset: first(raw, ["offer_asset", "offer_asset_info", "ask_asset"]),
      offerAmount: first(raw, ["offer_amount", "amount"]),
      askAsset: first(raw, ["ask_asset", "ask_asset_info", "return_asset"]),
      returnAmount: first(raw, ["return_amount", "return"]),
      spreadAmount: first(raw, ["spread_amount"]),
      commissionAmount: first(raw, ["commission_amount"]),
      raw,
    };
  }

  if (["provide_liquidity", "provide"].includes(action)) {
    return {
      ...context,
      kind: "provide",
      pairAddress: contract,
      provider: first(raw, ["sender", "provider", "receiver"]),
      assets: parseAssets(raw),
      shareAmount: first(raw, ["share", "share_amount", "minted_share"]),
      raw,
    };
  }

  if (["withdraw_liquidity", "withdraw"].includes(action)) {
    return {
      ...context,
      kind: "withdraw",
      pairAddress: contract,
      provider: first(raw, ["sender", "provider", "receiver"]),
      assets: parseAssets(raw),
      shareAmount: first(raw, ["share", "share_amount", "refund_share"]),
      raw,
    };
  }

  if (contract === contracts.incentivesAddress) {
    return {
      ...context,
      kind: "incentive",
      incentivesAddress: contract,
      action,
      lpTokenAddress: first(raw, ["lp_token", "lp_token_addr", "staking_token", "staking_token_addr"]),
      userAddress: first(raw, ["user", "sender", "staker", "recipient"]),
      amount: first(raw, ["amount", "bond_amount", "unbond_amount"]),
      rewardAsset: first(raw, ["reward_asset", "reward_token", "asset"]),
      rewardAmount: first(raw, ["reward_amount", "rewards", "amount"]),
      raw,
    };
  }

  return undefined;
}

export function normalizeBlockEvents(
  events: TendermintEvent[],
  baseContext: Omit<EventContext, "eventIndex" | "msgIndex">,
  contracts: ContractAddresses,
): NormalizedEvent[] {
  return events
    .map((event, eventIndex) => normalizeWasmEvent(event, { ...baseContext, msgIndex: inferMsgIndex(event), eventIndex }, contracts))
    .filter((event): event is NormalizedEvent => event !== undefined);
}

function inferMsgIndex(event: TendermintEvent): number {
  const raw = attributesToRecord(event.attributes);
  const value = first(raw, ["msg_index", "msg_index_start"]);
  return value ? Number.parseInt(value, 10) || 0 : 0;
}
