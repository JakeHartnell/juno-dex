import { Button, Stack, Text } from "@interchain-ui/react";
import { useWallet } from "../../wallet/WalletContext";
import { WalletAddressActions } from "./WalletAddressActions";

export function WalletConnectButton() {
  const { wallet, connect, disconnect } = useWallet();

  if (wallet.status === "connected" && wallet.address) {
    return (
      <Stack className="wallet-stack connected" direction="vertical" space="2">
        <span className="wallet-connected-name">{wallet.name ?? "Wallet"}</span>
        <WalletAddressActions address={wallet.address} />
        <Button className="wallet-button connected" onClick={() => void disconnect()}>Disconnect</Button>
      </Stack>
    );
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
