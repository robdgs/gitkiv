"use client";
// Client-side only. Identity, postage stamp resolution and signing all
// happen inside the Swarm ID iframe (swarm-id.snaha.net) — this app never
// sees a batch id or a private key. We only ever call uploadFile/downloadFile
// and get back a Swarm reference (a content hash), which is what gets
// stored on Arkiv as a pointer.
//
// The SDK touches `window` at module-evaluation time, which crashes if it's
// ever imported during Next's server-side module graph pass — even for a
// "use client" file. Loading it with a dynamic import() inside functions
// (never at top level) keeps that import from running anywhere but the
// browser, after mount.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { SwarmIdClient as SwarmIdClientType, ConnectionInfo } from "@snaha/swarm-id";

let client: SwarmIdClientType | null = null;
let latestInfo: ConnectionInfo | null = null;
let initPromise: Promise<void> | null = null;
const infoListeners = new Set<() => void>();

function notifyInfo() {
  for (const listener of infoListeners) listener();
}

// ---- activity log: proof this is really talking to Swarm, not a mock ----

export type SwarmLogEntry = {
  id: number;
  time: number; // epoch ms
  action: "init" | "connect" | "upload" | "upload-folder" | "download" | "act-upload" | "act-download";
  detail: string;
  status: "start" | "ok" | "error";
};

export type ActUploadResult = {
  encryptedReference: string;
  historyReference: string;
  publisherPubKey: string;
  actReference: string;
  granteeListReference: string;
};

// `deferred` is surfaced (not just used internally) because it's the one
// signal that predicts whether a public gateway will ever see this content:
// a dev-mode Bee node is typically a local sandbox with no real network
// connectivity, so a root reference stored there can 404 on
// api.gateway.ethswarm.org forever, not just "for a minute while it
// propagates" — the same-node round trip via downloadFile is the read path
// that's actually guaranteed to work regardless.
export type FolderUploadResult = {
  rootReference: string;
  fileCount: number;
  deferred: boolean;
  // False means no "index.html" sat directly inside the folder you picked
  // (after dropping its own top-level name) — a common cause is selecting
  // a project root instead of its build output (dist/, build/), where
  // index.html lives one level deeper. The upload still succeeds either
  // way; there's just no default entry point for /bzz/<ref>/ to serve.
  hasIndex: boolean;
  // The exact paths written into the manifest, after dropping the
  // selected folder's own top-level name — the ground truth for "why
  // didn't it find index.html," shown directly in the UI so nobody has to
  // guess which real folder got picked or dig through devtools.
  paths: string[];
};

// Guardrails for the demo: this uploads a build output (dist/, build/), not
// a repo — no node_modules/.git, and small enough that a single postage
// stamp and a sequential upload loop stay reasonable.
export const MAX_FOLDER_FILES = 200;
export const MAX_FOLDER_TOTAL_BYTES = 15 * 1024 * 1024; // 15MB

const FOLDER_MIME: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  map: "application/json",
  xml: "application/xml",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  txt: "text/plain",
  md: "text/markdown",
  wasm: "application/wasm",
};

// Never ship these to a public network.
const FOLDER_SKIP = /(^|\/)(\.git|node_modules|\.env|\.DS_Store|\.next\/cache)(\/|$)/;

