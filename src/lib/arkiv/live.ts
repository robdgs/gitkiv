"use client";
// Mission 03 (Live wire): a real WebSocket subscription straight from the
// browser to Arkiv — no backend in this path either, consistent with the
// rest of the app. No `fromBlock` is ever passed to watchEntityEvents,
// which is what keeps it on the WebSocket transport instead of silently
// falling back to HTTP polling (see guides/events-and-expiration).
import { createPublicClient, type PublicArkivClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { createPublicClient as createViemClient, http, webSocket } from "viem";

const WS_URL = "wss://rpc.tiramisu.db-chain.testnet.arkiv.network";

let wsClient: PublicArkivClient | null = null;
let httpClient: PublicArkivClient | null = null;

function getWsClient(): PublicArkivClient {
  if (!wsClient) {
    wsClient = createPublicClient({ chain: tiramisu, transport: webSocket(WS_URL) });
  }
  return wsClient;
}

// A separate bounded HTTP client for the follow-up entity read after each
// event — events carry no attributes/payload, so this hydration read is
// what tells us whether a created entity is actually a commit/lock on the
// repo+branch being viewed. This is an event-triggered read, not a
// periodic refresh loop.
function getHttpClient(): PublicArkivClient {
  if (!httpClient) {
    httpClient = createPublicClient({ chain: tiramisu, transport: http(undefined, { timeout: 8000 }) });
  }
  return httpClient;
}

export const TIRAMISU_CHAIN_ID = tiramisu.id;

export type ActivityEvent = {
  id: number;
  time: number;
  kind: "commit" | "lock";
  matched: boolean;
  detail: string;
};

// Watches every entity Arkiv creates on Tiramisu (this is a shared public
// network — without an owner filter you'd see everyone's entities), keeps
// only the ones our own writer wallet created, reads those to check their
// typed kind/repo_id/branch attributes, and reports whether each one
// belongs to the repo+branch currently being viewed.
export function watchRepoActivity(
  repoId: string,
  branch: string,
  ownerAddress: string,
  onEvent: (event: ActivityEvent) => void
): () => void {
  let nextId = 1;
  const pending = new Set<string>();
  let busy = false;
  let stopped = false;

  async function drain() {
    if (busy || stopped || pending.size === 0) return;
    busy = true;
    const entityKey = pending.values().next().value as string;
    pending.delete(entityKey);
    try {
      const entity = await getHttpClient().getEntity(entityKey as `0x${string}`);
      const kindAttr = entity.attributes.kind;
      const kind = kindAttr?.type === "str" ? kindAttr.value : undefined;
      if (kind !== "commit" && kind !== "lock") {
        return;
      }
      const repoAttr = entity.attributes.repo_id;
      const branchAttr = entity.attributes.branch;
      const seenRepo = repoAttr?.type === "str" ? repoAttr.value : "?";
      const seenBranch = branchAttr?.type === "str" ? branchAttr.value : "?";
      const matched = seenRepo === repoId && seenBranch === branch;
      onEvent({
        id: nextId++,
        time: Date.now(),
        kind,
        matched,
        detail: matched ? `new ${kind} on ${repoId}@${branch}` : `ignored ${kind} on ${seenRepo}@${seenBranch}`,
      });
    } catch {
      // Entity may have already expired or been superseded between the
      // event and this read — not an error worth surfacing.
    } finally {
      busy = false;
      void drain();
    }
  }

  function enqueue(entityKey: string, owner: string) {
    if (stopped || owner.toLowerCase() !== ownerAddress.toLowerCase()) return;
    if (pending.size >= 32 && !pending.has(entityKey)) return;
    pending.add(entityKey);
    void drain();
  }

  const unwatch = getWsClient().watchEntityEvents({
    onEntityCreated: (event) => enqueue(event.entityKey, event.owner),
    onError: (error) => console.error("[arkiv-live] watcher error", error),
    // No fromBlock — see module comment.
  });

  return () => {
    stopped = true;
    pending.clear();
    unwatch();
  };
}

// The "Live on Arkiv" block ticker, pushed over a WebSocket instead of
// polling an API route on an interval. watchBlockNumber is a plain viem
// action outside the Arkiv SDK's narrowed public-client type (even though
// Tiramisu supports it), so this uses a plain viem client for just this
// one subscription rather than casting the Arkiv client's type away.
let blockWatchClient: ReturnType<typeof createViemClient> | null = null;

function getBlockWatchClient() {
  if (!blockWatchClient) {
    blockWatchClient = createViemClient({ chain: tiramisu, transport: webSocket(WS_URL) });
  }
  return blockWatchClient;
}

export function watchLiveBlockNumber(onBlock: (n: bigint) => void, onError?: (error: Error) => void): () => void {
  return getBlockWatchClient().watchBlockNumber({
    onBlockNumber: onBlock,
    onError: (error) => onError?.(error),
  });
}
