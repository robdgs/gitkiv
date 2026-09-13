// Server-only write path. Imported only from API routes (route.ts always
// runs server-side in the Next.js app router), so ARKIV_PRIVATE_KEY never
// reaches the browser bundle.
import { createWalletClient, jsonToPayload } from "@arkiv-network/sdk";
import { str } from "@arkiv-network/sdk/attr";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Repo, Commit, BranchLock, Issue, IssueStatus, ProfileReadme } from "@/lib/types";
import { getArkivClient } from "./client";
import {
  repoEntity,
  repoQuery,
  commitEntity,
  commitsQuery,
  lockEntity,
  lockQuery,
  MIN_LOCK_SECONDS,
  branchEntity,
  branchQuery,
  starCountEntity,
  starCountQuery,
  issueEntity,
  issuesQuery,
  issueQuery,
  profileReadmeEntity,
  profileReadmeQuery,
} from "./model";

const TIRAMISU_CHAIN_ID = 7738577;

export class ArkivWriteError extends Error {}

function getAccount() {
  const privateKey = process.env.ARKIV_PRIVATE_KEY;
  if (!privateKey || !/^0x[0-9a-f]{64}$/i.test(privateKey)) {
    throw new ArkivWriteError(
      "Server signing key is not configured. Set ARKIV_PRIVATE_KEY in .env (see scripts/arkiv-wallet.ts)."
    );
  }
  return privateKeyToAccount(privateKey as `0x${string}`);
}

// Public info, not a secret: every entity this app creates already shows
// this address on-chain. Exposed so the browser-side live watcher
// (Mission 03) can filter the shared Tiramisu event stream down to just
// this app's writes before reading anything.
export function getWriterAddress(): string | null {
  try {
    return getAccount().address;
  } catch {
    return null;
  }
}

async function requireFundedSigner() {
  const readClient = getArkivClient();

  const chainId = await readClient.getChainId();
  if (chainId !== TIRAMISU_CHAIN_ID) {
    throw new ArkivWriteError(`Expected Tiramisu (${TIRAMISU_CHAIN_ID}), got ${chainId}.`);
  }

  const account = getAccount();
  const balance = await readClient.getBalance({ address: account.address });
  if (balance === BigInt(0)) {
    throw new ArkivWriteError(
      `Signing wallet ${account.address} has no test GLM. Fund it: https://hub.arkiv.network/faucet`
    );
  }

  return createWalletClient({ chain: tiramisu, account, transport: http() });
}

export async function createRepoOnArkiv(repo: Repo) {
  const readClient = getArkivClient();

  const existing = await repoQuery(readClient, repo.id).fetch();
  if (existing.entities.length > 0) {
    throw new ArkivWriteError(`Repository "${repo.id}" already exists.`);
  }

  const walletClient = await requireFundedSigner();
  const result = await walletClient.createEntity(repoEntity(repo));
  // Every repo needs at least one real branch to be usable — create its
  // default one now rather than leaving branches to a hardcoded array.
  await walletClient.createEntity(branchEntity({ repoId: repo.id, name: repo.defaultBranch }));
  return result;
}

export async function createBranchOnArkiv(repoId: string, name: string) {
  const readClient = getArkivClient();

  const existingRepo = await repoQuery(readClient, repoId).fetch();
  if (existingRepo.entities.length === 0) {
    throw new ArkivWriteError(`Repository "${repoId}" does not exist.`);
  }

  const existingBranch = await branchQuery(readClient, repoId, name).fetch();
  if (existingBranch.entities.length > 0) {
    throw new ArkivWriteError(`Branch "${name}" already exists.`);
  }

  const walletClient = await requireFundedSigner();
  return walletClient.createEntity(branchEntity({ repoId, name }));
}

export async function createCommitOnArkiv(commit: Commit) {
  const readClient = getArkivClient();

  const existingRepo = await repoQuery(readClient, commit.repoId).fetch();
  if (existingRepo.entities.length === 0) {
    throw new ArkivWriteError(`Repository "${commit.repoId}" does not exist.`);
  }

  // Mission 02's block is enforced here, not just hidden in the UI: as
  // long as a lock entity is still queryable, committing is refused. Once
  // it ages out of the query on its own, this check passes again.
  const activeLock = await lockQuery(readClient, commit.repoId, commit.branch).fetch();
  if (activeLock.entities.length > 0) {
    throw new ArkivWriteError(`Branch "${commit.branch}" is locked. Wait for the lock to expire.`);
  }

  const walletClient = await requireFundedSigner();
  return walletClient.createEntity(commitEntity(commit));
}

export async function createBranchLockOnArkiv(lock: BranchLock, durationSeconds: number = MIN_LOCK_SECONDS) {
  const readClient = getArkivClient();

  const existingRepo = await repoQuery(readClient, lock.repoId).fetch();
  if (existingRepo.entities.length === 0) {
    throw new ArkivWriteError(`Repository "${lock.repoId}" does not exist.`);
  }

  const existingLock = await lockQuery(readClient, lock.repoId, lock.branch).fetch();
  if (existingLock.entities.length > 0) {
    throw new ArkivWriteError(`Branch "${lock.branch}" is already locked. Wait for it to expire.`);
  }

  const walletClient = await requireFundedSigner();
  return walletClient.createEntity(lockEntity(lock, durationSeconds));
}

