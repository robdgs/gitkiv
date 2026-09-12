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
import type { Repo, Commit, BranchLock } from "@/lib/types";

// A long-lived demo lifetime. Mission 01 is about the read path, not
// expiration (that's Mission 02) — these entities should outlive the demo.
const ENTITY_LIFETIME = ExpirationTime.fromDays(30);

// Mission 02 (Built to expire): short enough to watch expire live in a
// demo (~2s/block on Tiramisu), overridable for a faster or slower demo.
export const LOCK_LIFETIME_BLOCKS = Number(process.env.ARKIV_LOCK_BLOCKS ?? 20);

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

// The compound filter Mission 01 asks for: (repoId, branch), optionally
// narrowed by author — never a single-attribute scan over every commit.
export function commitsQuery(client: PublicArkivClient, repoId: string, branch: string, author?: string) {
  const filters: Expression[] = [
    eq("kind", str("commit")),
    eq("repo_id", str(repoId)),
    eq("branch", str(branch)),
  ];
  if (author) filters.push(eq("author", str(author)));

  return client.select({ payload: true }).where(filters).limit(100);
}

// ---- branch lock entity (Mission 02: Built to expire) --------------
//
// A "someone is committing here" reservation. It is created once with a
// short ExpirationTime.fromBlocks(...) lifetime and never patched or
// deleted by this app. While it's queryable, the UI blocks new commits
// on that branch; once its expiry block arrives, the protocol drops it
// from every query on its own and the UI unblocks — that state change is
// the entire feature.

export function lockEntity(lock: BranchLock) {
  return {
    attributes: {
      kind: str("lock"),
      repo_id: str(lock.repoId),
      branch: str(lock.branch),
    },
    payload: jsonToPayload(lock),
    contentType: "application/json",
    expires: ExpirationTime.fromBlocks(LOCK_LIFETIME_BLOCKS),
  };
}

export function lockQuery(client: PublicArkivClient, repoId: string, branch: string) {
  return client
    .select({ payload: true, expiresAt: true })
    .where(eq("kind", str("lock")), eq("repo_id", str(repoId)), eq("branch", str(branch)))
    .limit(1);
}
