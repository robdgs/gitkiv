# gitkiv

**Git-style commit history, read straight from Arkiv. File contents on Swarm.**

A hackathon build for **ETHRome** exploring what a GitHub-like tool looks like when
the metadata layer is a blockchain-backed entity store (Arkiv) instead of Postgres,
and file storage is content-addressed (Swarm) instead of a blob bucket.

- **No SQL database, ever.** Repos, branches, commits, locks, and stars are all
  Arkiv entities, queried live on every request.
- **No source code on Arkiv.** Commits are metadata pointers; an attached file's
  actual bytes live on Swarm, referenced by hash.
- **Two pages.** A repo list and a repo detail page. That's the whole app.

---

## Why this exists

This is a submission built around three of Arkiv's ETHRome "missions," each a
concrete lesson about the platform rather than a bolted-on feature:

| Mission | What it means here |
|---|---|
| **01 — Decommission** | Replace a SQLite baseline with Arkiv as the only datastore. The core lesson: **attributes vs. payload**. Attributes (`repo_id`, `branch`, `author`, `kind`) are typed and queryable — `getCommitsFromArkiv` is a real compound filter on `(repo_id, branch[, author])`, not an application-side scan. Payload (`jsonToPayload`) is everything else — free-form, never filtered on. |
| **02 — Built to expire** | Branch locks are entities created with a block-based `ExpirationTime`. Nothing in this app ever deletes a lock — it simply stops being returned by Arkiv's query once its expiry block passes, and the UI reacts to that on its own. |
| **03 — Live Wire** | The commit feed on a repo page is a real WebSocket subscription (`watchEntityEvents`), not polling. See [Notes on the Arkiv SDK](#notes-on-the-arkiv-sdk-things-that-surprised-me) for the one thing that *doesn't* work over the same connection. |

---

## Features

- **Repositories, branches, commits** — all real Arkiv entities. Branches are
  either explicit entities or derived from commit history (unioned, so older
  repos don't lose branches when a newer one gets a real entity).
- **Branch locks** with a duration you actually pick — four `<select>`s
  (days / hours / minutes / seconds), composed into an exact block-based
  expiry. While a lock is active, new commits and merges on that branch are
  refused server-side, not just hidden in the UI.
- **Merges** — a real commit on the target branch with a second parent pointer
  (`mergedFromBranch` / `mergedFromHash`), and every commit currently on the
  source branch is reassigned onto the target branch afterward (patched in
  place, same entity key) so the merged branch doesn't keep showing commits
  that now belong to the target.
- **Stars** — the app's first *patched* entity (mutate-in-place via
  `patchEntity`) rather than create-once. A "Starred repositories" section
  on the homepage, sorted by count.
- **File attachments on Swarm** via [Swarm ID](https://github.com/snahacz/swarm-id) —
  identity, signing, and postage-stamp handling happen inside an iframe;
  this app never sees a private key or a postage batch ID.
  - **Conditional-disclosure encryption** (`actUploadData`): encrypt a file
    for a specific list of grantee public keys via Swarm's Access Control
    Trie. Only listed grantees (and the uploader) can ever decrypt it — this
    app never holds the key.
  - **Folder uploads**: attach a whole build output (`dist/`, `build/`), not
    just one file. Built by hand with `bee-js`'s `MantarayNode` since Swarm
    ID's client has no folder-upload method of its own — see
    [Folder uploads](#folder-uploads-how-and-why) below.
- **Live activity feed** — a WebSocket subscription to Arkiv, filtered to
  this app's own writer address, reporting new commits/locks on the repo and
  branch currently being viewed.
- **On-chain proof, not a mock** — every write shows its real tx hash and a
  link to the Tiramisu block explorer; a status card polls live chain height.

---

## Architecture

```
Browser  ──(reads)──>  Arkiv public RPC (viem-based client, no key needed)
Browser  ──(writes)──> Next.js API routes ──> Arkiv (server-side signing key)
Browser  ──(files)──>  Swarm ID iframe ──> Swarm/Bee network (key never leaves iframe)
```

- **Reads never touch a server-held key.** `src/lib/arkiv/read.ts` builds a
  plain public client (`src/lib/arkiv/client.ts`) and queries Arkiv directly
  from Server Components on every request (`export const dynamic =
  "force-dynamic"` — no build-time snapshot).
- **Writes go through API routes.** `src/lib/arkiv/write.ts` is imported only
  from `route.ts` files, so `ARKIV_PRIVATE_KEY` never reaches the browser
  bundle. Every write function re-checks its own invariants server-side
  (repo exists, branch isn't locked, etc.) rather than trusting the client.
- **File content never touches this server at all.** Swarm ID's client runs
  entirely in the browser; uploads/downloads go straight from the browser to
  Swarm. The app only ever stores the resulting reference (a hash) as a
  string on the commit entity.

### Entity model (`src/lib/arkiv/model.ts`)

| Entity | Queryable attributes | Payload |
|---|---|---|
| `repo` | `kind`, `repo_id` | full `Repo` object |
| `branch` | `kind`, `repo_id`, `name` | full `Branch` object |
| `commit` | `kind`, `repo_id`, `branch`, `author` | full `Commit` object (message, hash, parent, file refs) |
| `lock` | `kind`, `repo_id`, `branch` | `BranchLock`, with a block-based `ExpirationTime` |
| `star_count` | `kind`, `repo_id` | `{ count }` — patched in place |

### Project structure

```
src/
  app/
    page.tsx                     homepage: repo list + starred repos
    layout.tsx                   header, status card, global styles
    new-repo-form.tsx
    arkiv-status-card.tsx        polls /api/status for a live block ticker
    api/
      repos, commits, branches, locks, merges, stars, status/route.ts
    repo/[...slug]/
      page.tsx                   repo detail: branches, lock panel, commits
      branch-switcher.tsx
      branch-lock-panel.tsx
      merge-branch-panel.tsx
      new-commit-form.tsx        commit form + Swarm file/folder attach
      commit-file-link.tsx       download/view an attached file or folder
      live-feed.tsx              WebSocket activity feed (Mission 03)
      star-button.tsx
      swarm-activity-log.tsx     visible log of every real Swarm SDK call
  lib/
    types.ts                     Repo / Branch / Commit / BranchLock
    swarm-id.ts                  Swarm ID hook: upload/download/ACT/folder
    arkiv/
      client.ts                  public (keyless) Arkiv client
      model.ts                   entity + query builders
      read.ts                    all reads (Server Components + API GETs)
      write.ts                   all writes (API routes only, server-side key)
      live.ts                    Mission 03 WebSocket subscription
scripts/
  arkiv-wallet.ts                generate a local throwaway signing key
  arkiv-seed.ts                  seed demo repos/commits onto Tiramisu
```

---

## Getting started

```bash
npm install
```

### 1. Generate a signing key (for writes)

Reads work with no configuration — the app queries Arkiv's public RPC directly.
Writes (creating a repo, commit, branch, lock, merge, or star) need a funded
key on the server side:

```bash
npm run arkiv:wallet
```

This writes `ARKIV_PRIVATE_KEY` and `ARKIV_ADDRESS` to a git-ignored `.env`.
**Never commit `.env` or paste a private key into chat/logs** — treat any key
that leaves this flow as compromised.

Fund the printed address with test GLM from the
[Arkiv faucet](https://hub.arkiv.network/faucet).

### 2. (Optional) Seed some demo data

```bash
ARKIV_ALLOW_WRITE=1 npm run arkiv:seed
```

### 3. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Required for | Notes |
|---|---|---|
| `ARKIV_PRIVATE_KEY` | any write (commit, branch, lock, merge, star, new repo) | server-only; generated by `npm run arkiv:wallet`. `0x` + 64 hex chars. |
| `ARKIV_ADDRESS` | — | informational; written alongside the key, used by the seed script's sanity check. |
| `ARKIV_ALLOW_WRITE=1` | `npm run arkiv:seed` | a deliberate guard so seeding never runs by accident. |

Swarm/file uploads need **no environment variable at all** — identity and
postage-stamp handling happen entirely client-side via the Swarm ID iframe.

---

## Chain details

| | |
|---|---|
| Network | Arkiv **Tiramisu** testnet |
| Chain ID | `7738577` |
| RPC | `https://rpc.tiramisu.db-chain.testnet.arkiv.network` |
| WebSocket | `wss://rpc.tiramisu.db-chain.testnet.arkiv.network` |
| Explorer | `https://tiramisu.explorer.arkiv.network` |
| Block time | ~2s (nominal — lock durations are computed from this, then enforced against the *actual* applied expiry block, not the estimate) |

---

## Folder uploads: how and why

Swarm ID's client (`@snaha/swarm-id`) has `uploadFile`, `uploadData`, and
`uploadChunk` — no folder/collection method. A "folder" on Swarm is a
**Mantaray manifest**: a trie mapping paths (`index.html`, `assets/app.js`) to
content references, served by any Bee gateway at `/bzz/<root>/`.

`src/lib/swarm-id.ts`'s `uploadFolderToSwarm` builds one by hand:

1. Upload every file individually via `uploadData` → one reference per file.
2. Build a `MantarayNode` (from `@ethersphere/bee-js`) and `addFork` each
   file's relative path onto it, plus a `/` fork carrying
   `website-index-document: index.html` if one was found at the folder's
   top level (after dropping the picked folder's own name).
3. Serialize the tree bottom-up via `saveMantarayTreeRecursively` — **not**
   `saveMantarayTree`. The latter predicts each node's address by hashing it
   *locally* and discards whatever reference the actual upload call returns;
   if those ever disagree, the resulting root reference points at content
   that was never really stored under that address — an upload that reports
   success but 404s everywhere, forever. `saveMantarayTreeRecursively`
   uploads each node via the same `uploadData` call every plain file commit
   already uses, and trusts *that* result's reference instead.

**A folder is read back via a public Bee gateway
(`https://gateway.ethswarm.org/access/<ref>`), not through Swarm ID's own
client.** Swarm ID's `downloadFile()` walks a manifest one chunk-fetch at a
time (`loadMantarayTreeWithChunkAPI`), which turned out to be independently
flaky (intermittent 500s) even when the exact same content resolves cleanly
through a real gateway that resolves the manifest server-side in one request.
Every other file type in this app downloads through Swarm ID directly; folders
are the one deliberate exception.

Guardrails: 200 files / 15MB per folder, and `.git`/`node_modules`/`.env`/
`.next/cache` are always skipped — this is meant for a build output
(`dist/`, `build/`), not a whole repo.

---

## Notes on the Arkiv SDK (things that surprised me)

- **`watchBlockNumber` (the `newHeads` WebSocket subscription) never once
  delivered an update on Tiramisu**, confirmed repeatedly in isolation. The
  live block-height ticker (`arkiv-status-card.tsx`) polls `/api/status`
  every 4s instead. `watchEntityEvents` (the `logs` subscription used for
  the live commit feed) works reliably over the same connection — this
  seems to be a gap specific to the `newHeads` subscription on this endpoint,
  worth flagging to the Arkiv team rather than working around further.
- **`PublicArkivClient`'s TypeScript type is narrower than its runtime
  surface** — it's a curated `Pick<PublicActions, …>`, so some real methods
  need an explicit cast or a plain `viem` client to reach.
- **Branch derivation must union, not replace.** Early on, `getBranchesFromArkiv`
  used real branch entities *instead of* commit-derived names the moment any
  one real branch entity existed for a repo — which made every legacy branch
  (created before this feature shipped) vanish from the switcher. Fixed to
  always union both sources.

---

## Security notes

- No private key is ever handled in the browser or checked into the repo.
  `ARKIV_PRIVATE_KEY` is read only inside `src/lib/arkiv/write.ts`, imported
  only by server-side `route.ts` files.
- Swarm identity/signing/postage-stamp resolution happens inside the Swarm ID
  iframe (`swarm-id.snaha.net`) — this app's own code never sees a batch ID
  or a signing key for Swarm either.
- File encryption (ACT) is genuine conditional disclosure: the encryption
  key is never held by this app, so an unauthorized viewer gets a real
  decrypt failure, not a client-side "no."
