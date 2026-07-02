export const openApiDocument = {
  openapi: "3.1.0",
  info: { title: "Astroport Juno Indexer API", version: "0.1.0" },
  servers: [{ url: "/" }],
  paths: {
    "/health": { get: { summary: "Health and data-source status" } },
    "/stats": { get: { summary: "Protocol TVL, volume, fee and pool totals" } },
    "/pools": { get: { summary: "List pools with TVL, volume, fees and APR metrics" } },
    "/pools/{id}": { get: { summary: "Pool detail by id or pair address" } },
    "/pools/{id}/positions": { get: { summary: "Paginated LP positions for a pool" } },
    "/wallets/{addr}/positions": { get: { summary: "Paginated LP positions for a wallet" } },
    "/wallets/{addr}/history": { get: { summary: "Paginated transaction history for a wallet" } },
  },
};
