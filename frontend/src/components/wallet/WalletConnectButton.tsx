import { Button, Stack, Text } from "@interchain-ui/react";
import { truncateAddress } from "../../lib/format/addresses";
import { useWallet } from "../../wallet/WalletContext";

export function WalletConnectButton() {
  const { wallet, connect, disconnect } = useWallet();

  if (wallet.status === "connected" && wallet.address) {
    return (
      <Button className="wallet-button connected" onClick={() => void disconnect()}>
        {wallet.name ?? "Wallet"} · {truncateAddress(wallet.address)}
      </Button>
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
