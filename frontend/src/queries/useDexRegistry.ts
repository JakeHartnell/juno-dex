import { useMemo } from "react";
import { dexRegistry, enabledPools } from "../config/registry";

export function useDexRegistry() {
  return useMemo(() => ({ registry: dexRegistry, pools: enabledPools }), []);
}
