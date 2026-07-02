import { useState } from "react";
import { truncateAddress } from "../../lib/format/addresses";

async function copyText(value: string): Promise<"clipboard" | "fallback"> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return "clipboard";
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  return "fallback";
}

export function WalletAddressActions({ address }: { address: string }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <span className="wallet-address-actions" onClick={(event) => event.stopPropagation()}>
      <code title={address}>{truncateAddress(address)}</code>
      <button
        type="button"
        className="wallet-inline-action"
        aria-label="Copy wallet address"
        onClick={async () => {
          try {
            await copyText(address);
            setCopyStatus("copied");
            window.setTimeout(() => setCopyStatus("idle"), 1_500);
          } catch {
            setCopyStatus("failed");
          }
        }}
      >
        {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy"}
      </button>
    </span>
  );
}
