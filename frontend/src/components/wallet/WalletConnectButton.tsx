import { Button, Stack, Text } from "@interchain-ui/react";
import { useEffect, useRef, useState } from "react";
import { dexRegistry } from "../../config/registry";
import { truncateAddress } from "../../lib/format/addresses";
import { useWallet } from "../../wallet/WalletContext";
import { WalletAddressActions } from "./WalletAddressActions";

export function WalletConnectButton() {
  const { wallet, network, connect, disconnect, switchToJuno } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [menuOpen]);

  if (wallet.status === "connected" && wallet.address) {
    return <div className="wallet-account-menu" ref={menuRef}>
      <Button className="wallet-button connected" onClick={() => setMenuOpen((open) => !open)} domAttributes={{ "aria-label": "Open wallet account menu", "aria-expanded": menuOpen }}>
          <span className="wallet-status-dot" aria-hidden="true" />
          {wallet.name ?? truncateAddress(wallet.address)}
      </Button>
      {menuOpen ? <div className="wallet-account-popover" role="dialog" aria-label="Wallet account">
        <WalletAddressActions address={wallet.address} />
        <a href={`${dexRegistry.explorerBaseUrl}/account/${wallet.address}`} target="_blank" rel="noreferrer">View account in explorer</a>
        {network.connectedChainId !== network.expectedChainId ? <button type="button" onClick={() => void switchToJuno()}>Switch to Juno</button> : null}
        <button type="button" onClick={() => void disconnect()}>Disconnect wallet</button>
      </div> : null}
    </div>;
  }

  return (
    <Stack className="wallet-stack" direction="vertical" space="2">
      <Button className="wallet-button" onClick={() => void connect()} disabled={wallet.status === "connecting"}>
        {wallet.status === "connecting" ? "Connecting…" : "Connect wallet"}
      </Button>
      {wallet.status === "error" ? <Text as="span" className="error-text">{wallet.error}</Text> : null}
    </Stack>
  );
}
