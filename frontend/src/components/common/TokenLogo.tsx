import type { RegistryAsset } from "../../config/registry";

export function TokenLogo({ asset, size = "md" }: { asset: Pick<RegistryAsset, "symbol" | "logoURI">; size?: "sm" | "md" }) {
  const initials = asset.symbol.slice(0, 2).toUpperCase();
  if (asset.logoURI) {
    return (
      <span className={`token-logo-frame token-logo-${size}`}>
        <img
          className="token-logo-img"
          src={asset.logoURI}
          alt={`${asset.symbol} logo`}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
            event.currentTarget.parentElement?.setAttribute("data-fallback", initials);
          }}
        />
      </span>
    );
  }
  return <span className={`token-logo-fallback token-logo-${size}`}>{initials}</span>;
}
