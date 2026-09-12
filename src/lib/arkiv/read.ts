// MIGRATION TARGET reached: this replaces src/lib/db.ts (sqlite baseline).
// Same exported shapes (Repo[], Commit[]) so call sites don't change beyond
// the import. The read path below never touches sqlite, a subgraph, Ponder
// or a Postgres pipeline — only Arkiv's public RPC.
import type { Repo, Commit, BranchLock } from "@/lib/types";
import { getArkivClient } from "./client";
import { reposQuery, repoQuery, commitsQuery, lockQuery } from "./model";

export type ActiveLock = BranchLock & { expiresAt: bigint };

// Mission 02: this query is the whole feature. While a lock entity is
// still within its lifetime, it comes back here. Once its expiry block
// passes, Arkiv stops returning it — nothing in this app deletes it.
export async function getActiveLock(repoId: string, branch: string): Promise<ActiveLock | null> {
  const client = getArkivClient();
  const page = await lockQuery(client, repoId, branch).fetch();
  const entity = page.entities[0];
  if (!entity) return null;
  const lock = entity.toJson() as BranchLock;
  return { ...lock, expiresAt: entity.expiresAt };
}

export type ArkivStatus = {
  chainId: number;
  currentBlock: bigint;
  currentBlockTime: number; // unix seconds
  blockDuration: number; // seconds per block
};

// Proof of life: a fresh chain read on every request, not a cached badge.
export async function getArkivStatus(): Promise<ArkivStatus> {
  const client = getArkivClient();
  const [chainId, timing] = await Promise.all([client.getChainId(), client.getBlockTiming()]);
  return {
    chainId,
    currentBlock: timing.currentBlock,
    currentBlockTime: timing.currentBlockTime,
    blockDuration: timing.blockDuration,
  };
}

export async function getReposFromArkiv(): Promise<Repo[]> {
  const client = getArkivClient();
  const page = await reposQuery(client).fetch();
  return page.entities
    .map((entity) => entity.toJson() as Repo)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function getRepoFromArkiv(id: string): Promise<Repo | undefined> {
  const client = getArkivClient();
  const page = await repoQuery(client, id).fetch();
  const entity = page.entities[0];
  return entity ? (entity.toJson() as Repo) : undefined;
}

// This is the exact query Mission 01 targets: a compound filter on
// (repoId, branch), optionally narrowed by author — resolved entirely
// against Arkiv attributes, with the commit body served from payload.
export async function getCommitsFromArkiv(
  repoId: string,
  branch: string,
  author?: string
): Promise<Commit[]> {
  const client = getArkivClient();
  const page = await commitsQuery(client, repoId, branch, author).fetch();
  const commits = page.entities.map((entity) => entity.toJson() as Commit);
  return commits.sort((a, b) => b.timestamp - a.timestamp);
}
