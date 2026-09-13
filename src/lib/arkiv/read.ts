// MIGRATION TARGET reached: this replaces src/lib/db.ts (sqlite baseline).
// Same exported shapes (Repo[], Commit[]) so call sites don't change beyond
// the import. The read path below never touches sqlite, a subgraph, Ponder
// or a Postgres pipeline — only Arkiv's public RPC.
import type { Repo, Commit, BranchLock, Branch, Issue, IssueStatus, ProfileReadme, RepoReadme } from "@/lib/types";
import { getArkivClient } from "./client";
import {
  reposQuery,
  repoQuery,
  commitsQuery,
  lockQuery,
  branchesQuery,
  starCountQuery,
  allStarCountsQuery,
  repoCommitsQuery,
  issuesQuery,
  profileReadmeQuery,
  repoReadmeQuery,
} from "./model";

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

// Real entities now, not a hardcoded array — unioned with any branch name
// that already appears in commit history but predates branches having
// their own entity (a repo created before this feature shipped). Deriving
// only when the entity list was empty would make that union disappear the
// moment any *one* real branch entity exists, hiding every other legacy
// branch from the switcher even though its commits are still there. A repo
// with neither branch entities nor commits yet legitimately has an empty
// list; the call site falls back to the repo's defaultBranch for that case.
export async function getBranchesFromArkiv(repoId: string): Promise<Branch[]> {
  const client = getArkivClient();
  const [branchPage, commitsPage] = await Promise.all([
    branchesQuery(client, repoId).fetch(),
    repoCommitsQuery(client, repoId).fetch(),
  ]);
  const names = new Set<string>();
  for (const entity of branchPage.entities) names.add((entity.toJson() as Branch).name);
  for (const entity of commitsPage.entities) names.add((entity.toJson() as Commit).branch);
  return [...names].sort().map((name) => ({ repoId, name }));
}

export async function getStarCount(repoId: string): Promise<number> {
  const client = getArkivClient();
  const page = await starCountQuery(client, repoId).fetch();
  const entity = page.entities[0];
  if (!entity) return 0;
  const data = entity.toJson() as { count: number };
  return data.count ?? 0;
}

export type RepoStars = { repoId: string; count: number };

// For the homepage's "Starred repositories" section. repoId comes from the
// attribute (always present) rather than the payload (which is just
// {count} — the entity doesn't repeat its own repo_id inside itself).
export async function getAllStarCounts(): Promise<RepoStars[]> {
  const client = getArkivClient();
  const page = await allStarCountsQuery(client).fetch();
  const results: RepoStars[] = [];
  for (const entity of page.entities) {
    const repoAttr = entity.attributes.repo_id;
    if (repoAttr?.type !== "str") continue;
    const data = entity.toJson() as { count: number };
    results.push({ repoId: repoAttr.value, count: data.count ?? 0 });
  }
  return results;
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

export type IssueWithKey = Issue & { entityKey: string };

// `status` is optional so the issues panel can ask for just "open" or
// "closed" — a real compound filter, not a full fetch filtered client-side.
// Each issue carries its own entity key (see issuesQuery) so the UI can
// link every row to its own verifiable history, not just whichever one
// was most recently created or closed.
export async function getIssuesFromArkiv(repoId: string, status?: IssueStatus): Promise<IssueWithKey[]> {
  const client = getArkivClient();
  const page = await issuesQuery(client, repoId, status).fetch();
  const issues = page.entities.map((entity) => ({ ...(entity.toJson() as Issue), entityKey: entity.key }));
  return issues.sort((a, b) => b.number - a.number);
}

// For the homepage's GitHub-style contribution graph: every commit across
// every repo (any branch), bucketed by calendar day. Scoped to the known
// repo list rather than a bare `kind=commit` query with no repo_id filter —
// this writer wallet is a shared testnet demo key also used by unrelated
// tools (see feedback.md), so an unscoped query risks pulling in
// "commit"-kind entities that have nothing to do with this app.
export async function getContributionCounts(days = 365): Promise<Map<string, number>> {
  const client = getArkivClient();
  const repos = await reposQuery(client).fetch();
  const repoIds = repos.entities.map((entity) => (entity.toJson() as Repo).id);
  const pages = await Promise.all(repoIds.map((id) => repoCommitsQuery(client, id).fetch()));

  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const entity of page.entities) {
      const commit = entity.toJson() as Commit;
      if (commit.timestamp < cutoff) continue;
      const day = new Date(commit.timestamp * 1000).toISOString().slice(0, 10);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }
  return counts;
}

export type ProfileReadmeWithKey = ProfileReadme & { entityKey: string };
export type RepoReadmeWithKey = RepoReadme & { entityKey: string };

// Carries its own entity key (see profileReadmeQuery) so the page can link
// straight to this entity's history on the explorer — a persistent proof
// this is a real Arkiv write, visible on every load, not just right after
// someone saves it.
export async function getProfileReadme(): Promise<ProfileReadmeWithKey | null> {
  const client = getArkivClient();
  const page = await profileReadmeQuery(client).fetch();
  const entity = page.entities[0];
  return entity ? { ...(entity.toJson() as ProfileReadme), entityKey: entity.key } : null;
}

export async function getRepoReadme(repoId: string): Promise<RepoReadmeWithKey | null> {
  const client = getArkivClient();
  const page = await repoReadmeQuery(client, repoId).fetch();
  const entity = page.entities[0];
  return entity ? { ...(entity.toJson() as RepoReadme), entityKey: entity.key } : null;
}
