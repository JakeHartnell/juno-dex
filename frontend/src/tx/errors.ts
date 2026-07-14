export type DecodedTxErrorKind =
  | "max-spread"
  | "insufficient-funds"
  | "slippage"
  | "user-rejected"
  | "timeout"
  | "unknown";

export type DecodedTxError = {
  kind: DecodedTxErrorKind;
  title: string;
  message: string;
  raw: string;
  retryable: boolean;
};

function rawErrorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const maybeMessage = "message" in error ? error.message : undefined;
    if (typeof maybeMessage === "string") return maybeMessage;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

export function decodeTxError(error: unknown): DecodedTxError {
  const raw = rawErrorDetail(error);
  const normalized = raw.toLowerCase();

  if (/user (denied|rejected|reject)|request rejected|signature request rejected|declined|cancelled|canceled/.test(normalized)) {
    return {
      kind: "user-rejected",
      title: "Transaction rejected",
      message: "Your wallet rejected the signature request. Review the transaction and try again when you are ready.",
      raw,
      retryable: true,
    };
  }

  if (/max[ _-]?spread|assertion failed.*spread|spread limit|belief price|maximum spread/.test(normalized)) {
    return {
      kind: "max-spread",
      title: "Price moved beyond slippage",
      message: "The pool price moved outside your allowed max spread. Refresh the quote or increase slippage before retrying.",
      raw,
      retryable: true,
    };
  }

  if (/insufficient (funds|fee|balance)|spendable balance|not enough|cannot subtract|overflow: cannot subtract/.test(normalized)) {
    return {
      kind: "insufficient-funds",
      title: "Insufficient funds",
      message: "Your wallet does not have enough balance to cover the amount and network fees.",
      raw,
      retryable: false,
    };
  }

  if (/slippage|minimum receive|minimum amount|less than minimum|belief.*price|tolerance/.test(normalized)) {
    return {
      kind: "slippage",
      title: "Slippage tolerance exceeded",
      message: "The received amount would be below your slippage tolerance. Refresh the quote or adjust slippage before retrying.",
      raw,
      retryable: true,
    };
  }

  if (/timeout|timed out|not found after broadcast/.test(normalized)) {
    return {
      kind: "timeout",
      title: "Transaction status timed out",
      message: "The transaction was broadcast but indexing took too long. Check recent account activity before preparing another transaction.",
      raw,
      retryable: true,
    };
  }

  return {
    kind: "unknown",
    title: "Transaction failed",
    message: `The chain or wallet returned an unexpected error: ${raw}`,
    raw,
    retryable: true,
  };
}
