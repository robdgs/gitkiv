# How this app implements Swarm ID

A walkthrough of `src/lib/swarm-id.ts` — the only file in this project that
talks to Swarm — for anyone integrating [`@snaha/swarm-id`](https://github.com/snahacz/swarm-id)
into their own Next.js app, or picking this codebase back up later.

**The one rule that matters:** this app never sees a private key or a
postage-stamp ID for Swarm. Identity, signing, and stamp resolution all
happen inside an iframe Swarm ID controls (`swarm-id.snaha.net`). Everything
below is built to preserve that — every workaround here exists to keep the
iframe boundary intact, not to work around it.

---

## 1. The SSR trap, and the fix

`@snaha/swarm-id` touches `window` at **module-evaluation time** — not just
when you call something, but the moment the module itself is imported. In a
Next.js App Router project, that's fatal: even a file marked `"use client"`
still gets pulled into the server-side module graph during the build/render
pass, and `window` doesn't exist there. A static top-level import crashes
the app before a single component renders.

The fix is a **dynamic `import()` inside a function**, never at the top of
the file:

```ts
// swarm-id.ts — top of file: only a TYPE import, which is erased at
// build time and never touches the runtime module graph.
import type { SwarmIdClient as SwarmIdClientType, ConnectionInfo } from "@snaha/swarm-id";

let client: SwarmIdClientType | null = null;

async function getClient(): Promise<SwarmIdClientType> {
  if (!client) {
    // Only evaluated when this function actually runs — after mount, in
    // the browser. Never during SSR's module graph pass.
    const { SwarmIdClient } = await import("@snaha/swarm-id");
    client = new SwarmIdClient({
      iframeOrigin: "https://swarm-id.snaha.net",
      metadata: { name: "gitkiv", description: "…" },
      onConnectionChange: (info) => { /* … */ },
    });
  }
  return client;
}
```

Same treatment applies to `@ethersphere/bee-js` (used for folder uploads,
§6) — its `MantarayNode` and the Mantaray-tree helpers are also loaded via
`await import(...)` inside functions, not statically.

**Rule of thumb:** if a package's own docs show a client instantiated at
module scope, and that package does anything with browser globals, assume
it needs this treatment in an App Router project.

---

## 2. One client, shared across every component

Swarm ID's client wraps a single iframe and a single authenticated session.
You don't want five components each spinning up their own iframe. So the
client, its connection info, and its init promise are **module-level
singletons** — not React state, not context:

```ts
let client: SwarmIdClientType | null = null;
let latestInfo: ConnectionInfo | null = null;
let initPromise: Promise<void> | null = null;
const infoListeners = new Set<() => void>();

function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = getClient()
      .then((c) => c.initialize())
      .then(() => { /* log success */ })
      .catch((err) => { /* log + rethrow */ throw err; });
  }
  return initPromise; // every caller awaits the SAME promise
}
```

Any component that needs Swarm ID calls the `useSwarmId()` hook (§3), which
calls `ensureInit()` on mount. The first caller triggers the real
initialization; every other caller (this component re-rendering, or a
totally different component) just awaits the same in-flight promise.

To let components re-render when the connection state changes (someone
connects their wallet in one panel, another panel needs to know), the info
is exposed via **`useSyncExternalStore`**, subscribing to a plain
`Set<callback>`:

```ts
export function useSwarmId() {
  const info = useSyncExternalStore(
    (callback) => { infoListeners.add(callback); return () => infoListeners.delete(callback); },
    () => latestInfo,
    () => null // server snapshot — SSR never has a connection
  );

  useEffect(() => {
    ensureInit().catch((err) => console.error("Swarm ID init failed:", err));
  }, []);

  // … connect/upload/download callbacks, see §3–5
}
```

**Gotcha:** `useSyncExternalStore`'s server-snapshot function must return a
**stable reference** across renders, or React logs an infinite-loop warning
during hydration. `() => null` is stable because `null` is a primitive; if
you're returning an array or object (see the activity log in §7), you need
a module-level constant, not a fresh literal each call.

---

## 3. The hook's surface

`useSwarmId()` returns everything a component needs:

```ts
const { info, connect, uploadFile, uploadFolder, downloadFile, actUploadFile, actDownloadFile } = useSwarmId();
```

| Field | What it does |
|---|---|
| `info` | Current `ConnectionInfo` — `null` until connected. Check `info?.identity` (are we authenticated?) and `info.canUpload` (authenticated *and* have a usable postage stamp — these are separate: `info.uploadUnavailableReason` explains why not). |
| `connect()` | Opens Swarm ID's own auth flow (a popup). Only needed before an upload — downloads work unauthenticated. |
| `uploadFile(file)` | Upload one `File`, get back `{ reference }`. |
| `uploadFolder(files, onProgress?)` | Upload a whole folder as a Mantaray manifest — see §6. |
| `downloadFile(reference, path?)` | Download by reference; `path` walks into a manifest (used for single-file's own wrapper manifest, not for folders — see §6's ending). |
| `actUploadFile(file, grantees)` | Conditional-disclosure encrypted upload — see §5. |
| `actDownloadFile(ref, historyRef, publisherKey)` | Decrypt and download an ACT-uploaded file. |

Every one of these follows the same shape: `await ensureInit()` first, then
`await getClient()`, then the real SDK call, wrapped in a log entry (§7).

---

## 4. Plain uploads and downloads

```ts
const uploadFile = useCallback(async (file: File) => {
  await ensureInit();
  pushLog({ action: "upload", status: "start", detail: `${file.name} (${file.size} bytes)` });
  try {
    const c = await getClient();
    const result = await c.uploadFile(file); // { reference }
    pushLog({ action: "upload", status: "ok", detail: `${file.name} → ${result.reference}` });
    return result;
  } catch (err) {
    pushLog({ action: "upload", status: "error", detail: String(err) });
    throw err;
  }
}, []);
```

`result.reference` is a 64-character hex string — that's the only thing
this app ever persists (as a field on the Arkiv commit entity). Nothing
else about the upload — no batch ID, no signer — leaves the browser.

`downloadFile` is symmetric and, notably, **doesn't require `connect()`
first** — plain downloads are unauthenticated reads. Only uploads (which
spend the connected identity's postage stamp) need an authenticated
session.

---

## 5. Conditional disclosure (ACT)

Swarm's Access Control Trie lets you encrypt content for a specific list of
recipients (by public key) without this app ever holding the decryption
key:

```ts
const actUploadFile = useCallback(async (file: File, grantees: string[]): Promise<ActUploadResult> => {
  await ensureInit();
  const c = await getClient();
  const bytes = new Uint8Array(await file.arrayBuffer());
  return c.actUploadData(bytes, grantees); // { encryptedReference, historyReference, publisherPubKey, … }
}, []);
```

Reading it back needs three pieces, all stored alongside the commit:
`encryptedReference` (in place of the plain `fileRef`), `historyReference`,
and `publisherPubKey`. `actDownloadFile` hands all three back to the SDK,
which does the actual decryption inside the iframe — this app's code never
sees the plaintext key or the recipient's private key. An unauthorized
viewer gets a genuine decrypt failure, not a client-side "access denied"
that was actually just a UI gate.

**Validation gotcha:** `historyReference` can itself be either a plain
64-hex-char reference *or* a 128-hex-char one (address + encryption key,
when the history itself is encrypted). If you validate this field's shape
server-side, accept both lengths — a regex that only allows 64 will reject
real ACT uploads.

---

## 6. Folder uploads: the part with no SDK method

`@snaha/swarm-id`'s client has `uploadFile`, `uploadData`, `uploadChunk` —
**no folder/collection upload**. A "folder" on Swarm is a **Mantaray
manifest**: a trie mapping relative paths to content references, which any
Bee gateway can serve at `/bzz/<root>/`. Building one is on you.

### 6.1 — Collect the files and compute their manifest paths

`webkitdirectory` gives you a `FileList` where each file's
`webkitRelativePath` includes the picked folder's own name as the first
segment (`"my-site/dist/index.html"`). Drop it, so `index.html` can sit at
the manifest's root:

```ts
const entries = files
  .map((file) => ({
    file,
    path: (file.webkitRelativePath || file.name).split("/").slice(1).join("/"),
  }))
  .filter((e) => e.path && !FOLDER_SKIP.test(e.path)); // .git, node_modules, .env, .DS_Store, .next/cache
```

### 6.2 — Upload every file, build the tree

```ts
const { MantarayNode } = await import("@ethersphere/bee-js");

const node = new MantarayNode();
let hasIndex = false;

for (const { file, path } of entries) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { reference } = await client.uploadData(bytes, { deferred }); // NOT uploadFile — see below

  node.addFork(path, String(reference), {
    "Content-Type": file.type || FOLDER_MIME[extensionOf(path)] || "application/octet-stream",
    Filename: path.split("/").pop()!,
  });

  if (path === "index.html") hasIndex = true;
}

// Makes /bzz/<root>/ serve index.html instead of 404-ing on the bare root.
if (hasIndex) {
  node.addFork("/", new Uint8Array(32), { "website-index-document": "index.html" });
}
```

**Why `uploadData`, not `uploadFile`:** `uploadFile` wraps its bytes in
*its own* single-file manifest (so a bare reference to it resolves via
`/bzz/`). Nesting that manifest inside your folder's manifest breaks path
resolution — you want the raw content reference for each leaf, which is
exactly what `uploadData` gives you.

### 6.3 — Serialize the tree: the bug that cost the most time

This is the one part of this integration that looked right, compiled
clean, and still silently produced content that could never be read back.
`@snaha/swarm-id` exports **two** functions for this, and picking the wrong
one is not obviously wrong:

```ts
// ❌ saveMantarayTree — computes each node's address LOCALLY by hashing
// its marshaled bytes, then discards whatever reference the actual upload
// call returns.
const { rootReference } = await saveMantarayTree(node, async (chunkData) => {
  await client.uploadChunk(chunkData, { deferred });
  return {}; // no reference passed back — and none is used
});
```

If the iframe-mediated `uploadChunk` call ever stores those bytes under any
address other than what the local hash predicted, `rootReference` points at
content that was **never actually written there**. The upload reports
success. The receipt looks fine. Then it 404s — on every public gateway,
and through this app's own client — forever, because there's nothing wrong
with your network or your postage stamp: the reference was just never
correct to begin with. This is exactly what happened during development,
and it took directly decompiling the SDK's bundled source to find, because
the failure mode (a clean success, followed by a 404 with no further
detail) gives no hint that the bug is at upload time, not read time.

```ts
// ✅ saveMantarayTreeRecursively — uploads each node's raw bytes via
// uploadData (the same call already proven to work for real file content)
// and trusts THAT call's returned reference.
const { rootReference } = await saveMantarayTreeRecursively(node, async (data) => {
  const result = await client.uploadData(data, { deferred });
  return { reference: result.reference }; // the address that's ACTUALLY stored under
});
```

The library's own doc comment gives it away in hindsight: `saveMantarayTreeRecursively`
"uses Bee's returned references to avoid address mismatches" — a class of
bug the SDK authors clearly knew about and built an escape hatch for. If
you're building a manifest with this SDK, **use the function whose docs
mention avoiding address mismatches**, not the one that merely uploads
faster by trusting local math.

This also incidentally fixes a second, smaller issue: `uploadChunk` caps a
single call at one raw chunk (~4KB); `uploadData` chunks arbitrarily large
input for you, so a manifest for a many-file folder can't silently
truncate either.

### 6.4 — Detecting `dev` mode

```ts
let deferred = false;
try {
  deferred = (await client.getNodeInfo()).beeMode === "dev";
} catch { /* keep false */ }
```

Deferred uploads are required on a dev-mode Bee node (a common default for
a fresh identity — effectively a local sandbox). Surface this in whatever
result you return; it's a useful signal for "why might this not show up on
a public gateway" without waiting for a user to report it.

### 6.5 — Reading a folder back: use a real gateway, not the SDK's own walker

This is the second hard-won lesson, discovered *after* the manifest bug
above was already fixed: `client.downloadFile()` resolves a manifest by
walking it one chunk-fetch at a time
(`loadMantarayTreeWithChunkAPI` → recursively fetch every node's own
sub-chunk). That path turned out to be **independently flaky** — observed
intermittent `500`s — for content that a real Bee gateway resolved
correctly and instantly (confirmed directly: the same reference reported
`Website, 3 items` on a public gateway while `downloadFile()` 500'd on it).

Every *other* file type in this app reads back through Swarm ID's own
client, specifically to avoid depending on any public gateway's own
reachability. Folders are the deliberate exception — a real gateway that
resolves the whole manifest server-side in one request turned out to be
the more reliable path here:

```ts
// commit-file-link.tsx — folders link out instead of downloading in-app.
<a href={`https://gateway.ethswarm.org/access/${fileRef}`} target="_blank" rel="noreferrer">
  📁 {fileName} ↗
</a>
```

If you hit unexplained failures reading back multi-chunk content through
an SDK's own client-side manifest walker, try the same reference against a
plain public gateway before assuming your upload is broken — it may not
be.

---

## 7. The activity log — proof this isn't a mock

Every action above calls `pushLog(...)` before and after the real SDK call.
This isn't decorative: it's what makes "this app never sees a key, but it
really does talk to Swarm" verifiable by looking at the screen instead of
trusting the README.

```ts
export type SwarmLogEntry = {
  id: number;
  time: number;
  action: "init" | "connect" | "upload" | "upload-folder" | "download" | "act-upload" | "act-download";
  detail: string;
  status: "start" | "ok" | "error";
};

let nextLogId = 1;
const EMPTY_LOG: SwarmLogEntry[] = []; // stable reference — see the useSyncExternalStore gotcha below
let log: SwarmLogEntry[] = EMPTY_LOG;
const logListeners = new Set<() => void>();

function pushLog(entry: Omit<SwarmLogEntry, "id" | "time">) {
  log = [{ id: nextLogId++, time: Date.now(), ...entry }, ...log].slice(0, 30);
  for (const listener of logListeners) listener();
}

export function useSwarmLog(): SwarmLogEntry[] {
  return useSyncExternalStore(
    (callback) => { logListeners.add(callback); return () => logListeners.delete(callback); },
    () => log,
    () => EMPTY_LOG // NOT `() => []` — a fresh array every call trips React's infinite-loop check
  );
}
```

A component (`swarm-activity-log.tsx`) just renders `useSwarmLog()` as a
scrolling list. There's no mock mode in this app — if you can see a real
Swarm reference and a real tx hash appear in the log after clicking a
button, that's the actual round trip, not a canned response.

---

## 8. Checklist for adding this to a new app

1. `npm install @snaha/swarm-id @ethersphere/bee-js` (the second only if
   you need folder uploads).
2. One client module, `"use client"` at the top, **type-only** static
   imports from `@snaha/swarm-id`; every real import of it is a dynamic
   `await import(...)` inside a function.
3. Module-level singletons for the client, connection info, and the init
   promise — not React state. Expose connection info via
   `useSyncExternalStore` with a stable server-snapshot value.
4. `ensureInit()` — memoize the init promise so concurrent callers share
   one `initialize()` call.
5. Every SDK call wrapped: `await ensureInit()` → `await getClient()` →
   the real call → return/throw. Log around it if you want a visible
   activity trail.
6. Only ever persist the **reference** (and, for ACT, the history
   reference + publisher key) — never anything else the SDK hands back.
7. If you need folder uploads: build the manifest with `MantarayNode` +
   `addFork`, serialize with **`saveMantarayTreeRecursively`** (not
   `saveMantarayTree`), and read folders back through a public gateway
   rather than the client's own manifest walker.
