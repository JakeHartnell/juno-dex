import { truncateAddress } from "../../lib/format/addresses";
import { useWallet } from "../../wallet/WalletContext";

export function WalletConnectButton() {
  const { wallet, connect } = useWallet();

  if (wallet.status === "connected" && wallet.address) {
    return <button className="wallet-button connected" type="button">{wallet.name ?? "Keplr"} · {truncateAddress(wallet.address)}</button>;
  }

  return (
    <div className="wallet-stack">
      <button className="wallet-button" type="button" onClick={connect} disabled={wallet.status === "connecting"}>
        {wallet.status === "connecting" ? "Connecting…" : "Connect Keplr"}
      </button>
      {wallet.status === "error" ? <small className="error-text">{wallet.error}</small> : null}
    </div>
  );
}
