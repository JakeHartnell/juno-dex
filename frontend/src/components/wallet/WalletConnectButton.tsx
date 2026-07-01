import { useState } from "react";
import { connectKeplr } from "../../wallet/keplr";
import type { WalletState } from "../../wallet/types";
import { truncateAddress } from "../../lib/format/addresses";

export function WalletConnectButton() {
  const [wallet, setWallet] = useState<WalletState>({ status: "idle" });

  async function onConnect() {
    setWallet({ status: "connecting" });
    setWallet(await connectKeplr());
  }

  if (wallet.status === "connected" && wallet.address) {
    return <button className="wallet-button connected" type="button">{wallet.name ?? "Keplr"} · {truncateAddress(wallet.address)}</button>;
  }

  return (
    <div className="wallet-stack">
      <button className="wallet-button" type="button" onClick={onConnect} disabled={wallet.status === "connecting"}>
        {wallet.status === "connecting" ? "Connecting…" : "Connect Keplr"}
      </button>
      {wallet.status === "error" ? <small className="error-text">{wallet.error}</small> : null}
    </div>
  );
}
