// Server-only write path. Imported only from API routes (route.ts always
// runs server-side in the Next.js app router), so ARKIV_PRIVATE_KEY never
// reaches the browser bundle.
import { createWalletClient, jsonToPayload } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Repo, Commit, BranchLock } from "@/lib/types";
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

// Latest commit on this branch, used as the new commit's parent — same
// compound (repoId, branch) query the read path uses, just unfiltered by
// author and read for its newest entity.
export async function getLatestCommitHash(repoId: string, branch: string): Promise<string | null> {
  const readClient = getArkivClient();
  const page = await commitsQuery(readClient, repoId, branch).fetch();
  const latest = page.entities[0]?.toJson() as Commit | undefined;
  return latest?.hash ?? null;
}
