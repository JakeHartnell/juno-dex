import { useState } from "react";
import { Button, Stack, Text } from "@interchain-ui/react";
import { useNetworkGuard } from "../../wallet/WalletContext";

export function NetworkGuardBanner() {
  const { network, switchToJuno } = useNetworkGuard();
  const [error, setError] = useState<string>();

  if (!network.message) return null;

  const recover = async () => {
    setError(undefined);
    try {
      await switchToJuno();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to enable Juno in the selected wallet.");
    }
  };

  return (
    <div className="network-guard-banner" role="alert">
      <Stack direction="horizontal" align="center" justify="space-between" flexWrap="wrap">
        <Text as="span">{network.message}</Text>
        <Button intent="primary" size="sm" onClick={() => void recover()} disabled={network.isRecovering}>
          {network.isRecovering ? "Switching…" : "Switch to Juno"}
        </Button>
        {error ? <Text as="span" className="error-text">{error}</Text> : null}
      </Stack>
    </div>
  );
}
