import tsCodegen from "@cosmwasm/ts-codegen";

const codegen = tsCodegen.default ?? tsCodegen;
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(frontendDir, "..");
const outPath = path.join(frontendDir, "src/lib/generated");

const contractSpecs = [
  ["Factory", "astroport-factory"],
  ["Pair", "astroport-pair"],
  ["PairStable", "astroport-pair-stable"],
  ["PairConcentrated", "astroport-pair-concentrated"],
  ["Router", "astroport-router"],
  ["Incentives", "astroport-incentives"],
  ["Oracle", "astroport-oracle"],
  ["NativeCoinRegistry", "astroport-native-coin-registry"],
];

const contracts = contractSpecs
  .map(([name, schemaDir]) => ({
    name,
    dir: path.join(repoRoot, "schemas", schemaDir),
    rawDir: path.join(repoRoot, "schemas", schemaDir, "raw"),
  }))
  .filter((contract) => {
    const hasRawSchemas = existsSync(contract.rawDir);
    if (!hasRawSchemas) {
      console.warn(`Skipping ${contract.name}: ${path.relative(repoRoot, contract.rawDir)} does not exist.`);
    }
    return hasRawSchemas;
  })
  .map(({ name, dir }) => ({ name, dir }));

if (contracts.length === 0) {
  throw new Error("No contract schemas found under ../schemas/astroport-*/raw");
}

rmSync(outPath, { recursive: true, force: true });

await codegen({
  contracts,
  outPath,
  options: {
    bundle: {
      enabled: true,
      scope: "contracts",
      bundleFile: "index.ts",
    },
    types: {
      enabled: true,
      aliasExecuteMsg: true,
      aliasEntryPoints: true,
    },
    client: {
      enabled: true,
      execExtendsQuery: false,
    },
    messageBuilder: {
      enabled: false,
    },
    messageComposer: {
      enabled: true,
    },
    reactQuery: {
      enabled: false,
    },
    recoil: {
      enabled: false,
    },
  },
});

console.log(`Generated ${contracts.length} contract SDKs in ${path.relative(frontendDir, outPath)}.`);
