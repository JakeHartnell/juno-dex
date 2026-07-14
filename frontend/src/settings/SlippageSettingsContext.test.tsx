import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SLIPPAGE_STORAGE_KEY } from "../lib/swap/slippage";
import { SlippageSettingsProvider, useSlippageSettings } from "./SlippageSettingsContext";

function SlippageProbe() {
  const { slippageBps, formattedSlippagePercent, setSlippageBps } = useSlippageSettings();
  return (
    <div>
      <output aria-label="slippage">{slippageBps}:{formattedSlippagePercent}%</output>
      <button type="button" onClick={() => setSlippageBps(5_000)}>Set legacy value</button>
    </div>
  );
}

describe("SlippageSettingsProvider", () => {
  beforeEach(() => window.localStorage.clear());

  it("migrates a legacy persisted 50% tolerance to the 5% safety ceiling", () => {
    window.localStorage.setItem(SLIPPAGE_STORAGE_KEY, "5000");
    render(<SlippageSettingsProvider><SlippageProbe /></SlippageSettingsProvider>);
    expect(screen.getByLabelText("slippage").textContent).toBe("500:5%");
  });

  it("never persists a value above the current ceiling", () => {
    render(<SlippageSettingsProvider><SlippageProbe /></SlippageSettingsProvider>);
    fireEvent.click(screen.getByRole("button", { name: /set legacy value/i }));
    expect(window.localStorage.getItem(SLIPPAGE_STORAGE_KEY)).toBe("500");
  });
});