// The app's first patch (mutate-in-place) rather than a fresh create: the
// star counter's entity key never changes, only its payload does.
export async function starRepoOnArkiv(repoId: string) {
  const readClient = getArkivClient();

  const existingRepo = await repoQuery(readClient, repoId).fetch();
  if (existingRepo.entities.length === 0) {
    throw new ArkivWriteError(`Repository "${repoId}" does not exist.`);
  }

  const walletClient = await requireFundedSigner();
  const existing = await starCountQuery(readClient, repoId).fetch();
  const entity = existing.entities[0];

  if (!entity) {
    const result = await walletClient.createEntity(starCountEntity(repoId, 1));
    return { count: 1, entityKey: result.entityKey, txHash: result.txHash };
  }

  const current = (entity.toJson() as { count: number }).count ?? 0;
  const count = current + 1;
  const result = await walletClient.patchEntity({
    entityKey: entity.key,
    payload: jsonToPayload({ count }),
    contentType: "application/json",
  });
  return { count, entityKey: result.entityKey, txHash: result.txHash };
}

// After a merge, the source branch's commits shouldn't linger there too —
// the work now lives on the target branch, same as the merge commit
// itself. This reassigns each one's `branch` attribute (and the mirrored
// field inside its payload) to the target branch, in place: same entity
// key, same hash/author/timestamp, just no longer answering the source
// branch's compound query.
export async function moveBranchCommitsOnArkiv(repoId: string, fromBranch: string, toBranch: string) {
  const readClient = getArkivClient();
  const page = await commitsQuery(readClient, repoId, fromBranch).fetch();
  if (page.entities.length === 0) return;

  const walletClient = await requireFundedSigner();
  for (const entity of page.entities) {
    const commit = entity.toJson() as Commit;
    await walletClient.patchEntity({
      entityKey: entity.key,
      set: { branch: str(toBranch) },
      payload: jsonToPayload({ ...commit, branch: toBranch }),
      contentType: "application/json",
    });
  }
}

// Latest commit on this branch, used as the new commit's parent — same
// compound (repoId, branch) query the read path uses, just unfiltered by
// author and read for its newest entity.
export async function getLatestCommitHash(repoId: string, branch: string): Promise<string | null> {
  const readClient = getArkivClient();
  const page = await commitsQuery(readClient, repoId, branch).fetch();
  const latest = page.entities[0]?.toJson() as Commit | undefined;
  return latest?.hash ?? null;
}

// Issue numbers are repo-scoped and assigned here, not by the caller: the
// next number is one past however many issues already exist on this repo.
// Good enough for a demo — like the rest of this app's writes, there's no
// concurrency lock, so two issues filed in the same instant could in
// principle race for the same number. A real product would need a
// dedicated counter entity (patched atomically) to close that gap.
export async function createIssueOnArkiv(repoId: string, title: string, body: string, author: string) {
  const readClient = getArkivClient();

  const existingRepo = await repoQuery(readClient, repoId).fetch();
  if (existingRepo.entities.length === 0) {
    throw new ArkivWriteError(`Repository "${repoId}" does not exist.`);
  }

  const existingIssues = await issuesQuery(readClient, repoId).fetch();
  const number = existingIssues.entities.length + 1;

  const issue: Issue = {
    repoId,
    number,
    title: title.trim().slice(0, 120),
    body: body.trim().slice(0, 2000),
    author: author.trim().slice(0, 60),
    status: "open",
    createdAt: Math.floor(Date.now() / 1000),
    closedAt: null,
  };

  const walletClient = await requireFundedSigner();
  const result = await walletClient.createEntity(issueEntity(issue));
  return { issue, entityKey: result.entityKey, txHash: result.txHash };
}

// Close or reopen: patches both the queryable `status` attribute (so
// "open issues" queries pick up the change) and the payload (so a read
// doesn't show a stale status next to the up-to-date attribute).
export async function setIssueStatusOnArkiv(repoId: string, number: number, status: IssueStatus) {
  const readClient = getArkivClient();

  const existing = await issueQuery(readClient, repoId, number).fetch();
  const entity = existing.entities[0];
  if (!entity) {
    throw new ArkivWriteError(`Issue #${number} on "${repoId}" does not exist.`);
  }

  const current = entity.toJson() as Issue;
  const updated: Issue = {
    ...current,
    status,
    closedAt: status === "closed" ? Math.floor(Date.now() / 1000) : null,
  };

  const walletClient = await requireFundedSigner();
  const result = await walletClient.patchEntity({
    entityKey: entity.key,
    set: { status: str(status) },
    payload: jsonToPayload(updated),
    contentType: "application/json",
  });
  return { issue: updated, entityKey: result.entityKey, txHash: result.txHash };
}

// Create-if-absent, else patch — same singleton pattern as the star
// counter, just with no repo_id to key on since there's only ever one of
// these. Rendering sanitizes the markdown (see profile-readme.tsx); this
// only bounds its size.
export async function setProfileReadmeOnArkiv(markdown: string) {
  const readClient = getArkivClient();
  const walletClient = await requireFundedSigner();

  const readme: ProfileReadme = { markdown, updatedAt: Math.floor(Date.now() / 1000) };
  const existing = await profileReadmeQuery(readClient).fetch();
  const entity = existing.entities[0];

  if (!entity) {
    const result = await walletClient.createEntity(profileReadmeEntity(readme));
    return { readme, entityKey: result.entityKey, txHash: result.txHash };
  }

  const result = await walletClient.patchEntity({
    entityKey: entity.key,
    payload: jsonToPayload(readme),
    contentType: "application/json",
  });
  return { readme, entityKey: result.entityKey, txHash: result.txHash };
}
