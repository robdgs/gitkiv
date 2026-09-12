// Generates a throwaway Tiramisu (Arkiv testnet) signing key for local
// seeding only. Never run this against a wallet you use elsewhere.
// Usage: npx tsx scripts/arkiv-wallet.ts
import { existsSync, appendFileSync, readFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ENV_PATH = ".env";

const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
if (existing.includes("ARKIV_PRIVATE_KEY=")) {
  const address = existing.match(/ARKIV_ADDRESS=(\S+)/)?.[1];
  console.log(`.env already has ARKIV_PRIVATE_KEY set (address ${address ?? "unknown"}).`);
  console.log("Delete that line first if you really want a new throwaway key.");
  process.exit(0);
}

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

appendFileSync(
  ENV_PATH,
  `\nARKIV_PRIVATE_KEY=${privateKey}\nARKIV_ADDRESS=${account.address}\n`
);

console.log(`Generated a new local Tiramisu signing key.`);
console.log(`Address:  ${account.address}`);
console.log(`Saved to: ${ENV_PATH} (git-ignored — never commit this file)`);
console.log(``);
console.log(`Fund it with test GLM before seeding:`);
console.log(`  https://hub.arkiv.network/faucet`);
console.log(`(paste the address above; wallet sign-in + captcha are on you)`);
