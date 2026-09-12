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
  action: "init" | "connect" | "upload" | "download" | "act-upload" | "act-download";
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

  const downloadFile = useCallback(async (reference: string) => {
    await ensureInit();
    pushLog({ action: "download", status: "start", detail: reference });
    try {
      const c = await getClient();
      const result = await c.downloadFile(reference);
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

  return { info, connect, uploadFile, downloadFile, actUploadFile, actDownloadFile };
}
