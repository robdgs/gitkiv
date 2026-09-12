// Populates Arkiv (Tiramisu testnet) with the repo + commit entities the
// app reads. Local signing only — the key never leaves this process, and
// this script is the only place in the project that writes to Arkiv.
//
// Usage:
//   npx tsx scripts/arkiv-wallet.ts     # once, to generate + save a local key
//   # fund the printed address at https://hub.arkiv.network/faucet
//   ARKIV_ALLOW_WRITE=1 npx tsx scripts/arkiv-seed.ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { repoEntity, commitEntity, reposQuery, commitsQuery } from "../src/lib/arkiv/model";
import type { Repo, Commit } from "../src/lib/types";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env yet, or already loaded by the caller — fall through and let
  // the checks below report exactly what's missing.
}

const TIRAMISU_CHAIN_ID = 7738577;

const REPOS: Repo[] = [
  { id: "arkiv/hackathon-demo", owner: "arkiv", name: "hackathon-demo", defaultBranch: "main", description: "ETHRome demo repo" },
  { id: "arkiv/git-on-chain", owner: "arkiv", name: "git-on-chain", defaultBranch: "main", description: "Git metadata stored as Arkiv entities" },
];

const COMMITS: Commit[] = [
  { hash: "a1b2c3d", repoId: "arkiv/hackathon-demo", branch: "main", author: "alice", parentHash: null, timestamp: 1893450000, message: "init: project scaffold" },
  { hash: "b2c3d4e", repoId: "arkiv/hackathon-demo", branch: "main", author: "bob", parentHash: "a1b2c3d", timestamp: 1893453600, message: "feat: add repo list page" },
  { hash: "c3d4e5f", repoId: "arkiv/hackathon-demo", branch: "feature/arkiv", author: "alice", parentHash: "b2c3d4e", timestamp: 1893457200, message: "wip: entity model for commits" },
  { hash: "d4e5f6a", repoId: "arkiv/hackathon-demo", branch: "feature/arkiv", author: "alice", parentHash: "c3d4e5f", timestamp: 1893460800, message: "feat: query commits via Arkiv compound filter" },
  { hash: "e5f6a7b", repoId: "arkiv/git-on-chain", branch: "main", author: "carol", parentHash: null, timestamp: 1893450600, message: "init: git-on-chain repo" },
  { hash: "f6a7b8c", repoId: "arkiv/git-on-chain", branch: "main", author: "bob", parentHash: "e5f6a7b", timestamp: 1893454200, message: "docs: describe attribute/payload split" },
];

async function main() {
  if (process.env.ARKIV_ALLOW_WRITE !== "1") {
    throw new Error("Set ARKIV_ALLOW_WRITE=1 to run this authorized seed.");
  }
  const privateKey = process.env.ARKIV_PRIVATE_KEY;
  if (!privateKey || !/^0x[0-9a-f]{64}$/i.test(privateKey)) {
    throw new Error("ARKIV_PRIVATE_KEY missing/invalid. Run `npx tsx scripts/arkiv-wallet.ts` first.");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  if (process.env.ARKIV_ADDRESS && account.address !== process.env.ARKIV_ADDRESS) {
    throw new Error("ARKIV_ADDRESS does not match the account derived from ARKIV_PRIVATE_KEY.");
  }

  const publicClient = createPublicClient({ chain: tiramisu, transport: http() });
  const chainId = await publicClient.getChainId();
  if (chainId !== TIRAMISU_CHAIN_ID) throw new Error(`Expected Tiramisu (${TIRAMISU_CHAIN_ID}), got ${chainId}`);

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === BigInt(0)) {
    throw new Error(
      `Wallet ${account.address} has zero balance. Fund it: https://hub.arkiv.network/faucet`
    );
  }
  console.log(`Signing as ${account.address} (balance: ${balance} wei)`);

  const walletClient = createWalletClient({ chain: tiramisu, account, transport: http() });

  const receipts: Record<string, unknown> = {};

  for (const repo of REPOS) {
    const result = await walletClient.createEntity(repoEntity(repo));
    console.log(`repo   ${repo.id.padEnd(28)} -> entity ${result.entityKey} (tx ${result.txHash})`);
    receipts[`repo:${repo.id}`] = { ...result, expiresAt: result.expiresAt.toString() };
  }

  for (const commit of COMMITS) {
    const result = await walletClient.createEntity(commitEntity(commit));
    console.log(`commit ${commit.hash} (${commit.repoId} @ ${commit.branch}) -> entity ${result.entityKey} (tx ${result.txHash})`);
    receipts[`commit:${commit.hash}`] = { ...result, expiresAt: result.expiresAt.toString() };
  }

  if (!existsSync("arkiv")) mkdirSync("arkiv");
  writeFileSync("arkiv/receipts.json", JSON.stringify(receipts, null, 2));
  console.log(`\nWrote arkiv/receipts.json (public tx hashes + entity keys — safe to commit).`);

  // Verify through the exact same public queries the app's read path uses.
  const repoPage = await reposQuery(publicClient).fetch();
  console.log(`\nVerify: reposQuery() found ${repoPage.entities.length} repo entities.`);

  const commitPage = await commitsQuery(publicClient, "arkiv/hackathon-demo", "feature/arkiv").fetch();
  console.log(
    `Verify: commitsQuery(hackathon-demo, feature/arkiv) found ${commitPage.entities.length} commits ` +
      `(expected 2).`
  );
}

main().catch((error) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
