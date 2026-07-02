import type { RegistryAsset } from "../../config/registry";

export type DexAssetInfo =
  | { native_token: { denom: string } }
  | { token: { contract_addr: string } };

export type DexAsset = {
  info: DexAssetInfo;
  amount: string;
};

export function toAssetInfo(asset: RegistryAsset): DexAssetInfo {
  if (asset.kind === "cw20") return { token: { contract_addr: asset.id } };
  return { native_token: { denom: asset.id } };
}

export function toAsset(asset: RegistryAsset, amount: string): DexAsset {
  return { info: toAssetInfo(asset), amount };
}

export function assetLabel(asset: RegistryAsset): string {
  return `${asset.symbol} (${asset.id})`;
}

export function nativeFunds(asset: RegistryAsset, amount: string) {
  return asset.kind === "cw20" ? [] : [{ denom: asset.id, amount }];
}
