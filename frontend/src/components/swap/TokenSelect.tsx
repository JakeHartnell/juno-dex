import type { RegistryAsset } from "../../config/registry";

export function TokenSelect({ assets, value, onChange, label }: { assets: RegistryAsset[]; value: string; onChange: (value: string) => void; label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol}</option>)}
      </select>
    </label>
  );
}
