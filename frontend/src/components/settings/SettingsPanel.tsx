import { useEffect, useRef, useState } from "react";
import { dexRegistry } from "../../config/registry";
import { DANGEROUS_SLIPPAGE_BPS, HIGH_SLIPPAGE_BPS, MAX_SLIPPAGE_BPS, SLIPPAGE_PRESET_BPS, formatSlippagePercent } from "../../lib/swap/slippage";
import { useSlippageSettings } from "../../settings/SlippageSettingsContext";

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { slippageBps, setSlippageBps, setSlippagePercent, maxSpread } = useSlippageSettings();
  const isPreset = SLIPPAGE_PRESET_BPS.some((preset) => preset === slippageBps);
  const [customValue, setCustomValue] = useState(isPreset ? "" : formatSlippagePercent(slippageBps));
  const maxSlippagePercent = MAX_SLIPPAGE_BPS / 100;
  const customInvalid = customValue !== "" && (!Number.isFinite(Number(customValue)) || Number(customValue) <= 0 || Number(customValue) > maxSlippagePercent);
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    panelRef.current?.querySelector<HTMLElement>("button, input")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      trigger?.focus();
    };
  }, [onClose]);

  return (
    <div ref={panelRef} className="settings-panel" role="dialog" aria-label="DEX settings">
      <div className="settings-header">
        <span className="settings-title">Settings</span>
        <button className="text-button" type="button" onClick={onClose}>Close</button>
      </div>
      <p>Choose how much the price may move before your swap is cancelled. A lower value protects the quote but may cause more failed swaps in a moving market.</p>
      <fieldset className="slippage-settings-group">
        <legend>Slippage tolerance</legend>
        <div className="slippage-presets" role="group" aria-label="Slippage presets">
          {SLIPPAGE_PRESET_BPS.map((preset) => (
            <button
              className={`slippage-preset${slippageBps === preset ? " active" : ""}`}
              key={preset}
              type="button"
              onClick={() => {
                setCustomValue("");
                setSlippageBps(preset);
              }}
            >
              {formatSlippagePercent(preset)}%
            </button>
          ))}
        </div>
        <label className="field custom-slippage-field">
          <span>Custom slippage (%)</span>
          <input
            inputMode="decimal"
            min="0.01"
            max={maxSlippagePercent}
            step="0.01"
            placeholder="0.25"
            value={customValue}
            onChange={(event) => {
              const value = event.target.value;
              setCustomValue(value);
              const percent = Number(value);
              if (Number.isFinite(percent) && percent > 0 && percent <= maxSlippagePercent) setSlippagePercent(percent);
            }}
          />
        </label>
        {customInvalid ? <p className="field-error" role="alert">Enter slippage between 0.01% and {maxSlippagePercent}%.</p> : null}
        {slippageBps > HIGH_SLIPPAGE_BPS ? (
          <p className={slippageBps >= DANGEROUS_SLIPPAGE_BPS ? "error-text" : "field-error"} role="status">
            {slippageBps >= DANGEROUS_SLIPPAGE_BPS ? "Dangerously high" : "High"} slippage can expose this swap to a materially worse execution price. You will need to acknowledge it before review.
          </p>
        ) : null}
      </fieldset>
      <dl>
        <div><dt>Selected slippage</dt><dd>{formatSlippagePercent(slippageBps)}%</dd></div>
      </dl>
      <details className="identifier-disclosure">
        <summary>Technical settings</summary>
        <dl>
          <div><dt>Contract max spread</dt><dd><code>{maxSpread}</code></dd></div>
          <div><dt>Network endpoint</dt><dd><code>{dexRegistry.rpcEndpoint}</code></dd></div>
        </dl>
      </details>
    </div>
  );
}