// A "folder" on Swarm is a Mantaray manifest: every file uploaded
// individually, then a trie of path -> reference serialised into its own
// chunks and uploaded bottom-up. Swarm ID's client has no folder-upload
// method of its own (only uploadData/uploadFile/uploadChunk) — this builds
// the manifest by hand with bee-js's MantarayNode, the same shape Bee's own
// /bzz/ endpoint expects. Dynamic imports, same reasoning as getClient():
// both packages touch things that must never load during Next's SSR pass.
async function uploadFolderToSwarm(
  client: SwarmIdClientType,
  files: File[],
  onProgress?: (done: number, total: number, path: string) => void
): Promise<FolderUploadResult> {
  if (!client.connectionInfo.canUpload) {
    throw new Error("No postage stamp on this identity — uploads are unavailable.");
  }

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (files.length > MAX_FOLDER_FILES) {
    throw new Error(`Too many files (${files.length}) — keep it under ${MAX_FOLDER_FILES}. Upload a build output, not a repo.`);
  }
  if (totalBytes > MAX_FOLDER_TOTAL_BYTES) {
    throw new Error(
      `Folder is too large (${(totalBytes / 1024 / 1024).toFixed(1)}MB) — keep it under ${MAX_FOLDER_TOTAL_BYTES / 1024 / 1024}MB.`
    );
  }

  const { MantarayNode } = await import("@ethersphere/bee-js");
  const { saveMantarayTreeRecursively } = await import("@snaha/swarm-id");

  // Dev-mode Bee nodes require deferred uploads.
  let deferred = false;
  try {
    deferred = (await client.getNodeInfo()).beeMode === "dev";
  } catch {
    // keep false
  }

  // "my-repo/dist/index.html" -> "dist/index.html". Drop the top-level
  // folder name so index.html can sit at the manifest root.
  const entries = files
    .map((file) => ({
      file,
      path: (file.webkitRelativePath || file.name).split("/").slice(1).join("/"),
    }))
    .filter((e) => e.path && !FOLDER_SKIP.test(e.path));

  if (entries.length === 0) throw new Error("No uploadable files in that folder.");

  const node = new MantarayNode();
  let hasIndex = false;
  let done = 0;

  for (const { file, path } of entries) {
    const bytes = new Uint8Array(await file.arrayBuffer());

    // uploadData, not uploadFile: uploadFile wraps the bytes in its own
    // manifest, and nesting that inside the folder manifest breaks /bzz
    // resolution.
    const { reference } = await client.uploadData(bytes, { deferred });

    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    node.addFork(path, String(reference), {
      "Content-Type": file.type || FOLDER_MIME[ext] || "application/octet-stream",
      Filename: path.split("/").pop()!,
    });

    if (path === "index.html") hasIndex = true;
    onProgress?.(++done, entries.length, path);
  }

  // Root metadata: makes /bzz/<root>/ serve index.html instead of 404.
  if (hasIndex) {
    node.addFork("/", new Uint8Array(32), { "website-index-document": "index.html" });
  }

  // saveMantarayTreeRecursively, not saveMantarayTree: the latter hashes
  // each node's marshaled bytes *locally* to predict its address, then
  // never checks that against what actually got stored — it only hands
  // uploadChunk the framed bytes and discards the reference the server
  // returns. If the iframe-mediated upload stores those bytes under any
  // address other than what that local hash predicts, the resulting
  // rootReference points at content that was never really written there:
  // an upload that "succeeds" but 404s everywhere forever after, on the
  // public gateway and through this same client. saveMantarayTreeRecursively
  // instead uploads the raw marshaled node via uploadData (same call every
  // single-file commit already uses successfully) and trusts *its*
  // returned reference, so the manifest's addresses can't drift from
  // what's actually on the network. It also has no >4KB single-chunk limit
  // the way a raw uploadChunk call does, so a manifest for a
  // many-file folder can't silently truncate either.
  const { rootReference } = await saveMantarayTreeRecursively(node, async (data) => {
    const result = await client.uploadData(data, { deferred });
    return { reference: result.reference };
  });

  // No post-upload read-back check here: Swarm ID's own downloadFile()
  // walks the manifest one chunk-fetch at a time (loadMantarayTreeWithChunkAPI),
  // which is independently flaky (observed intermittent 500s) regardless of
  // whether the content is actually fine — confirmed directly against a
  // real upload that a public gateway resolved correctly (Website, right
  // file count) while this same check reported it as unreadable. Trusting
  // that check would reject good uploads; there's nothing more reliable to
  // verify against from here, so report success once the manifest is built.
  return { rootReference, fileCount: entries.length, deferred, hasIndex, paths: entries.map((e) => e.path) };
}

let nextLogId = 1;
const EMPTY_LOG: SwarmLogEntry[] = [];
let log: SwarmLogEntry[] = EMPTY_LOG;
const logListeners = new Set<() => void>();

function pushLog(entry: Omit<SwarmLogEntry, "id" | "time">) {
  const full: SwarmLogEntry = { id: nextLogId++, time: Date.now(), ...entry };
  log = [full, ...log].slice(0, 30);
  console.log(`[swarm-id] ${entry.action} ${entry.status}: ${entry.detail}`);
  for (const listener of logListeners) listener();
}

export function useSwarmLog(): SwarmLogEntry[] {
  return useSyncExternalStore(
    (callback) => {
      logListeners.add(callback);
      return () => logListeners.delete(callback);
    },
    () => log,
    () => EMPTY_LOG
  );
}

async function getClient(): Promise<SwarmIdClientType> {
  if (!client) {
    const { SwarmIdClient } = await import("@snaha/swarm-id");
    client = new SwarmIdClient({
      iframeOrigin: "https://swarm-id.snaha.net",
      metadata: {
        name: "gitkiv",
        description: "Git-style commit history on Arkiv, file contents on Swarm.",
      },
      onConnectionChange: (info) => {
        latestInfo = info;
        notifyInfo();
      },
    });
  }
  return client;
}

function ensureInit(): Promise<void> {
  if (!initPromise) {
    pushLog({ action: "init", status: "start", detail: "loading swarm-id.snaha.net iframe" });
    initPromise = getClient()
      .then((c) => c.initialize())
      .then(() => {
        pushLog({ action: "init", status: "ok", detail: "iframe ready" });
      })
      .catch((err) => {
        pushLog({ action: "init", status: "error", detail: String(err) });
        throw err;
      });
  }
  return initPromise;
}

