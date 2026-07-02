import { useState } from "react";
import { dexRegistry } from "../../config/registry";
import { SLIPPAGE_PRESET_BPS, formatSlippagePercent, slippagePercentToBps } from "../../lib/swap/slippage";
import { useSlippageSettings } from "../../settings/SlippageSettingsContext";

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { slippageBps, setSlippageBps, setSlippagePercent, maxSpread } = useSlippageSettings();
  const isPreset = SLIPPAGE_PRESET_BPS.some((preset) => preset === slippageBps);
  const [customValue, setCustomValue] = useState(isPreset ? "" : formatSlippagePercent(slippageBps));
  const customInvalid = customValue !== "" && (!Number.isFinite(Number(customValue)) || Number(customValue) <= 0 || Number(customValue) > 50);

  return (
    <div className="settings-panel" role="dialog" aria-label="DEX settings">
      <div className="settings-header">
        <span className="settings-title">Settings</span>
        <button className="text-button" type="button" onClick={onClose}>Close</button>
      </div>
      <p>Choose the maximum slippage tolerated by swap execution. This value updates minimum received and the transaction max_spread.</p>
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
            max="50"
            step="0.01"
            placeholder="0.25"
            value={customValue}
            onChange={(event) => {
              const value = event.target.value;
              setCustomValue(value);
              const percent = Number(value);
              if (Number.isFinite(percent) && percent > 0 && percent <= 50) setSlippagePercent(percent);
            }}
          />
        </label>
        {customInvalid ? <p className="field-error" role="alert">Enter slippage between 0.01% and 50%.</p> : null}
      </fieldset>
      <dl>
        <div><dt>Selected slippage</dt><dd>{formatSlippagePercent(slippageBps)}%</dd></div>
        <div><dt>Swap max_spread</dt><dd><code>{maxSpread}</code></dd></div>
        <div><dt>RPC endpoint</dt><dd><code>{dexRegistry.rpcEndpoint}</code></dd></div>
      </dl>
    </div>
  );
}
