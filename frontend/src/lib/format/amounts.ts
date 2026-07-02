const DECIMAL_INPUT_PATTERN = /^\d*(?:\.\d*)?$/;

export type ParsedTokenAmount = {
  input: string;
  decimals: number;
  baseAmount: string;
  isValid: boolean;
  error?: string;
};

function normalizeBaseAmount(amount: string | number | bigint): string {
  const raw = String(amount).trim();
  if (raw === "") return "0";
  if (!/^\d+$/.test(raw)) return "0";
  const normalized = raw.replace(/^0+(?=\d)/, "");
  return normalized === "" ? "0" : normalized;
}

export function parseTokenAmount(value: string, decimals: number): ParsedTokenAmount {
  const input = value.trim();
  if (!Number.isInteger(decimals) || decimals < 0) {
    return { input: value, decimals, baseAmount: "0", isValid: false, error: "Invalid decimal precision" };
  }
  if (input === "") return { input: value, decimals, baseAmount: "0", isValid: true };
  if (!DECIMAL_INPUT_PATTERN.test(input) || input === ".") {
    return { input: value, decimals, baseAmount: "0", isValid: false, error: "Enter a valid decimal amount" };
  }

  const [wholePart = "", fractionPart = ""] = input.split(".");
  if (fractionPart.length > decimals) {
    return {
      input: value,
      decimals,
      baseAmount: "0",
      isValid: false,
      error: `Too many decimal places; max ${decimals}`,
    };
  }

  const whole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionPart.padEnd(decimals, "0");
  const combined = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  return { input: value, decimals, baseAmount: combined === "" ? "0" : combined, isValid: true };
}

export function formatBaseAmount(amount: string | number | bigint | undefined, decimals = 6, maxFractionDigits = 6): string {
  if (amount === undefined || amount === null || amount === "") return "—";
  if (!Number.isInteger(decimals) || decimals < 0) return String(amount);
  const normalized = normalizeBaseAmount(amount);
  const padded = normalized.padStart(decimals + 1, "0");
  const whole = decimals === 0 ? padded : padded.slice(0, -decimals);
  const fraction = decimals === 0 ? "" : padded.slice(-decimals).replace(/0+$/, "");
  const trimmedFraction = maxFractionDigits >= 0 ? fraction.slice(0, maxFractionDigits) : fraction;
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return trimmedFraction ? `${groupedWhole}.${trimmedFraction}` : groupedWhole;
}

export function formatAmount(amount: string | number | bigint | undefined, decimals = 6, maxFractionDigits = 6): string {
  return formatBaseAmount(amount, decimals, maxFractionDigits);
}

export function toBaseAmount(value: string, decimals: number): string {
  const parsed = parseTokenAmount(value, decimals);
  return parsed.isValid ? parsed.baseAmount : "0";
}

export function isBaseAmountGreaterThan(amount: string, compareTo: string): boolean {
  return BigInt(normalizeBaseAmount(amount)) > BigInt(normalizeBaseAmount(compareTo));
}
