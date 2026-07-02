import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { RegistryAsset } from "../../config/registry";
import { formatAmount } from "../../lib/format/amounts";
import { assessAssetRisk } from "../../lib/risk";
import type { WalletBalance } from "../../queries/useWalletBalances";
import { Modal, RiskBadgeList, TokenLogo } from "../common";

const FAVORITES_STORAGE_KEY = "juno-dex.token-selector.favorites";
const RECENTS_STORAGE_KEY = "juno-dex.token-selector.recents";
const MAX_RECENTS = 5;

export type TokenSelectorAsset = RegistryAsset & {
  name?: string;
  verified?: boolean;
  poolCount?: number;
};

type TokenSelectorProps = {
  assets: TokenSelectorAsset[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  balances?: readonly WalletBalance[];
  disabledIds?: string[];
};

function readStoredIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function writeStoredIds(key: string, ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(ids));
}

export function matchesTokenSearch(asset: TokenSelectorAsset, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [asset.symbol, asset.name, asset.id, asset.denomTrace].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized));
}

function assetBalance(asset: TokenSelectorAsset, balances?: readonly WalletBalance[]) {
  return balances?.find((balance) => balance.denom === asset.id)?.amount;
}

export function TokenSelect({ assets, value, onChange, label, balances, disabledIds = [] }: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => readStoredIds(FAVORITES_STORAGE_KEY));
  const [recents, setRecents] = useState<string[]>(() => readStoredIds(RECENTS_STORAGE_KEY));
  const searchRef = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const resultsId = useId();
  const selected = assets.find((asset) => asset.id === value) ?? assets[0];
  const disabled = new Set(disabledIds);

  useEffect(() => {
    if (isOpen) searchRef.current?.focus();
  }, [isOpen]);

  const visibleAssets = useMemo(() => {
    const favoriteRank = new Map(favorites.map((id, index) => [id, index]));
    const recentRank = new Map(recents.map((id, index) => [id, index]));
    return assets
      .filter((asset) => matchesTokenSearch(asset, query))
      .sort((a, b) => {
        const favDelta = (favoriteRank.get(a.id) ?? 999) - (favoriteRank.get(b.id) ?? 999);
        if (favDelta !== 0) return favDelta;
        const recentDelta = (recentRank.get(a.id) ?? 999) - (recentRank.get(b.id) ?? 999);
        if (recentDelta !== 0) return recentDelta;
        return a.symbol.localeCompare(b.symbol);
      });
  }, [assets, favorites, query, recents]);

  const persistFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((favorite) => favorite !== id) : [id, ...favorites];
    setFavorites(next);
    writeStoredIds(FAVORITES_STORAGE_KEY, next);
  };

  const selectAsset = (id: string) => {
    if (disabled.has(id)) return;
    const nextRecents = [id, ...recents.filter((recent) => recent !== id)].slice(0, MAX_RECENTS);
    setRecents(nextRecents);
    writeStoredIds(RECENTS_STORAGE_KEY, nextRecents);
    onChange(id);
    setQuery("");
    setIsOpen(false);
  };

  return (
    <div className="token-selector field">
      <span>{label}</span>
      <button className="token-selector-trigger" type="button" onClick={() => setIsOpen(true)} aria-haspopup="dialog" aria-expanded={isOpen} aria-label={`${label}: ${selected?.symbol ?? "Select token"}`} disabled={!selected}>
        {selected ? <TokenLogo asset={selected} /> : null}
        <span className="token-selector-trigger-copy">
          <strong>{selected?.symbol ?? "Select"}</strong>
          <small>{selected?.id ?? "Choose token"}</small>
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      <Modal open={isOpen} title={`Select ${label.toLowerCase()} token`} onClose={() => setIsOpen(false)}>
        <div className="token-selector-modal">
          <input ref={searchRef} className="token-search-input" aria-label="Search tokens" aria-describedby={helpId} aria-controls={resultsId} placeholder="Search symbol, name, denom, or address" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div id={helpId} className="token-selector-help">Favorites are saved on this device. Unknown factory tokens are marked unverified.</div>
          <div id={resultsId} className="token-list" role="list" aria-label={`${label} token results`}>
            {visibleAssets.length === 0 ? <p className="empty-token-results">No tokens match “{query}”.</p> : null}
            {visibleAssets.map((asset) => {
              const balance = assetBalance(asset, balances);
              const isFavorite = favorites.includes(asset.id);
              const isDisabled = disabled.has(asset.id);
              const assessment = assessAssetRisk(asset, { inheritedVerified: asset.verified });
              return (
                <div className={`token-row${asset.id === value ? " selected" : ""}${isDisabled ? " disabled" : ""}`} key={asset.id} role="listitem">
                  <button className="favorite-button" type="button" aria-label={`${isFavorite ? "Remove" : "Add"} ${asset.symbol} favorite`} aria-pressed={isFavorite} onClick={() => persistFavorite(asset.id)}>{isFavorite ? "★" : "☆"}</button>
                  <button className="token-row-main" type="button" disabled={isDisabled} aria-current={asset.id === value ? "true" : undefined} aria-label={`Select ${asset.symbol}${asset.name ? `, ${asset.name}` : ""}${isDisabled ? ", unavailable" : ""}`} onClick={() => selectAsset(asset.id)}>
                    <TokenLogo asset={asset} />
                    <span className="token-row-copy">
                      <strong>{asset.symbol} <RiskBadgeList assessment={assessment} max={2} /></strong>
                      <small>{asset.name ?? asset.id}</small>
                    </span>
                    <span className="token-row-meta">
                      <strong>{typeof balance === "string" ? formatAmount(balance, asset.decimals) : "—"}</strong>
                      <small>{typeof balance === "string" ? asset.symbol : "Balance"}</small>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