export function useSwarmId() {
  const info = useSyncExternalStore(
    (callback) => {
      infoListeners.add(callback);
      return () => infoListeners.delete(callback);
    },
    () => latestInfo,
    () => null
  );

  useEffect(() => {
    ensureInit().catch((err) => console.error("Swarm ID init failed:", err));
  }, []);

  const connect = useCallback(async () => {
    await ensureInit();
    pushLog({ action: "connect", status: "start", detail: "opening Swarm ID auth" });
    try {
      const c = await getClient();
      await c.connect();
      pushLog({ action: "connect", status: "ok", detail: c.connectionInfo.identity?.name ?? "connected" });
    } catch (err) {
      pushLog({ action: "connect", status: "error", detail: String(err) });
      throw err;
    }
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    await ensureInit();
    pushLog({ action: "upload", status: "start", detail: `${file.name} (${file.size} bytes)` });
    try {
      const c = await getClient();
      const result = await c.uploadFile(file);
      pushLog({ action: "upload", status: "ok", detail: `${file.name} → ${result.reference}` });
      return result;
    } catch (err) {
      pushLog({ action: "upload", status: "error", detail: String(err) });
      throw err;
    }
  }, []);

  const uploadFolder = useCallback(
    async (files: File[], onProgress?: (done: number, total: number, path: string) => void) => {
      await ensureInit();
      pushLog({ action: "upload-folder", status: "start", detail: `${files.length} file(s)` });
      try {
        const c = await getClient();
        const result = await uploadFolderToSwarm(c, files, onProgress);
        pushLog({
          action: "upload-folder",
          status: "ok",
          detail: `${result.fileCount} file(s) → ${result.rootReference}${
            result.deferred ? " (dev-mode node — may not reach a public gateway)" : ""
          }${result.hasIndex ? "" : ` (no "index.html" among: ${result.paths.join(", ")})`}`,
        });
        return result;
      } catch (err) {
        pushLog({ action: "upload-folder", status: "error", detail: String(err) });
        throw err;
      }
    },
    []
  );

  // `path` resolves a file inside a Mantaray manifest (a folder's or a
  // single uploadFile()'s own wrapper). Not used for reading folders back
  // in this app, though — that manifest walk (loadMantarayTreeWithChunkAPI)
  // is independently flaky, so folders link out to a real Bee gateway
  // instead (see commit-file-link.tsx). Kept general-purpose here for
  // whatever else might need to resolve a manifest path directly.
  const downloadFile = useCallback(async (reference: string, path?: string) => {
    await ensureInit();
    pushLog({ action: "download", status: "start", detail: path ? `${reference} (${path})` : reference });
    try {
      const c = await getClient();
      const result = await c.downloadFile(reference, path);
      pushLog({ action: "download", status: "ok", detail: `${result.name} (${result.data.length} bytes)` });
      return result;
    } catch (err) {
      pushLog({ action: "download", status: "error", detail: String(err) });
      throw err;
    }
  }, []);

  // Conditional disclosure: encrypts the file and wraps it in an Access
  // Control Trie. Only the listed grantees (public keys) and the publisher
  // can ever decrypt it — this app never holds the decryption key.
  const actUploadFile = useCallback(async (file: File, grantees: string[]): Promise<ActUploadResult> => {
    await ensureInit();
    pushLog({
      action: "act-upload",
      status: "start",
      detail: `${file.name} (${file.size} bytes) → ${grantees.length} grantee(s)`,
    });
    try {
      const c = await getClient();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await c.actUploadData(bytes, grantees);
      pushLog({
        action: "act-upload",
        status: "ok",
        detail: `${file.name} → encrypted ${result.encryptedReference}`,
      });
      return result;
    } catch (err) {
      pushLog({ action: "act-upload", status: "error", detail: String(err) });
      throw err;
    }
  }, []);

  const actDownloadFile = useCallback(
    async (encryptedReference: string, historyReference: string, publisherPubKey: string) => {
      await ensureInit();
      pushLog({ action: "act-download", status: "start", detail: encryptedReference });
      try {
        const c = await getClient();
        const data = await c.actDownloadData(encryptedReference, historyReference, publisherPubKey);
        pushLog({ action: "act-download", status: "ok", detail: `decrypted ${data.length} bytes` });
        return data;
      } catch (err) {
        pushLog({ action: "act-download", status: "error", detail: String(err) });
        throw err;
      }
    },
    []
  );

  return { info, connect, uploadFile, uploadFolder, downloadFile, actUploadFile, actDownloadFile };
}
