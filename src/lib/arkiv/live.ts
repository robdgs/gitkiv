"use client";
// Mission 03 (Live wire): a real WebSocket subscription straight from the
// browser to Arkiv — no backend in this path either, consistent with the
// rest of the app. No `fromBlock` is ever passed to watchEntityEvents,
// which is what keeps it on the WebSocket transport instead of silently
// falling back to HTTP polling (see guides/events-and-expiration).
//
// The block-number ticker used to live here too (watchBlockNumber over the
// same connection), but that `newHeads` subscription never once delivered
// an update against this endpoint in testing — even alone, in a fresh tab
// — while this `logs` subscription (watchEntityEvents) works every time.
// That's an endpoint gap, not something worth retrying around, so the
// ticker (arkiv-status-card.tsx) polls instead.
import { createPublicClient, type PublicArkivClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { http, webSocket } from "viem";

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

// viem's WebSocket transport reports transport-level failures as a raw
// `Event` (no enumerable own properties, so `console.error(event)` prints
// `{}`), not always a real `Error`. It also reconnects on its own by
// default, so a lone report here is normal noise, not a stuck connection —
// hence `console.warn` rather than `console.error`, which Next's dev
// overlay treats as a blocking failure.
function formatWatchError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "type" in error) {
    return `transport ${(error as { type: string }).type} (reconnecting…)`;
  }
  return String(error);
}

export type ActivityEvent = {
  id: number;
  time: number;
  kind: "commit" | "lock";
  matched: boolean;
  detail: string;
};

// Module-scoped, not per-call: watchRepoActivity is re-invoked every time
// its caller's effect re-runs (branch switch, React Strict Mode's dev-only
// double-invoke, a remount), each time as a fresh function call. A counter
// declared inside that function would restart at 1 on every one of those,
// colliding with ids already sitting in the caller's still-mounted state
// from the previous instance — which is exactly the duplicate React key.
let nextActivityId = 1;

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
        id: nextActivityId++,
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
    onError: (error) => console.warn("[arkiv-live] watcher:", formatWatchError(error)),
    // No fromBlock — see module comment.
  });

  return () => {
    stopped = true;
    pending.clear();
    unwatch();
  };
}
