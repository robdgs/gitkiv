import { createPublicClient, type PublicArkivClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { http } from "viem";

// Public reads need no key/wallet — this is the only thing the app's
// read path talks to now. No sqlite, no subgraph, no Postgres pipeline.
let client: PublicArkivClient | null = null;

export function getArkivClient(): PublicArkivClient {
  if (!client) {
    client = createPublicClient({
      chain: tiramisu,
      transport: http(undefined, { timeout: 8000, retryCount: 1 }),
    });
  }
  return client;
}
