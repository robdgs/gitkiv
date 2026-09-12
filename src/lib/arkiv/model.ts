// ------------------------------------------------------------------
// Arkiv entity model for git-on-arkiv (ETHRome Mission 01: Decommission)
//
// The split that decides everything: ATTRIBUTES are what the compound
// query in getCommitsFromArkiv() filters on — repoId + branch, optionally
// narrowed by author. PAYLOAD is everything else (message, hash, the
// parent link, the timestamp): free to read, never scanned to answer
// "give me the commits for repo X on branch Y by author Z".
//
// Actual source code / diffs are deliberately NOT modeled here — those
// are out of scope for this Arkiv migration (Swarm, later).
// ------------------------------------------------------------------
import { ExpirationTime, jsonToPayload, type PublicArkivClient } from "@arkiv-network/sdk";
import { str } from "@arkiv-network/sdk/attr";
import { eq, type Expression } from "@arkiv-network/sdk/query";
import type { Repo, Commit, BranchLock, Branch } from "@/lib/types";

// A long-lived demo lifetime. Mission 01 is about the read path, not
// expiration (that's Mission 02) — these entities should outlive the demo.
const ENTITY_LIFETIME = ExpirationTime.fromDays(30);

// Mission 02 (Built to expire): the caller picks an exact lock duration
// (days/hours/minutes/seconds in the UI, composed into total seconds).
// Blocks are ~2s on Tiramisu, so the block count here is an estimate — the
// receipt's applied expiry block is the exact truth, not this arithmetic.
// Bounds are enforced server-side (see clampLockSeconds) so a client can't
// request a lock so long it effectively breaks the branch, or so short
// (zero) that it does nothing.
const NOMINAL_BLOCK_SECONDS = 2;
export const MIN_LOCK_SECONDS = 2; // at least one block
export const MAX_LOCK_SECONDS = 7 * 24 * 60 * 60; // 7 days

export function clampLockSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_LOCK_SECONDS;
  return Math.min(MAX_LOCK_SECONDS, Math.max(MIN_LOCK_SECONDS, Math.round(seconds)));
}

function secondsToBlocks(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / NOMINAL_BLOCK_SECONDS));
}

// ---- repo entity -------------------------------------------------

export function repoEntity(repo: Repo) {
  return {
    attributes: {
      kind: str("repo"),
      repo_id: str(repo.id),
    },
    payload: jsonToPayload(repo),
    contentType: "application/json",
    expires: ENTITY_LIFETIME,
  };
}

export function reposQuery(client: PublicArkivClient) {
  return client
    .select({ payload: true })
    .where(eq("kind", str("repo")))
    .limit(50);
}

export function repoQuery(client: PublicArkivClient, repoId: string) {
  return client
    .select({ payload: true })
    .where(eq("kind", str("repo")), eq("repo_id", str(repoId)))
    .limit(1);
}

// ---- branch entity -------------------------------------------------
//
// Branches used to be a hardcoded two-item array in the UI. Making them
// real entities means anyone can create one, and the list on a repo page
// is an actual compound query (kind=branch, repo_id=X), not a constant.

export function branchEntity(branch: Branch) {
  return {
    attributes: {
      kind: str("branch"),
      repo_id: str(branch.repoId),
      name: str(branch.name),
    },
    payload: jsonToPayload(branch),
    contentType: "application/json",
    expires: ENTITY_LIFETIME,
  };
}

export function branchesQuery(client: PublicArkivClient, repoId: string) {
  return client
    .select({ payload: true })
    .where(eq("kind", str("branch")), eq("repo_id", str(repoId)))
    .limit(50);
}

export function branchQuery(client: PublicArkivClient, repoId: string, name: string) {
  return client
    .select({ payload: true })
    .where(eq("kind", str("branch")), eq("repo_id", str(repoId)), eq("name", str(name)))
    .limit(1);
}

// ---- commit entity -------------------------------------------------

export function commitEntity(commit: Commit) {
  return {
    attributes: {
      kind: str("commit"),
      repo_id: str(commit.repoId),
      branch: str(commit.branch),
      author: str(commit.author),
    },
    payload: jsonToPayload(commit),
    contentType: "application/json",
    expires: ENTITY_LIFETIME,
  };
}

// Every commit in a repo regardless of branch — used only to derive a
// branch list for repos created before branch entities existed (see
// getBranchesFromArkiv's legacy fallback), never as a read path of its own.
export function repoCommitsQuery(client: PublicArkivClient, repoId: string) {
  return client
    .select({ payload: true })
    .where(eq("kind", str("commit")), eq("repo_id", str(repoId)))
    .limit(200);
}

// The compound filter Mission 01 asks for: (repoId, branch), optionally
// narrowed by author — never a single-attribute scan over every commit.
// `key` is selected alongside the payload (not just here for reading) so a
// caller can also patch these entities in place — see
// moveBranchCommitsOnArkiv, which reassigns a merged branch's commits onto
// their target branch by entity key rather than recreating them.
export function commitsQuery(client: PublicArkivClient, repoId: string, branch: string, author?: string) {
  const filters: Expression[] = [
    eq("kind", str("commit")),
    eq("repo_id", str(repoId)),
    eq("branch", str(branch)),
  ];
  if (author) filters.push(eq("author", str(author)));

  return client.select({ payload: true, key: true }).where(filters).limit(100);
}

// ---- branch lock entity (Mission 02: Built to expire) --------------
//
// A "someone is committing here" reservation. It is created once with a
// short ExpirationTime.fromBlocks(...) lifetime and never patched or
// deleted by this app. While it's queryable, the UI blocks new commits
// on that branch; once its expiry block arrives, the protocol drops it
// from every query on its own and the UI unblocks — that state change is
// the entire feature.

export function lockEntity(lock: BranchLock, durationSeconds: number) {
  return {
    attributes: {
      kind: str("lock"),
      repo_id: str(lock.repoId),
      branch: str(lock.branch),
    },
    payload: jsonToPayload(lock),
    contentType: "application/json",
    expires: ExpirationTime.fromBlocks(secondsToBlocks(clampLockSeconds(durationSeconds))),
  };
}

export function lockQuery(client: PublicArkivClient, repoId: string, branch: string) {
  return client
    .select({ payload: true, expiresAt: true })
    .where(eq("kind", str("lock")), eq("repo_id", str(repoId)), eq("branch", str(branch)))
    .limit(1);
}

// ---- star count entity -----------------------------------------------
//
// The first entity in this app that gets *patched* rather than only ever
// created — everything else (repos, commits, branches, locks) is create-
// once. Starring an existing counter rewrites its payload in place via
// `patchEntity`; the entity key never changes.

export function starCountEntity(repoId: string, count: number) {
  return {
    attributes: {
      kind: str("star_count"),
      repo_id: str(repoId),
    },
    payload: jsonToPayload({ count }),
    contentType: "application/json",
    expires: ENTITY_LIFETIME,
  };
}

export function starCountQuery(client: PublicArkivClient, repoId: string) {
  return client
    .select({ key: true, payload: true })
    .where(eq("kind", str("star_count")), eq("repo_id", str(repoId)))
    .limit(1);
}

// For the homepage's "Starred repositories" section — every star counter
// at once, single-attribute (kind only) since there's no repoId to narrow
// by yet at this point; attributes are selected too because the payload
// alone (just {count}) doesn't say which repo it belongs to.
export function allStarCountsQuery(client: PublicArkivClient) {
  return client
    .select({ payload: true, attributes: true })
    .where(eq("kind", str("star_count")))
    .limit(50);
}
