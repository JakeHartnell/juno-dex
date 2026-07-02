import type { ReactNode } from "react";
import { formatAmount, isBaseAmountGreaterThan, parseTokenAmount, toBaseAmount } from "../../lib/format/amounts";

export type TokenAmountInputProps = {
  label: string;
  value: string;
  decimals: number;
  symbol: string;
  balanceBaseAmount?: string;
  onChange: (value: string, baseAmount: string) => void;
  onMax?: (baseAmount: string) => void;
  onHalf?: (baseAmount: string) => void;
  tokenSlot?: ReactNode;
  fiatHint?: ReactNode;
  disabled?: boolean;
};

function halfBaseAmount(balanceBaseAmount: string): string {
  return (BigInt(balanceBaseAmount || "0") / 2n).toString();
}

export function TokenAmountInput({
  label,
  value,
  decimals,
  symbol,
  balanceBaseAmount,
  onChange,
  onMax,
  onHalf,
  tokenSlot,
  fiatHint,
  disabled,
}: TokenAmountInputProps) {
  const parsed = parseTokenAmount(value, decimals);
  const hasBalance = typeof balanceBaseAmount === "string";
  const isOverBalance = hasBalance && parsed.isValid && isBaseAmountGreaterThan(parsed.baseAmount, balanceBaseAmount);
  const error = parsed.error ?? (isOverBalance ? "Amount exceeds balance" : undefined);
  const balanceCopy = hasBalance ? `${formatAmount(balanceBaseAmount, decimals)} ${symbol}` : "—";

  const applyBaseAmount = (baseAmount: string, callback?: (baseAmount: string) => void) => {
    const displayValue = formatAmount(baseAmount, decimals, decimals).replace(/,/g, "");
    onChange(displayValue, toBaseAmount(displayValue, decimals));
    callback?.(baseAmount);
  };

  return (
    <section className={`token-amount-input${error ? " has-error" : ""}`} aria-label={label}>
      <div className="token-amount-topline">
        <span>{label}</span>
        <span className="token-balance">Balance: {balanceCopy}</span>
      </div>
      <div className="token-amount-row">
        <div className="token-identity">
          {tokenSlot ? <span className="token-logo-slot">{tokenSlot}</span> : <span className="token-logo-fallback">{symbol.slice(0, 2)}</span>}
          <strong>{symbol}</strong>
        </div>
        <input
          aria-label={`${label} amount`}
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const nextValue = event.target.value;
            onChange(nextValue, toBaseAmount(nextValue, decimals));
          }}
          placeholder="0.0"
        />
      </div>
      <div className="token-amount-actions">
        <button type="button" disabled={!hasBalance || disabled} onClick={() => balanceBaseAmount && applyBaseAmount(halfBaseAmount(balanceBaseAmount), onHalf)}>Half</button>
        <button type="button" disabled={!hasBalance || disabled} onClick={() => balanceBaseAmount && applyBaseAmount(balanceBaseAmount, onMax)}>MAX</button>
        <span className="fiat-hint">{fiatHint}</span>
      </div>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </section>
  );
}
