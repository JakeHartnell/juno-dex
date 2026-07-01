import type { RegistryAsset } from "../../config/registry";

export type AstroportAssetInfo =
  | { native_token: { denom: string } }
  | { token: { contract_addr: string } };

export type AstroportAsset = {
  info: AstroportAssetInfo;
  amount: string;
};

export function toAssetInfo(asset: RegistryAsset): AstroportAssetInfo {
  if (asset.kind === "cw20") return { token: { contract_addr: asset.id } };
  return { native_token: { denom: asset.id } };
}

export function toAsset(asset: RegistryAsset, amount: string): AstroportAsset {
  return { info: toAssetInfo(asset), amount };
}

export function assetLabel(asset: RegistryAsset): string {
  return `${asset.symbol} (${asset.id})`;
}

export function nativeFunds(asset: RegistryAsset, amount: string) {
  return asset.kind === "cw20" ? [] : [{ denom: asset.id, amount }];
}
